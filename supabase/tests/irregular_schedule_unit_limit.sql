begin;
create temporary table schedule_unit_limit_test
  (like public.branch_student_schedule_requests including defaults);
create trigger schedule_unit_limit_test
before insert or update on schedule_unit_limit_test
for each row execute function public.enforce_irregular_schedule_unit_limit();

do $$
declare
  v_branch uuid;
  v_prefix text := 'unit-limit-test-' || gen_random_uuid()::text;
  v_payload jsonb;
  v_saved jsonb;
begin
  select id into v_branch from public.admission_branches limit 1;
  if v_branch is null then raise exception 'A configured branch is required for this test.'; end if;

  insert into public.branch_academic_subjects
    (branch_id, external_id, code, name, units, program, year_level, semester)
  values
    (v_branch, v_prefix || '-20', v_prefix || '-20', 'Unit limit test', 20, 'College', '1st Year', '1st Semester'),
    (v_branch, v_prefix || '-21', v_prefix || '-21', 'Unit limit test', 21, 'College', '1st Year', '1st Semester'),
    (v_branch, v_prefix || '-missing', v_prefix || '-missing', 'Unit limit test', null, 'College', '1st Year', '1st Semester'),
    (v_branch, v_prefix || '-12', v_prefix || '-12', 'Unit limit test', 12, 'College', '1st Year', '1st Semester'),
    (v_branch, v_prefix || '-8', v_prefix || '-8', 'Leftover unit limit test', 8, 'College', '1st Year', '2nd Semester'),
    (v_branch, v_prefix || '-9', v_prefix || '-9', 'Leftover unit limit test', 9, 'College', '1st Year', '2nd Semester'),
    (v_branch, v_prefix || '-shs', v_prefix || '-shs', 'SHS unit limit test', null, 'SHS', 'Grade 11', '1st Semester');

  -- Exactly 20 is accepted; the server corrects a tampered client unit count.
  v_payload := jsonb_build_object('program', 'College', 'selections',
    jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-20', 'units', 0)));
  insert into schedule_unit_limit_test
    (branch_id, external_id, student_number, academic_year, semester, status, payload)
  values (v_branch, v_prefix, 'test-student', '2026-2027', '1st Semester', 'Pending', v_payload)
  returning payload into v_saved;
  if (v_saved #>> '{selections,0,units}')::numeric <> 20 then
    raise exception 'Catalog units were not enforced.';
  end if;

  -- Over-limit submissions and approvals are both blocked.
  foreach v_payload in array array[
    jsonb_build_object('program', 'College', 'selections', jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-21', 'units', 1))),
    jsonb_build_object('program', 'SHS', 'selections', jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-21', 'units', 1)))
  ] loop
    begin
      insert into schedule_unit_limit_test
        (branch_id, external_id, student_number, academic_year, semester, status, payload)
      values (v_branch, v_prefix, 'test-student', '2026-2027', '1st Semester', 'Pending', v_payload);
      raise exception 'Over-limit submission accepted.';
    exception when others then
      if sqlerrm not like 'Irregular students can request a maximum of 20 units%' then raise; end if;
    end;
    begin
      update schedule_unit_limit_test set payload = v_payload, status = 'Approved';
      raise exception 'Over-limit approval accepted.';
    exception when others then
      if sqlerrm not like 'Irregular students can request a maximum of 20 units%' then raise; end if;
    end;
  end loop;

  -- Leftover subjects count in the requested semester, regardless of catalog semester.
  v_payload := jsonb_build_object('program', 'College', 'selections', jsonb_build_array(
    jsonb_build_object('subjectId', v_prefix || '-12'),
    jsonb_build_object('subjectId', v_prefix || '-8')));
  update schedule_unit_limit_test set payload = v_payload;
  v_payload := jsonb_set(v_payload, '{selections,1,subjectId}', to_jsonb(v_prefix || '-9'));
  begin
    update schedule_unit_limit_test set payload = v_payload;
    raise exception 'Over-limit leftover subjects accepted.';
  exception when others then
    if sqlerrm not like 'Irregular students can request a maximum of 20 units%' then raise; end if;
  end;

  -- Invalid catalog units cannot silently count as zero.
  begin
    update schedule_unit_limit_test set payload = jsonb_build_object('program', 'College', 'selections',
      jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-missing')));
    raise exception 'Missing catalog units accepted.';
  exception when others then
    if sqlerrm not like 'Selected college subjects must have valid catalog units%' then raise; end if;
  end;

  -- Staff can reject an old oversized request.
  update schedule_unit_limit_test set status = 'Rejected', payload = jsonb_build_object('program', 'College', 'selections',
    jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-21')));
  -- SHS scheduling remains available without college unit requirements.
  update schedule_unit_limit_test set status = 'Pending', payload = jsonb_build_object('program', 'SHS', 'selections',
    jsonb_build_array(jsonb_build_object('subjectId', v_prefix || '-shs')));
end;
$$;
rollback;
