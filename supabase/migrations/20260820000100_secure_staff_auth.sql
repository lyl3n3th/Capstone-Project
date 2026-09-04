create extension if not exists pgcrypto;

create table if not exists public.area_manager_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  branch text not null default 'All Branches',
  full_name text not null default 'Area Manager',
  password_hash text not null,
  password_change_required boolean not null default true,
  is_active boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists area_manager_single_active_account_idx
  on public.area_manager_accounts (is_active)
  where is_active;

create table if not exists public.area_manager_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.area_manager_accounts(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists area_manager_sessions_expiry_idx
  on public.area_manager_sessions (expires_at);

alter table public.area_manager_accounts enable row level security;
alter table public.area_manager_sessions enable row level security;

revoke all on public.area_manager_accounts from anon, authenticated;
revoke all on public.area_manager_sessions from anon, authenticated;

insert into public.area_manager_accounts (
  branch,
  full_name,
  password_hash,
  password_change_required
)
select
  'All Branches',
  'Area Manager',
  extensions.crypt('manager123', extensions.gen_salt('bf')),
  true
where not exists (
  select 1 from public.area_manager_accounts where is_active
);

create or replace function public.authenticate_area_manager(p_password text)
returns table (
  id uuid,
  branch text,
  full_name text,
  role text,
  password_change_required boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.area_manager_accounts%rowtype;
  v_session_token text;
begin
  select account.* into v_account
  from public.area_manager_accounts account
  where account.is_active
  limit 1;

  if v_account.id is null
    or v_account.password_hash <> extensions.crypt(trim(coalesce(p_password, '')), v_account.password_hash) then
    raise exception 'Invalid area manager credentials.';
  end if;

  delete from public.area_manager_sessions session
  where session.expires_at <= timezone('utc', now());

  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.area_manager_sessions (account_id, token_hash, expires_at)
  values (
    v_account.id,
    extensions.digest(v_session_token, 'sha256'),
    timezone('utc', now()) + interval '12 hours'
  );

  return query
  select
    v_account.id,
    v_account.branch,
    v_account.full_name,
    'manager'::text,
    v_account.password_change_required,
    v_session_token;
end;
$$;

create or replace function public.update_area_manager_account(
  p_session_token text,
  p_full_name text,
  p_current_password text default null,
  p_new_password text default null
)
returns table (
  id uuid,
  branch text,
  full_name text,
  role text,
  password_change_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.area_manager_accounts%rowtype;
  v_new_password text := nullif(trim(coalesce(p_new_password, '')), '');
begin
  select account.* into v_account
  from public.area_manager_sessions session
  join public.area_manager_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
    and session.expires_at > timezone('utc', now())
    and account.is_active
  limit 1;

  if v_account.id is null then
    raise exception 'Your area manager session has expired. Please sign in again.';
  end if;

  if trim(coalesce(p_full_name, '')) = '' then
    raise exception 'Area manager name is required.';
  end if;

  if v_new_password is not null then
    if char_length(v_new_password) < 8 then
      raise exception 'Password must be at least 8 characters long.';
    end if;

    if v_account.password_hash <> extensions.crypt(
      trim(coalesce(p_current_password, '')),
      v_account.password_hash
    ) then
      raise exception 'The current password is incorrect.';
    end if;
  end if;

  update public.area_manager_accounts account
  set full_name = trim(p_full_name),
      password_hash = case
        when v_new_password is null then account.password_hash
        else extensions.crypt(v_new_password, extensions.gen_salt('bf'))
      end,
      password_change_required = case
        when v_new_password is null then account.password_change_required
        else false
      end,
      updated_at = timezone('utc', now())
  where account.id = v_account.id
  returning account.* into v_account;

  return query
  select
    v_account.id,
    v_account.branch,
    v_account.full_name,
    'manager'::text,
    v_account.password_change_required;
end;
$$;

create or replace function public.revoke_area_manager_session(p_session_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.area_manager_sessions session
  where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256');
$$;

create or replace function public.reset_area_manager_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  update public.area_manager_accounts account
  set password_hash = extensions.crypt('manager123', extensions.gen_salt('bf')),
      password_change_required = true,
      updated_at = timezone('utc', now())
  where account.is_active
  returning account.id into v_account_id;

  if v_account_id is null then
    raise exception 'No active area manager account was found.';
  end if;

  delete from public.area_manager_sessions session
  where session.account_id = v_account_id;
end;
$$;

create or replace function public.authenticate_instructor(
  p_branch text,
  p_employee_id text,
  p_password text
)
returns table (
  id text,
  branch text,
  name text,
  employee_id text,
  department text,
  email text,
  contact_number text,
  password_change_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_employee_id text;
  v_password_hash text;
  v_password_change_required boolean;
begin
  v_employee_id := upper(trim(coalesce(p_employee_id, '')));

  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  select password.password_hash, password.password_change_required
  into v_password_hash, v_password_change_required
  from public.branch_instructor_passwords password
  where password.branch_id = v_branch_id
    and password.employee_id = v_employee_id;

  if v_password_hash is null
    or v_password_hash <> extensions.crypt(trim(coalesce(p_password, '')), v_password_hash) then
    raise exception 'Invalid instructor credentials.';
  end if;

  return query
  select
    instructor.external_id,
    branch.name,
    instructor.name,
    instructor.employee_id,
    instructor.department,
    instructor.email::text,
    instructor.contact_number,
    v_password_change_required
  from public.branch_academic_instructors instructor
  join public.admission_branches branch on branch.id = instructor.branch_id
  where instructor.branch_id = v_branch_id
    and upper(instructor.employee_id) = v_employee_id
    and instructor.is_active
  limit 1;

  if not found then
    raise exception 'No instructor account found for that employee ID.';
  end if;
end;
$$;

drop function if exists public.set_instructor_temporary_password(
  text,
  text,
  text,
  boolean
);

create function public.set_instructor_temporary_password(
  p_branch text,
  p_employee_id text,
  p_password text,
  p_require_password_change boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_employee_id text;
begin
  v_employee_id := upper(trim(coalesce(p_employee_id, '')));

  if v_employee_id = '' then
    raise exception 'Employee ID is required.';
  end if;

  if char_length(trim(coalesce(p_password, ''))) < 12 then
    raise exception 'Temporary password must be at least 12 characters long.';
  end if;

  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  if not exists (
    select 1
    from public.branch_academic_instructors instructor
    where instructor.branch_id = v_branch_id
      and upper(instructor.employee_id) = v_employee_id
      and instructor.is_active
  ) then
    raise exception 'No active instructor found for employee ID "%".', p_employee_id;
  end if;

  insert into public.branch_instructor_passwords (
    branch_id,
    employee_id,
    password_hash,
    password_change_required,
    updated_at
  )
  values (
    v_branch_id,
    v_employee_id,
    extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    p_require_password_change,
    timezone('utc', now())
  )
  on conflict (branch_id, employee_id) do update
  set password_hash = excluded.password_hash,
      password_change_required = excluded.password_change_required,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.authenticate_area_manager(text) to anon, authenticated;
grant execute on function public.update_area_manager_account(text, text, text, text) to anon, authenticated;
grant execute on function public.revoke_area_manager_session(text) to anon, authenticated;
grant execute on function public.reset_area_manager_password() to anon, authenticated;
grant execute on function public.authenticate_instructor(text, text, text) to anon, authenticated;
grant execute on function public.set_instructor_temporary_password(text, text, text, boolean) to anon, authenticated;
