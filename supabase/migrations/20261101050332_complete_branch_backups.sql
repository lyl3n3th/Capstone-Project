-- Branch recovery is backend-only. Shared identity/accounts and backup history are excluded.
create function public.branch_backup_tables(p_id uuid, p_name text)
returns table (ordinal integer, table_name text, predicate text, catalog boolean)
language sql stable security invoker set search_path = public
as $body$ values
(0, 'academic_programs', 'true', true),
(1, 'program_tracks', 'true', true),
(2, 'admission_student_statuses', 'true', true),
(3, 'admission_honors', 'true', true),
(4, 'admission_requirement_types', 'true', true),
(5, 'admission_requirement_rules', 'true', true),
(6, 'program_offerings', format('branch_id = %L::uuid',p_id), false),
(7, 'branch_track_offerings', format('branch_id = %L::uuid',p_id), false),
(8, 'admission_portal_statuses', format('branch_id = %L::uuid',p_id), false),
(9, 'branch_assignment_rooms', format('branch_id = %L::uuid',p_id), false),
(10, 'branch_academic_subjects', format('branch_id = %L::uuid',p_id), false),
(11, 'branch_academic_instructors', format('branch_id = %L::uuid',p_id), false),
(12, 'branch_instructor_passwords', format('branch_id = %L::uuid',p_id), false),
(13, 'branch_class_sections', format('branch_id = %L::uuid',p_id), false),
(14, 'branch_subject_assignments', format('branch_id = %L::uuid',p_id), false),
(15, 'admission_applications', format('branch_id = %L::uuid',p_id), false),
(16, 'student_profiles', format('branch_id = %L::uuid',p_id), false),
(17, 'branch_student_number_settings', format('branch_id = %L::uuid',p_id), false),
(18, 'branch_student_planning_states', format('branch_id = %L::uuid',p_id), false),
(19, 'branch_student_subject_plans', format('branch_id = %L::uuid',p_id), false),
(20, 'branch_student_schedule_requests', format('branch_id = %L::uuid',p_id), false),
(21, 'branch_enrollment_requests', format('branch_id = %L::uuid',p_id), false),
(22, 'branch_student_grade_records', format('branch_id = %L::uuid',p_id), false),
(23, 'instructor_grade_submissions', format('branch_id = %L::uuid',p_id), false),
(24, 'student_payments', format('branch_id = %L::uuid',p_id), false),
(25, 'branch_local_storage_records', format('branch_id = %L::uuid',p_id), false),
(26, 'branch_academic_subject_prerequisites', format('subject_row_id in (select id from public.branch_academic_subjects where branch_id = %L::uuid)',p_id), false),
(27, 'branch_subject_assignment_slots', format('assignment_id in (select id from public.branch_subject_assignments where branch_id = %L::uuid)',p_id), false),
(28, 'admission_application_requirement_files', format('application_id in (select id from public.admission_applications where branch_id = %L::uuid)',p_id), false),
(29, 'student_contact_details', format('student_id in (select id from public.student_profiles where branch_id = %L::uuid)',p_id), false),
(30, 'student_import_details', format('student_id in (select id from public.student_profiles where branch_id = %L::uuid)',p_id), false),
(31, 'student_portal_accounts', format('student_id in (select id from public.student_profiles where branch_id = %L::uuid)',p_id), false),
(32, 'evaluation_questionnaire_categories', format('branch = %L',p_name), false),
(33, 'evaluation_questionnaire_questions', format('branch = %L',p_name), false),
(34, 'instructor_evaluation_periods', format('branch = %L',p_name), false),
(35, 'instructor_evaluation_statuses', format('branch = %L',p_name), false),
(36, 'instructor_evaluation_submissions', format('branch = %L',p_name), false); $body$;

create function public.export_branch_backup_data(p_branch text) returns jsonb
language plpgsql stable security invoker set search_path = public
as $body$
declare b public.admission_branches; t record; rows jsonb; tables jsonb := '{}';
begin
  select * into strict b from public.admission_branches where lower(name)=lower(trim(p_branch)) or lower(code)=lower(trim(p_branch));
  for t in select * from public.branch_backup_tables(b.id,b.name) order by ordinal loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where %s',t.table_name,t.predicate) into rows;
    tables := tables || jsonb_build_object(t.table_name,rows);
  end loop;
  return jsonb_build_object('version',2,'branch_id',b.id,'branch',b.name,'tables',tables);
