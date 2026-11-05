-- Run against the application database. All test data and password changes roll back.
begin;
do $$
declare
  v_branch_id uuid;
  v_branch text;
  v_employee text := 'RECOVERY-TEST-' || gen_random_uuid()::text;
  v_email text := gen_random_uuid()::text || '@example.invalid';
  v_rejected boolean;
begin
  select id, name into strict v_branch_id, v_branch
  from public.admission_branches where is_active limit 1;

  insert into public.branch_academic_instructors
    (branch_id, external_id, name, employee_id, department, email, contact_number, is_active)
  values
    (v_branch_id, v_employee, 'Recovery Test', v_employee, 'Test', v_email, '0912-345-6789', true);

  if not has_function_privilege('anon',
    'public.reset_instructor_account_password(text,text,text,text)', 'EXECUTE') then
    raise exception 'Recovery must be callable before login.';
  end if;

  -- Require correct recovery details and a valid password.
  for i in 1..4 loop
    v_rejected := false;
    begin
      perform public.reset_instructor_account_password(
        case when i = 1 then 'INVALID-RECOVERY-BRANCH' else v_branch end,
        case when i = 2 then 'wrong-' || v_email else v_email end,
        case when i = 3 then '00000000000' else '09123456789' end,
        case when i = 4 then 'short' else 'RecoveryTestPassword2026!' end
      );
    exception when others then v_rejected := true;
    end;
    if not v_rejected then raise exception 'Invalid recovery case % accepted.', i; end if;
  end loop;

  -- Case-insensitive email and formatted mobile numbers must match.
  perform public.reset_instructor_account_password(
    v_branch, upper(v_email), '(0912) 345-6789', 'RecoveryTestPassword2026!');
  if not exists (
    select 1 from public.authenticate_instructor(v_branch, v_employee, 'RecoveryTestPassword2026!')
    where not password_change_required
  ) then raise exception 'Recovered password did not allow login.'; end if;

  -- A second recovery replaces the existing hash.
  perform public.reset_instructor_account_password(
    v_branch, v_email, '09123456789', 'ReplacementPassword2026!');
  perform public.authenticate_instructor(v_branch, v_employee, 'ReplacementPassword2026!');
  v_rejected := false;
  begin
    perform public.authenticate_instructor(v_branch, v_employee, 'RecoveryTestPassword2026!');
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Old password still accepted.'; end if;

  update public.branch_academic_instructors set is_active = false
  where branch_id = v_branch_id and employee_id = v_employee;
  v_rejected := false;
  begin
    perform public.reset_instructor_account_password(
      v_branch, v_email, '09123456789', 'RecoveryTestPassword2026!');
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Inactive instructor recovery accepted.'; end if;

  update public.branch_academic_instructors set is_active = true
  where branch_id = v_branch_id and employee_id = v_employee;
  insert into public.branch_academic_instructors
    (branch_id, external_id, name, employee_id, department, email, contact_number, is_active)
  values
    (v_branch_id, v_employee || '-2', 'Duplicate Recovery Test', v_employee || '-2',
      'Test', v_email, '09123456789', true);
  v_rejected := false;
  begin
    perform public.reset_instructor_account_password(
      v_branch, v_email, '09123456789', 'RecoveryTestPassword2026!');
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Ambiguous instructor recovery accepted.'; end if;
end;
$$;
rollback;
