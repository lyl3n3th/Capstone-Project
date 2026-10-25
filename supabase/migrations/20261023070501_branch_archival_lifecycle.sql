begin;

-- These RPCs use the app's existing Area Manager session authentication.
create or replace function public.list_archived_area_manager_branches(p_session_token text)
returns table (code text, name text)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.area_manager_sessions session
    join public.area_manager_accounts account on account.id = session.account_id
    where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
      and session.expires_at > timezone('utc', now()) and account.is_active
  ) then
    raise exception 'Your Area Manager session has expired. Please sign in again.';
  end if;
  return query select branch.code, branch.name
    from public.admission_branches branch where not branch.is_active order by branch.name;
end;
$$;

create or replace function public.set_area_manager_branch_archived(
  p_session_token text, p_branch text, p_archived boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_branch_id uuid;
begin
  if not exists (
    select 1 from public.area_manager_sessions session
    join public.area_manager_accounts account on account.id = session.account_id
    where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
      and session.expires_at > timezone('utc', now()) and account.is_active
  ) then
    raise exception 'Your Area Manager session has expired. Please sign in again.';
  end if;
  if p_archived is null then raise exception 'Choose archive or restore.'; end if;

  select branch.id into v_branch_id from public.admission_branches branch
    where lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch))
    for update;
  if v_branch_id is null then raise exception 'Branch was not found.'; end if;

  -- Enrollment takes the same branch lock, preventing an archive/enrollment race.
  if p_archived then
    if exists (select 1 from public.student_profiles student
      where student.branch_id = v_branch_id and student.status = 'active') then
      raise exception 'This branch cannot be archived because it has enrolled students.';
    end if;
    update public.staff_accounts set status = 'inactive' where branch_id = v_branch_id;
  end if;

  -- Preserve offerings, subjects, instructors, settings, and staff assignments.
  -- Staff remain disabled after restoring until the manager explicitly enables them.
  update public.admission_branches set is_active = not p_archived where id = v_branch_id;
end;
$$;

create or replace function public.delete_area_manager_branch(p_session_token text, p_branch text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_branch_id uuid; v_is_active boolean;
begin
  if not exists (
    select 1 from public.area_manager_sessions session
    join public.area_manager_accounts account on account.id = session.account_id
    where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
      and session.expires_at > timezone('utc', now()) and account.is_active
  ) then
    raise exception 'Your Area Manager session has expired. Please sign in again.';
  end if;
  select branch.id, branch.is_active into v_branch_id, v_is_active
    from public.admission_branches branch
    where lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch))
    for update;
  if v_branch_id is null then raise exception 'Branch was not found.'; end if;
  if v_is_active then raise exception 'Archive this branch before permanently deleting it.'; end if;

  -- Never cascade away student, admission, or financial history.
  if exists (select 1 from public.student_profiles where branch_id = v_branch_id)
    or exists (select 1 from public.admission_applications where branch_id = v_branch_id)
    or exists (select 1 from public.student_payments where branch_id = v_branch_id) then
    raise exception 'This branch cannot be permanently deleted because it has student, admission, or payment records. Restore it to manage those records.';
  end if;

  perform public.retire_branch_records(v_branch_id);
  delete from public.admission_branches where id = v_branch_id;
end;
$$;

-- Adding the same branch again must not silently restore an archived branch.
create or replace function public.upsert_area_manager_branch(p_code text, p_name text)
returns table (code text, name text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_name text := trim(coalesce(p_name, ''));
  v_student_number_prefix text;
begin
  if v_name = '' then raise exception 'Branch name is required.'; end if;
  v_code := lower(trim(coalesce(nullif(trim(p_code), ''), v_name)));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '_', 'g');
  v_code := regexp_replace(v_code, '^_+|_+$', '', 'g');
  if v_code = '' then raise exception 'Branch code could not be generated.'; end if;

  select branch.student_number_prefix into v_student_number_prefix
    from public.admission_branches branch where branch.code = v_code;
  if v_student_number_prefix is null then
    v_student_number_prefix := public.allocate_branch_student_number_prefix(v_name, v_code);
  end if;

  insert into public.admission_branches (code, name, student_number_prefix, is_active)
    values (v_code, v_name, v_student_number_prefix, true)
  on conflict on constraint admission_branches_code_key do update
    set name = excluded.name,
        student_number_prefix = coalesce(public.admission_branches.student_number_prefix, excluded.student_number_prefix)
    where public.admission_branches.is_active;
  if not found then
    raise exception 'This branch is archived. Restore it from Archived Branches.';
  end if;

  return query select branch.code, branch.name
    from public.admission_branches branch where branch.code = v_code;
end;
$$;

revoke all on function public.list_archived_area_manager_branches(text) from public;
revoke all on function public.set_area_manager_branch_archived(text, text, boolean) from public;
revoke all on function public.delete_area_manager_branch(text, text) from public;
revoke all on function public.upsert_area_manager_branch(text, text) from public;
grant execute on function public.list_archived_area_manager_branches(text) to anon, authenticated;
grant execute on function public.set_area_manager_branch_archived(text, text, boolean) to anon, authenticated;
grant execute on function public.delete_area_manager_branch(text, text) to anon, authenticated;
grant execute on function public.upsert_area_manager_branch(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