end; $body$;

create function public.restore_branch_backup_data(p_branch text, p_snapshot jsonb) returns jsonb
language plpgsql security invoker set search_path = public
as $body$
declare b public.admission_branches; t record; rows jsonb; columns text; selected_columns text; count_bad bigint;
        track_states jsonb; branch_active boolean; counts jsonb := '{}'; expected_tables integer;
        outside_before jsonb := '{}'; outside_rows jsonb; row_value jsonb; column_names text[];
begin
  select * into strict b from public.admission_branches where lower(name)=lower(trim(p_branch)) or lower(code)=lower(trim(p_branch));
  if p_snapshot->>'version' is distinct from '2' or p_snapshot->>'branch_id' is distinct from b.id::text or p_snapshot->>'branch' is distinct from b.name then
    raise exception 'Backup version or branch does not match the restore target.';
  end if;
  if jsonb_typeof(p_snapshot->'tables') is distinct from 'object' then raise exception 'Backup tables are missing.'; end if;
  select count(*) into expected_tables from public.branch_backup_tables(b.id,b.name);
  if (select count(*) from jsonb_object_keys(p_snapshot->'tables')) <> expected_tables then raise exception 'Backup table set does not match this schema.'; end if;
  -- Fail before any deletion if a table is missing or contains records from another branch.
  for t in select * from public.branch_backup_tables(b.id,b.name) order by ordinal loop
    rows := p_snapshot->'tables'->t.table_name;
    if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Missing table: %',t.table_name; end if;
    select array_agg(attname::text order by attname) into column_names from pg_attribute where attrelid=('public.'||t.table_name)::regclass and attnum>0 and not attisdropped and attgenerated='';
    for row_value in select value from jsonb_array_elements(rows) loop
      if jsonb_typeof(row_value) is distinct from 'object' then raise exception 'Invalid row in %.',t.table_name; end if;
      if (select array_agg(key order by key) from jsonb_object_keys(row_value) key) is distinct from column_names then
        raise exception 'Backup columns do not match current schema in %.',t.table_name;
      end if;
    end loop;
    if not t.catalog then
      -- Validate child ownership against the archived parents, including cross-branch IDs.
      if t.table_name in ('branch_academic_subject_prerequisites','branch_subject_assignment_slots','admission_application_requirement_files','student_contact_details','student_import_details','student_portal_accounts') then
        continue;
      end if;
      execute format('select count(*) from jsonb_populate_recordset(null::public.%I,$1) r where not (%s) or (%s) is null',t.table_name,t.predicate,t.predicate) into count_bad using rows;
      if count_bad > 0 then raise exception 'Backup contains records outside the target branch in %.',t.table_name; end if;
    end if;
  end loop;
  -- Prevent concurrent writers changing a target table between replacement steps.
  perform pg_advisory_xact_lock(hashtextextended('branch-backup:'||b.id::text,0));
  for t in select * from public.branch_backup_tables(b.id,b.name) order by ordinal loop
    execute format('lock table public.%I in share row exclusive mode',t.table_name);
  end loop;
  for t in select * from public.branch_backup_tables(b.id,b.name) where not catalog order by ordinal loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), ''[]''::jsonb) from public.%I r where not (%s)',t.table_name,t.predicate) into outside_rows;
    outside_before := outside_before || jsonb_build_object(t.table_name,outside_rows);
  end loop;
  for t in select * from public.branch_backup_tables(b.id,b.name) where not catalog order by ordinal desc loop
    execute format('delete from public.%I where %s',t.table_name,t.predicate);
  end loop;
  -- Preserve catalog availability while restoring historical, now-inactive offerings.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'is_active',is_active)),'[]') into track_states from public.program_tracks;
  branch_active := b.is_active;
  update public.admission_branches set is_active=true where id=b.id;
  for t in select * from public.branch_backup_tables(b.id,b.name) order by ordinal loop
    rows := p_snapshot->'tables'->t.table_name;
    select string_agg(quote_ident(attname),',' order by attnum),string_agg('r.'||quote_ident(attname),',' order by attnum)
      into columns,selected_columns from pg_attribute where attrelid=('public.'||t.table_name)::regclass and attnum>0 and not attisdropped and attgenerated='';
    if t.table_name in ('program_offerings','branch_track_offerings') then
      select coalesce(jsonb_agg(value || jsonb_build_object('is_active',true) || case when t.table_name='branch_track_offerings' then jsonb_build_object('is_deleted',false) else '{}'::jsonb end),'[]') into rows from jsonb_array_elements(rows);
    end if;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) r %s',t.table_name,columns,selected_columns,t.table_name,case when t.catalog then 'on conflict do nothing' else '' end) using rows;
    if t.table_name='program_tracks' then update public.program_tracks set is_active=true; end if;
    counts := counts || jsonb_build_object(t.table_name,jsonb_array_length(rows));
  end loop;
  -- Foreign keys enforce identity; explicitly check child ownership to reject references to another branch.
  for t in select * from public.branch_backup_tables(b.id,b.name) where table_name in ('branch_academic_subject_prerequisites','branch_subject_assignment_slots','admission_application_requirement_files','student_contact_details','student_import_details','student_portal_accounts') loop
    execute format('select count(*) from jsonb_populate_recordset(null::public.%I,$1) r where not (%s)',t.table_name,t.predicate) into count_bad using p_snapshot->'tables'->t.table_name;
    if count_bad>0 then raise exception 'Child record outside target branch in %.',t.table_name; end if;
  end loop;
  if exists(select 1 from public.branch_academic_subject_prerequisites r join public.branch_academic_subjects s on s.id=r.subject_row_id join public.branch_academic_subjects p on p.id=r.prerequisite_subject_row_id where s.branch_id=b.id and p.branch_id<>b.id) then raise exception 'Cross-branch prerequisite.'; end if;
  if exists(select 1 from public.student_profiles s left join public.admission_applications a on a.id=s.admission_application_id join public.program_offerings o on o.id=s.program_offering_id where s.branch_id=b.id and (a.branch_id<>b.id or o.branch_id<>b.id)) then raise exception 'Cross-branch student relationship.'; end if;
  if exists(select 1 from public.admission_applications a join public.program_offerings o on o.id=a.program_offering_id where a.branch_id=b.id and o.branch_id<>b.id) then raise exception 'Cross-branch admission relationship.'; end if;
  if exists(select 1 from public.branch_subject_assignments a join public.branch_academic_subjects s on s.id=a.subject_row_id join public.branch_class_sections c on c.id=a.section_row_id left join public.branch_academic_instructors i on i.id=a.instructor_row_id where a.branch_id=b.id and (s.branch_id<>b.id or c.branch_id<>b.id or i.branch_id<>b.id)) then raise exception 'Cross-branch assignment relationship.'; end if;
  if exists(select 1 from public.evaluation_questionnaire_questions q join public.evaluation_questionnaire_categories c on c.id=q.category_id where q.branch=b.name and c.branch<>b.name) then raise exception 'Cross-branch evaluation relationship.'; end if;
  update public.program_offerings o set is_active=r.is_active from jsonb_populate_recordset(null::public.program_offerings,p_snapshot->'tables'->'program_offerings') r where o.id=r.id;
  update public.branch_track_offerings o set is_active=r.is_active,is_deleted=r.is_deleted from jsonb_populate_recordset(null::public.branch_track_offerings,p_snapshot->'tables'->'branch_track_offerings') r where o.branch_id=r.branch_id and o.track_id=r.track_id;
  update public.program_tracks o set is_active=r.is_active from jsonb_populate_recordset(null::public.program_tracks,p_snapshot->'tables'->'program_tracks') r where o.id=r.id;
  update public.program_tracks o set is_active=(r->>'is_active')::boolean from jsonb_array_elements(track_states) r where o.id=(r->>'id')::uuid;
  update public.admission_branches set is_active=branch_active where id=b.id;
  for t in select * from public.branch_backup_tables(b.id,b.name) where not catalog order by ordinal loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), ''[]''::jsonb) from public.%I r where not (%s)',t.table_name,t.predicate) into outside_rows;
    if outside_rows is distinct from outside_before->t.table_name then raise exception 'Restore would affect another branch in %.',t.table_name; end if;
  end loop;
  return counts;
end; $body$;

revoke all on function public.branch_backup_tables(uuid,text), public.export_branch_backup_data(text), public.restore_branch_backup_data(text,jsonb) from public,anon,authenticated;
grant execute on function public.branch_backup_tables(uuid,text), public.export_branch_backup_data(text), public.restore_branch_backup_data(text,jsonb) to service_role;
