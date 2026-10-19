begin;

alter table public.staff_accounts alter column branch_id drop not null;
alter table public.staff_accounts add constraint staff_accounts_active_branch_required
  check (status <> 'active' or branch_id is not null);

-- Keep one atomic cleanup path for new deletions and previously inactive branches.
create function public.retire_branch_records(p_branch_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from public.admission_branches where id = p_branch_id for update;
  if not found then raise exception 'Branch was not found.'; end if;
  if exists (
    select 1 from public.student_profiles student
    where student.branch_id = p_branch_id and student.status = 'active'
  ) then
    raise exception 'This branch cannot be deleted because it has enrolled students.';
  end if;

  update public.staff_accounts
    set status = 'inactive', branch_id = null where branch_id = p_branch_id;

  -- Subject prerequisites and subject assignments follow their existing FK cascades.
  delete from public.branch_academic_subjects where branch_id = p_branch_id;
  delete from public.branch_academic_instructors where branch_id = p_branch_id;
  delete from public.branch_instructor_passwords where branch_id = p_branch_id;
  delete from public.branch_local_storage_records
    where branch_id = p_branch_id and scope in ('subjects', 'instructors', 'subject-assignments', 'instructor-departments');

  update public.program_offerings set is_active = false where branch_id = p_branch_id;
  update public.branch_track_offerings set is_active = false where branch_id = p_branch_id;
  update public.admission_portal_statuses set is_open = false where branch_id = p_branch_id;
  update public.admission_branches set is_active = false where id = p_branch_id;
end;
$$;
revoke all on function public.retire_branch_records(uuid) from public, anon, authenticated;

create function public.delete_area_manager_branch(p_session_token text, p_branch text)
returns void language plpgsql security definer set search_path = public
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
  select branch.id into v_branch_id from public.admission_branches branch
    where lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch));
  if v_branch_id is null then raise exception 'Branch was not found.'; end if;
  perform public.retire_branch_records(v_branch_id);
end;
$$;
revoke all on function public.delete_area_manager_branch(text, text) from public;
grant execute on function public.delete_area_manager_branch(text, text) to anon, authenticated;
revoke all on function public.deactivate_area_manager_branch(text) from public, anon, authenticated;

-- Retire staff/academic records left by the old soft-delete implementation.
do $$
declare v_branch record;
begin
  for v_branch in select branch.id from public.admission_branches branch
    where not branch.is_active and not exists (
      select 1 from public.student_profiles student
      where student.branch_id = branch.id and student.status = 'active'
    )
  loop
    perform public.retire_branch_records(v_branch.id);
  end loop;
end;
$$;

-- Updated staff listing and reassignment functions follow below.

create or replace function public.list_staff_accounts(
  p_trash_mode text default 'active'
)
returns table (
  employee_id text,
  first_name text,
  last_name text,
  role text,
  branch text,
  email text,
  contact_number text,
  address text,
  status text,
  is_trashed boolean
)
language sql
security definer
set search_path = public
as $$
  select
    account.employee_id,
    account.first_name,
    account.last_name,
    account.role,
    coalesce(branch.name, '') as branch,
    account.email::text as email,
    account.contact_number,
    account.address,
    account.status,
    account.is_trashed
  from public.staff_accounts account
  left join public.admission_branches branch
    on branch.id = account.branch_id
  where case lower(trim(coalesce(p_trash_mode, 'active')))
    when 'trash' then account.is_trashed = true
    when 'all' then true
    else account.is_trashed = false
  end
  order by branch.name, account.role, account.last_name, account.first_name;
$$;

create or replace function public.update_staff_account(
  p_employee_id text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_branch text,
  p_email text,
  p_contact_number text,
  p_address text,
  p_password text default null,
  p_status text default 'active',
  p_require_password_change boolean default false
)
returns table (
  employee_id text,
  first_name text,
  last_name text,
  role text,
  branch text,
  email text,
  contact_number text,
  address text,
  status text,
  is_trashed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_account_id uuid;
  v_branch_id uuid;
  v_branch_code text;
  v_branch_name text;
  v_existing_branch_name text;
  v_role text;
  v_status text;
  v_next_employee_id text;
begin
  select account.id, branch.name
  into v_account_id, v_existing_branch_name
  from public.staff_accounts account
  left join public.admission_branches branch
    on branch.id = account.branch_id
  where account.employee_id = upper(trim(coalesce(p_employee_id, '')))
  limit 1;

  if v_account_id is null then
    raise exception 'Employee ID "%" was not found.', p_employee_id;
  end if;

  if trim(coalesce(p_first_name, '')) = ''
    or trim(coalesce(p_last_name, '')) = ''
    or trim(coalesce(p_email, '')) = ''
    or trim(coalesce(p_contact_number, '')) = ''
    or trim(coalesce(p_address, '')) = '' then
    raise exception 'All staff account fields except password are required.';
  end if;

  if trim(coalesce(p_password, '')) <> ''
    and char_length(trim(p_password)) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  v_role := public.resolve_staff_role(p_role);
  if v_role is null then
    raise exception 'Role "%" is not supported.', p_role;
  end if;

  select
    resolved.branch_id,
    resolved.branch_code,
    resolved.branch_name
  into v_branch_id, v_branch_code, v_branch_name
  from public.resolve_staff_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_status := lower(trim(coalesce(p_status, 'active')));
  if v_status not in ('active', 'inactive') then
    raise exception 'Status "%" is not supported.', p_status;
  end if;

  if exists (
    select 1
    from public.staff_accounts account
    where account.email = trim(lower(p_email))::citext
      and account.id <> v_account_id
  ) then
    raise exception 'Email "%" is already used by another staff account.', p_email;
  end if;

  if v_status = 'active' and exists (
    select 1
    from public.staff_accounts account
    where account.branch_id = v_branch_id
      and account.role = v_role
      and account.status = 'active'
      and account.is_trashed = false
      and account.id <> v_account_id
  ) then
    raise exception 'The % branch already has an active % account.', v_branch_name, v_role;
  end if;

  if v_existing_branch_name is distinct from v_branch_name then
    v_next_employee_id := public.generate_staff_employee_id(v_branch_name);
  else
    v_next_employee_id := upper(trim(p_employee_id));
  end if;

  update public.staff_accounts account
  set employee_id = v_next_employee_id,
      branch_id = v_branch_id,
      role = v_role,
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = trim(lower(p_email))::citext,
      contact_number = regexp_replace(trim(p_contact_number), '\D', '', 'g'),
      address = trim(p_address),
      password_hash = case
        when trim(coalesce(p_password, '')) = '' then account.password_hash
        else extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
      end,
      password_change_required = case
        when trim(coalesce(p_password, '')) = '' then account.password_change_required
        when p_require_password_change then true
        else false
      end,
      status = v_status
  where account.id = v_account_id;

  return query
  select *
  from public.list_staff_accounts('all') account
  where account.employee_id = v_next_employee_id;
end;
$$;


notify pgrst, 'reload schema';
commit;
