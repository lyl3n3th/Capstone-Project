-- Run after the branch_archival_lifecycle migration. All fixtures roll back.
begin;
set local statement_timeout = '15s';
do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_token text := gen_random_uuid()::text;
  v_code text;
  v_branch_id uuid;
  v_account_id uuid;
  v_program_id uuid;
  v_track_id uuid;
  v_offering_id uuid;
  v_status_id uuid;
  v_student_id uuid;
  v_staff_id uuid;
begin
  v_code := 'archive_test_' || v_suffix;
  select id into strict v_account_id from public.area_manager_accounts where is_active limit 1;
  insert into public.area_manager_sessions(account_id, token_hash, expires_at)
    values(v_account_id, extensions.digest(v_token, 'sha256'), now() + interval '5 minutes');

  begin
    perform public.list_archived_area_manager_branches('invalid-session');
    raise exception 'TEST FAILED: unauthorized archive listing succeeded';
  exception when raise_exception then
    if sqlerrm not like '%session has expired%' then raise; end if;
  end;
  begin
    perform public.set_area_manager_branch_archived('invalid-session', v_code, true);
    raise exception 'TEST FAILED: unauthorized archive succeeded';
  exception when raise_exception then
    if sqlerrm not like '%session has expired%' then raise; end if;
  end;
  begin
    perform public.delete_area_manager_branch('invalid-session', v_code);
    raise exception 'TEST FAILED: unauthorized deletion succeeded';
  exception when raise_exception then
    if sqlerrm not like '%session has expired%' then raise; end if;
  end;

  perform public.upsert_area_manager_branch(v_code, 'Archive Test ' || v_suffix);
  select id into strict v_branch_id from public.admission_branches where code = v_code;
  insert into public.branch_academic_subjects(branch_id, external_id, code, name, program, year_level)
    values(v_branch_id, 'test-subject', 'TEST', 'Archive Test Subject', 'College', '1st Year');
  insert into public.branch_academic_instructors(branch_id, external_id, name, employee_id, department)
    values(v_branch_id, 'test-instructor', 'Archive Test Instructor', 'TEST-' || v_suffix, 'College');
  insert into public.staff_accounts(employee_id, branch_id, role, first_name, last_name, email,
    contact_number, address, password_hash)
    values('TEST-' || v_suffix, v_branch_id, 'admin', 'Archive', 'Test',
      v_suffix || '@example.invalid', '09123456789', 'Test', 'unused-test-hash') returning id into v_staff_id;

  begin
    perform public.delete_area_manager_branch(v_token, v_code);
    raise exception 'TEST FAILED: active branch was permanently deleted';
  exception when raise_exception then
    if sqlerrm not like '%Archive this branch%' then raise; end if;
  end;

  select track.id, track.program_id into strict v_track_id, v_program_id
    from public.program_tracks track where track.is_active limit 1;
  select id into strict v_status_id from public.admission_student_statuses where is_active limit 1;
  insert into public.program_offerings(branch_id, program_id, is_active)
    values(v_branch_id, v_program_id, true) returning id into v_offering_id;
  insert into public.branch_track_offerings(branch_id, track_id) values(v_branch_id, v_track_id);
  insert into public.student_profiles(branch_id, student_status_id, program_offering_id, track_id,
    student_number, first_name, last_name, sex, civil_status, year_level)
    values(v_branch_id, v_status_id, v_offering_id, v_track_id, 'TEST-' || v_suffix,
      'Archive', 'Test', 'Male', 'Single', '1st Year') returning id into v_student_id;
  begin
    perform public.set_area_manager_branch_archived(v_token, v_code, true);
    raise exception 'TEST FAILED: branch with enrolled student was archived';
  exception when raise_exception then
    if sqlerrm not like '%has enrolled students%' then raise; end if;
  end;
  assert (select is_active from public.admission_branches where id = v_branch_id);
  update public.student_profiles set status = 'archived' where id = v_student_id;

  perform public.set_area_manager_branch_archived(v_token, v_code, true);
  assert not (select is_active from public.admission_branches where id = v_branch_id);
  assert exists(select 1 from public.list_archived_area_manager_branches(v_token) where code = v_code);
  assert not exists(select 1 from public.list_area_manager_branches() where code = v_code);
  assert exists(select 1 from public.branch_academic_subjects where branch_id = v_branch_id);
  assert exists(select 1 from public.branch_academic_instructors where branch_id = v_branch_id);
  assert exists(select 1 from public.branch_track_offerings where branch_id = v_branch_id and is_active);
  assert exists(select 1 from public.program_offerings where id = v_offering_id and is_active);
  assert exists(select 1 from public.staff_accounts where id = v_staff_id and branch_id = v_branch_id and status = 'inactive');

  begin
    perform public.upsert_area_manager_branch(v_code, 'Archive Test ' || v_suffix);
    raise exception 'TEST FAILED: Add Branch bypassed archive restore';
  exception when raise_exception then
    if sqlerrm not like '%Restore it from Archived Branches%' then raise; end if;
  end;
  begin
    perform public.delete_area_manager_branch(v_token, v_code);
    raise exception 'TEST FAILED: historical student records were deleted';
  exception when raise_exception then
    if sqlerrm not like '%student, admission, or payment records%' then raise; end if;
  end;

  perform public.set_area_manager_branch_archived(v_token, v_code, false);
  assert exists(select 1 from public.list_area_manager_branches() where code = v_code);
  assert not exists(select 1 from public.list_archived_area_manager_branches(v_token) where code = v_code);
  assert exists(select 1 from public.staff_accounts where id = v_staff_id and status = 'inactive');
  assert exists(select 1 from public.branch_academic_subjects where branch_id = v_branch_id);

  -- Delete only fixtures, then verify the permanent delete cleanup.
  delete from public.student_profiles where id = v_student_id;
  perform public.set_area_manager_branch_archived(v_token, v_code, true);
  perform public.delete_area_manager_branch(v_token, v_code);
  assert not exists(select 1 from public.admission_branches where id = v_branch_id);
  assert not exists(select 1 from public.branch_academic_subjects where branch_id = v_branch_id);
  assert not exists(select 1 from public.branch_academic_instructors where branch_id = v_branch_id);
  assert exists(select 1 from public.staff_accounts where id = v_staff_id and branch_id is null and status = 'inactive');
end;
$$;
select 'Branch archive lifecycle checks passed' as result;
rollback;
