-- Fixtures and saved grades are rolled back after validation.
begin;
set local statement_timeout = '15s';
do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_branch_id uuid;
  v_branch_code text;
  v_program_id uuid;
  v_track_id uuid;
  v_track_name text;
  v_offering_id uuid;
  v_status_id uuid;
  v_student_id uuid;
  v_student_number text;
  v_teacher_id text;
  v_records jsonb := '[]'::jsonb;
  v_bad jsonb;
  v_count integer;
  v_index integer;
begin
  v_branch_code := 'historical_batch_test_' || v_suffix;
  v_teacher_id := 'historical-teacher-' || v_suffix;
  insert into public.admission_branches(code, name, student_number_prefix)
    values(v_branch_code, 'Historical Batch Fixture ' || v_suffix,
      public.allocate_branch_student_number_prefix('Historical Batch Fixture', v_branch_code)) returning id into v_branch_id;
  select track.id, program.id, track.name into strict v_track_id, v_program_id, v_track_name
    from public.program_tracks track join public.academic_programs program on program.id = track.program_id
    where track.is_active and program.name = 'College' limit 1;
  insert into public.program_offerings(branch_id, program_id, is_active)
    values(v_branch_id, v_program_id, true) returning id into v_offering_id;
  insert into public.branch_track_offerings(branch_id, track_id) values(v_branch_id, v_track_id);
  select id into strict v_status_id from public.admission_student_statuses where code = 'existing_student';
  v_student_number := public.resolve_student_number_prefix(v_branch_id) || '-000001';
  insert into public.student_profiles(branch_id, student_status_id, program_offering_id, track_id,
    student_number, first_name, last_name, sex, civil_status, year_level)
    values(v_branch_id, v_status_id, v_offering_id, v_track_id, v_student_number,
      'Historical', 'Batch Fixture', 'Male', 'Single', '2nd Year') returning id into v_student_id;
  insert into public.student_import_details(student_id, academic_year, semester, academic_standing, batch_id)
    values(v_student_id, '2026-2027', '1st Semester', 'Regular', gen_random_uuid());
  insert into public.branch_academic_instructors(branch_id, external_id, name, employee_id, department)
    values(v_branch_id, v_teacher_id, 'Original Fixture Teacher', 'TEACHER-' || v_suffix, 'College');
  for v_index in 1..3 loop
    insert into public.branch_academic_subjects(branch_id, external_id, code, name, units, program, year_level, semester, strand)
      values(v_branch_id, 'subject-' || v_index, 'HIST' || v_index, 'Historical Subject ' || v_index,
        3, 'College', '1st Year', '1st Semester', v_track_name);
    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'studentId', v_student_number, 'subjectCode', 'HIST' || v_index,
      'academicYear', '2025-2026', 'semester', '1st Semester', 'gradingPeriod', '1st Semester',
      'yearLevel', '1st Year', 'grade', (80 + v_index)::text, 'instructorId', v_teacher_id, 'recordedBy', 'Test Registrar'));
  end loop;

  perform public.save_imported_student_historical_grades(v_branch_code, v_student_number, v_records);
  select count(*) into v_count from public.branch_student_grade_records where branch_id = v_branch_id;
  assert v_count = 3, 'All three subjects should save in one batch';
  assert not exists(select 1 from public.branch_student_grade_records where branch_id = v_branch_id
    and (payload->>'source' <> 'historical' or payload->>'instructorId' <> v_teacher_id));

  -- An invalid instructor after a valid update must roll back the entire batch.
  v_bad := jsonb_set(jsonb_set(v_records, '{0,grade}', '"95"'), '{1,instructorId}', '"invalid-instructor"');
  begin
    perform public.save_imported_student_historical_grades(v_branch_code, v_student_number, v_bad);
    raise exception 'TEST FAILED: invalid instructor accepted';
  exception when raise_exception then
    if sqlerrm not like '%active instructor%' then raise; end if;
  end;
  assert (select payload->>'grade' from public.branch_student_grade_records where branch_id = v_branch_id and subject_code = 'HIST1') = '81';

  v_bad := jsonb_set(jsonb_set(v_records, '{0,grade}', '"95"'), '{2,grade}', '"101"');
  begin
    perform public.save_imported_student_historical_grades(v_branch_code, v_student_number, v_bad);
    raise exception 'TEST FAILED: invalid grade accepted';
  exception when raise_exception then
    if sqlerrm not like '%50 to 100%' then raise; end if;
  end;
  assert (select payload->>'grade' from public.branch_student_grade_records where branch_id = v_branch_id and subject_code = 'HIST1') = '81';

  -- Uploaded grades stay protected, even after other subjects in the batch.
  update public.branch_student_grade_records set payload = payload - 'source'
    where branch_id = v_branch_id and subject_code = 'HIST3';
  v_bad := jsonb_set(v_records, '{0,grade}', '"95"');
  begin
    perform public.save_imported_student_historical_grades(v_branch_code, v_student_number, v_bad);
    raise exception 'TEST FAILED: uploaded grade overwritten';
  exception when raise_exception then
    if sqlerrm not like '%uploaded grade already exists%' then raise; end if;
  end;
  assert (select payload->>'grade' from public.branch_student_grade_records where branch_id = v_branch_id and subject_code = 'HIST1') = '81';

  begin
    perform public.save_imported_student_historical_grades(v_branch_code, v_student_number, '[]');
    raise exception 'TEST FAILED: empty batch accepted';
  exception when raise_exception then
    if sqlerrm not like '%1 and 500%' then raise; end if;
  end;
end;
$$;
select 'Historical grade multi-subject batch and rollback checks passed' as result;
rollback;
