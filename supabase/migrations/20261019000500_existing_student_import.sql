begin;

insert into public.admission_student_statuses(code, label, is_active)
values ('existing_student', 'Existing Student', true)
on conflict (code) do update set is_active = true;

create table public.student_import_details (
  student_id uuid primary key references public.student_profiles(id) on delete cascade,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  semester text not null check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  academic_standing text not null check (academic_standing in ('Regular', 'Irregular')),
  batch_id uuid not null,
  imported_at timestamptz not null default now()
);
alter table public.student_import_details enable row level security;
revoke all on public.student_import_details from anon, authenticated;

create function public.list_student_import_details(p_branch text default null)
returns table (student_number text, academic_year text, semester text, academic_standing text)
language sql stable security definer set search_path = public
as $$
  select student.student_number, imported.academic_year, imported.semester, imported.academic_standing
  from public.student_import_details imported
  join public.student_profiles student on student.id = imported.student_id
  join public.admission_branches branch on branch.id = student.branch_id
  where p_branch is null or lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch));
$$;

create function public.import_existing_students(p_branch text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_branch_code text;
  v_status_id uuid;
  v_student_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_row jsonb;
  v_index integer := 0;
  v_row_number integer;
  v_field text;
  v_check record;
  v_errors jsonb := '[]'::jsonb;
  v_program_name text;
  v_offering_id uuid;
  v_track_id uuid;
  v_date date;
  v_seen_numbers text[] := array[]::text[];
  v_seen_emails text[] := array[]::text[];
  v_current_field text := 'student_number';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Student rows must be a list.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Import between 1 and 500 students at a time.'; end if;
  -- Serialize imports and changes to this branch. Existing enrollment triggers
  -- perform a final availability check on every newly created active student.
  perform pg_advisory_xact_lock(hashtextextended('aics-existing-student-import', 0));
  select branch.id, branch.name, branch.code into v_branch_id, v_branch_name, v_branch_code
  from public.admission_branches branch where branch.is_active
    and (lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch))) for update;
  if v_branch_id is null then raise exception 'The selected branch is not active.'; end if;
  select id into v_status_id from public.admission_student_statuses where code = 'existing_student' and is_active;
  if v_status_id is null then raise exception 'Existing-student registration is not configured.'; end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_row_number := case when coalesce(v_row->>'row_number', '') ~ '^[0-9]{1,5}$' then (v_row->>'row_number')::integer else v_index + 1 end;
    if jsonb_typeof(v_row) <> 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', 'student_number', 'message', 'Student rows must contain named fields.'));
      continue;
    end if;
    foreach v_field in array array['student_number','first_name','last_name','sex','birth_date','civil_status','email','phone_number','address','program','year_level','track_name','academic_year','branch','semester','academic_standing'] loop
      if trim(coalesce(v_row->>v_field, '')) = '' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', v_field, 'message', 'This field is required.'));
      end if;
    end loop;
    foreach v_field in array array['student_number','first_name','middle_name','last_name','sex','birth_date','civil_status','email','phone_number','address','guardian_name','guardian_contact','program','year_level','track_name','academic_year','branch','semester','academic_standing'] loop
      if char_length(coalesce(v_row->>v_field, '')) > (case when v_field = 'address' then 500 else 160 end) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', v_field, 'message', 'Value is too long.'));
      end if;
    end loop;

    v_program_name := case lower(trim(v_row->>'program')) when 'shs' then 'Senior High School' when 'college' then 'College' else null end;
    v_offering_id := null; v_track_id := null;
    select offering.id, track.id into v_offering_id, v_track_id
    from public.program_offerings offering
    join public.academic_programs program on program.id = offering.program_id
    join public.program_tracks track on track.program_id = program.id
    join public.branch_track_offerings available on available.branch_id = offering.branch_id and available.track_id = track.id
    where offering.branch_id = v_branch_id and program.name = v_program_name
      and offering.is_active and program.is_active and track.is_active and available.is_active and not available.is_deleted
      and lower(track.name) = lower(trim(v_row->>'track_name'));

    for v_check in select * from (values
      ('student_number', case when trim(coalesce(v_row->>'student_number','')) !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,49}$' then 'Use the original school student number, up to 50 letters/digits or . _ / - characters.' end),
      ('student_number', case when upper(trim(v_row->>'student_number')) = any(v_seen_numbers) then 'Duplicate student number in this workbook.' end),
      ('student_number', case when exists(select 1 from public.student_profiles where upper(trim(student_number)) = upper(trim(v_row->>'student_number'))) then 'This student number already exists. Import cannot overwrite an existing student.' end),
      ('email', case when trim(coalesce(v_row->>'email','')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'Enter a valid email address.' end),
      ('email', case when lower(trim(v_row->>'email')) = any(v_seen_emails) then 'Duplicate email in this workbook.' end),
      ('email', case when exists(select 1 from public.student_contact_details where lower(trim(email::text)) = lower(trim(v_row->>'email'))) then 'This email already belongs to a student in the system.' end),
      ('phone_number', case when trim(coalesce(v_row->>'phone_number','')) !~ '^[0-9]{11}$' then 'Enter exactly 11 digits, including the leading zero.' end),
      ('guardian_contact', case when trim(coalesce(v_row->>'guardian_contact','')) <> '' and trim(v_row->>'guardian_contact') !~ '^[0-9]{11}$' then 'Enter exactly 11 digits or leave this optional field blank.' end),
      ('sex', case when lower(trim(coalesce(v_row->>'sex',''))) not in ('male','female') then 'Choose Male or Female.' end),
      ('civil_status', case when lower(trim(coalesce(v_row->>'civil_status',''))) not in ('single','married','widowed','separated') then 'Choose Single, Married, Widowed, or Separated.' end),
      ('program', case when v_program_name is null then 'Choose SHS or College.' end),
      ('year_level', case when (v_program_name = 'Senior High School' and lower(trim(v_row->>'year_level')) not in ('grade 11','grade 12')) or (v_program_name = 'College' and lower(trim(v_row->>'year_level')) not in ('1st year','2nd year','3rd year','4th year')) then 'Grade/year level does not match the educational level.' end),
      ('track_name', case when v_track_id is null then 'This course/strand is not offered by the selected branch.' end),
      ('branch', case when lower(trim(coalesce(v_row->>'branch',''))) not in (lower(v_branch_name),lower(v_branch_code)) then 'The student must belong to the branch currently being managed.' end),
      ('academic_year', case when trim(coalesce(v_row->>'academic_year','')) !~ '^[0-9]{4}-[0-9]{4}$' then 'Use consecutive years in YYYY-YYYY format.' when split_part(trim(v_row->>'academic_year'),'-',2)::integer <> split_part(trim(v_row->>'academic_year'),'-',1)::integer + 1 then 'The end year must be the start year plus one.' end),
      ('semester', case when lower(trim(coalesce(v_row->>'semester',''))) not in ('1st semester','2nd semester','summer') or (v_program_name = 'Senior High School' and lower(trim(v_row->>'semester')) = 'summer') then 'Choose a valid semester. Summer is for College only.' end),
      ('academic_standing', case when lower(trim(coalesce(v_row->>'academic_standing',''))) not in ('regular','irregular') then 'Choose Regular or Irregular.' end)
    ) checks(field, message) where message is not null loop
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', v_check.field, 'message', v_check.message));
    end loop;
    v_seen_numbers := array_append(v_seen_numbers, upper(trim(v_row->>'student_number')));
    v_seen_emails := array_append(v_seen_emails, lower(trim(v_row->>'email')));
    if trim(coalesce(v_row->>'birth_date','')) <> '' then
      begin
        if trim(v_row->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise invalid_datetime_format; end if;
        v_date := trim(v_row->>'birth_date')::date;
        if v_date > timezone('Asia/Singapore',now())::date then raise datetime_field_overflow; end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', 'birth_date', 'message', 'Use a real date in YYYY-MM-DD format, no later than today.'));
      end;
    end if;
    if trim(coalesce(v_row->>'section','')) <> '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row_number', v_row_number, 'field', 'student_number', 'message', 'Sections must be assigned after import. Remove the section value.'));
    end if;
  end loop;
  if jsonb_array_length(v_errors) > 0 then return jsonb_build_object('imported_count',0,'errors',v_errors); end if;

  -- A subtransaction rolls back the complete batch if any concurrent change
  -- or database constraint fails during insertion. Existing students are never updated.
  begin
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_row_number := case when coalesce(v_row->>'row_number','') ~ '^[0-9]{1,5}$' then (v_row->>'row_number')::integer else 2 end;
      v_program_name := case lower(trim(v_row->>'program')) when 'shs' then 'Senior High School' else 'College' end;
      select offering.id, track.id into v_offering_id, v_track_id
      from public.program_offerings offering
      join public.academic_programs program on program.id = offering.program_id
      join public.program_tracks track on track.program_id = program.id
      where offering.branch_id = v_branch_id and program.name = v_program_name and lower(track.name) = lower(trim(v_row->>'track_name'));

      v_current_field := 'student_number';
      insert into public.student_profiles(
        admission_application_id,branch_id,student_status_id,program_offering_id,track_id,student_number,
        first_name,middle_name,last_name,sex,civil_status,year_level,section,status,completion_status,document_submitted_date
      ) values (
        null,v_branch_id,v_status_id,v_offering_id,v_track_id,trim(v_row->>'student_number'),
        trim(v_row->>'first_name'),nullif(trim(v_row->>'middle_name'),''),trim(v_row->>'last_name'),
        initcap(lower(trim(v_row->>'sex'))),initcap(lower(trim(v_row->>'civil_status'))),
        case lower(trim(v_row->>'year_level')) when 'grade 11' then 'Grade 11' when 'grade 12' then 'Grade 12' when '1st year' then '1st Year' when '2nd year' then '2nd Year' when '3rd year' then '3rd Year' else '4th Year' end,
        null,'active','incomplete',null
      ) returning id into v_student_id;
      v_current_field := 'email';
      insert into public.student_contact_details(student_id,email,phone_number,address,birth_date,guardian_name,guardian_contact)
      values(v_student_id,lower(trim(v_row->>'email'))::citext,trim(v_row->>'phone_number'),trim(v_row->>'address'),
        trim(v_row->>'birth_date')::date,nullif(trim(v_row->>'guardian_name'),''),nullif(trim(v_row->>'guardian_contact'),''));
      v_current_field := 'academic_year';
      insert into public.student_import_details(student_id,academic_year,semester,academic_standing,batch_id)
      values(v_student_id,trim(v_row->>'academic_year'),
        case lower(trim(v_row->>'semester')) when '1st semester' then '1st Semester' when '2nd semester' then '2nd Semester' else 'Summer' end,
        initcap(lower(trim(v_row->>'academic_standing'))),v_batch_id);
    end loop;
  exception when others then
    return jsonb_build_object('imported_count',0,'errors',jsonb_build_array(jsonb_build_object(
      'row_number',v_row_number,'field',case when sqlerrm ilike '%course%' or sqlerrm ilike '%strand%' then 'track_name' else v_current_field end,
      'message',case when sqlstate = '23505' then 'A duplicate record was detected. Refresh existing students and check this value.'
        when sqlerrm ilike '%course%' or sqlerrm ilike '%strand%' then 'The course/strand is no longer available. Refresh the import window and review this row.'
        else 'The batch could not be saved. No students were added. Review this row and retry.' end)));
  end;
  return jsonb_build_object('imported_count',jsonb_array_length(p_rows),'errors','[]'::jsonb);
end;
$$;

revoke all on function public.list_student_import_details(text) from public;
revoke all on function public.import_existing_students(text,jsonb) from public;
grant execute on function public.list_student_import_details(text) to anon,authenticated;
grant execute on function public.import_existing_students(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
