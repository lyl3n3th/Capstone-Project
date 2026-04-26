create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.staff_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id text not null unique,
  branch_id uuid not null references public.admission_branches(id) on delete restrict,
  role text not null,
  first_name text not null,
  last_name text not null,
  email citext not null unique,
  contact_number text not null,
  address text not null,
  password_hash text not null,
  status text not null default 'active',
  password_change_required boolean not null default false,
  is_trashed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staff_accounts_role_check
    check (role in ('admin', 'registrar')),
  constraint staff_accounts_status_check
    check (status in ('active', 'inactive'))
);

alter table public.staff_accounts
alter column id set default extensions.gen_random_uuid();

alter table public.staff_accounts
add column if not exists password_change_required boolean not null default false;

drop index if exists staff_accounts_branch_role_active_unique_idx;
create unique index if not exists staff_accounts_branch_role_active_unique_idx
  on public.staff_accounts (branch_id, role)
  where status = 'active' and is_trashed = false;

create index if not exists staff_accounts_employee_id_idx
  on public.staff_accounts (employee_id);

create index if not exists staff_accounts_branch_role_idx
  on public.staff_accounts (branch_id, role, status, is_trashed);

drop trigger if exists staff_accounts_set_updated_at on public.staff_accounts;
create trigger staff_accounts_set_updated_at
before update on public.staff_accounts
for each row
execute function public.set_updated_at();

create or replace function public.resolve_staff_role(p_role text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'admin' then 'admin'
    when 'administrator' then 'admin'
    when 'branch administrator' then 'admin'
    when 'registrar' then 'registrar'
    else null
  end;
$$;

create or replace function public.resolve_staff_branch(p_branch text)
returns table (
  branch_id uuid,
  branch_code text,
  branch_name text
)
language sql
stable
set search_path = public
as $$
  select
    branch.id,
    branch.code,
    branch.name
  from public.admission_branches branch
  where branch.is_active
    and (
      lower(branch.code) = lower(trim(coalesce(p_branch, '')))
      or lower(branch.name) = lower(trim(coalesce(p_branch, '')))
    )
  limit 1;
$$;

create or replace function public.generate_staff_employee_id(p_branch text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_segment text;
  v_employee_id text;
  v_random_segment text;
begin
  v_branch_segment := regexp_replace(
    upper(trim(coalesce(p_branch, 'STAFF'))),
    '[^A-Z0-9]+',
    '',
    'g'
  );

  if v_branch_segment = '' then
    v_branch_segment := 'STAFF';
  end if;

  loop
    v_random_segment := upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
    v_employee_id := format('AICS-%s-%s', v_branch_segment, v_random_segment);

    exit when not exists (
      select 1
      from public.staff_accounts account
      where account.employee_id = v_employee_id
    );
  end loop;

  return v_employee_id;
end;
$$;

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
    branch.name as branch,
    account.email::text as email,
    account.contact_number,
    account.address,
    account.status,
    account.is_trashed
  from public.staff_accounts account
  join public.admission_branches branch
    on branch.id = account.branch_id
  where case lower(trim(coalesce(p_trash_mode, 'active')))
    when 'trash' then account.is_trashed = true
    when 'all' then true
    else account.is_trashed = false
  end
  order by branch.name, account.role, account.last_name, account.first_name;
$$;

create or replace function public.create_staff_account(
  p_first_name text,
  p_last_name text,
  p_role text,
  p_branch text,
  p_email text,
  p_contact_number text,
  p_address text,
  p_password text,
  p_status text default 'active'
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
  v_branch_id uuid;
  v_branch_code text;
  v_branch_name text;
  v_role text;
  v_status text;
  v_employee_id text;
begin
  if trim(coalesce(p_first_name, '')) = ''
    or trim(coalesce(p_last_name, '')) = ''
    or trim(coalesce(p_email, '')) = ''
    or trim(coalesce(p_contact_number, '')) = ''
    or trim(coalesce(p_address, '')) = ''
    or trim(coalesce(p_password, '')) = '' then
    raise exception 'All staff account fields are required.';
  end if;

  if char_length(trim(p_password)) < 8 then
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
  ) then
    raise exception 'The % branch already has an active % account.', v_branch_name, v_role;
  end if;

  v_employee_id := public.generate_staff_employee_id(v_branch_name);

  insert into public.staff_accounts (
    employee_id,
    branch_id,
    role,
    first_name,
    last_name,
    email,
    contact_number,
    address,
    password_hash,
    status,
    password_change_required
  )
  values (
    v_employee_id,
    v_branch_id,
    v_role,
    trim(p_first_name),
    trim(p_last_name),
    trim(lower(p_email))::citext,
    regexp_replace(trim(p_contact_number), '\D', '', 'g'),
    trim(p_address),
    extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    v_status,
    true
  );

  return query
  select *
  from public.list_staff_accounts('all') account
  where account.employee_id = v_employee_id;
end;
$$;

drop function if exists public.update_staff_account(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

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
  join public.admission_branches branch
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

  if v_existing_branch_name <> v_branch_name then
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

create or replace function public.set_staff_account_trashed(
  p_employee_id text,
  p_is_trashed boolean
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
  v_role text;
  v_employee_id text;
begin
  select account.id, account.branch_id, account.role, account.employee_id
  into v_account_id, v_branch_id, v_role, v_employee_id
  from public.staff_accounts account
  where account.employee_id = upper(trim(coalesce(p_employee_id, '')))
  limit 1;

  if v_account_id is null then
    raise exception 'Employee ID "%" was not found.', p_employee_id;
  end if;

  if p_is_trashed = false and exists (
    select 1
    from public.staff_accounts account
    where account.branch_id = v_branch_id
      and account.role = v_role
      and account.status = 'active'
      and account.is_trashed = false
      and account.id <> v_account_id
  ) and exists (
    select 1
    from public.staff_accounts account
    where account.id = v_account_id
      and account.status = 'active'
  ) then
    raise exception 'Restore failed because this branch already has an active account for that role.';
  end if;

  update public.staff_accounts account
  set is_trashed = p_is_trashed
  where account.id = v_account_id;

  return query
  select *
  from public.list_staff_accounts('all') account
  where account.employee_id = v_employee_id;
end;
$$;

create or replace function public.delete_staff_account(
  p_employee_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.staff_accounts account
  where account.employee_id = upper(trim(coalesce(p_employee_id, '')));

  if not found then
    raise exception 'Employee ID "%" was not found.', p_employee_id;
  end if;
end;
$$;

drop function if exists public.staff_login(
  text,
  text,
  text
);

create or replace function public.staff_login(
  p_branch text,
  p_role text,
  p_password text
)
returns table (
  employee_id text,
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
  v_branch_id uuid;
  v_branch_code text;
  v_branch_name text;
  v_role text;
begin
  if trim(coalesce(p_password, '')) = '' then
    raise exception 'Password is required.';
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

  return query
  select
    account.employee_id,
    branch.name as branch,
    concat_ws(' ', account.first_name, account.last_name) as full_name,
    account.role,
    account.password_change_required
  from public.staff_accounts account
  join public.admission_branches branch
    on branch.id = account.branch_id
  where account.branch_id = v_branch_id
    and account.role = v_role
    and account.status = 'active'
    and account.is_trashed = false
    and account.password_hash = extensions.crypt(trim(p_password), account.password_hash)
  limit 1;

  if found then
    return;
  end if;

  if exists (
    select 1
    from public.staff_accounts account
    where account.branch_id = v_branch_id
      and account.role = v_role
      and account.status = 'inactive'
      and account.is_trashed = false
      and account.password_hash = extensions.crypt(trim(p_password), account.password_hash)
  ) then
    raise exception 'This staff account is disabled. Please contact the Area Manager.';
  end if;

  raise exception 'Invalid login credentials.';
end;
$$;

drop function if exists public.reset_staff_account_password(
  text,
  text,
  text,
  text,
  text
);

create or replace function public.reset_staff_account_password(
  p_branch text,
  p_role text,
  p_email text,
  p_contact_number text,
  p_new_password text
)
returns table (
  employee_id text,
  branch text,
  full_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if trim(coalesce(p_branch, '')) = ''
    or trim(coalesce(p_role, '')) = ''
    or trim(coalesce(p_email, '')) = ''
    or trim(coalesce(p_contact_number, '')) = ''
    or trim(coalesce(p_new_password, '')) = '' then
    raise exception 'Branch, role, email, mobile number, and new password are required.';
  end if;

  if char_length(trim(p_new_password)) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  v_role := public.resolve_staff_role(p_role);
  if v_role is null then
    raise exception 'Role "%" is not supported.', p_role;
  end if;

  if not exists (
    select 1
    from public.resolve_staff_branch(p_branch) as resolved
  ) then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  return query
  with resolved_branch as (
    select resolved.branch_id
    from public.resolve_staff_branch(p_branch) as resolved
    limit 1
  ),
  updated_account as (
    update public.staff_accounts account
    set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
        password_change_required = false
    where account.branch_id in (
        select branch_id
        from resolved_branch
      )
      and account.role = v_role
      and account.status = 'active'
      and account.is_trashed = false
      and account.email = trim(lower(p_email))::citext
      and regexp_replace(trim(account.contact_number), '\D', '', 'g')
        = regexp_replace(trim(p_contact_number), '\D', '', 'g')
    returning
      account.employee_id,
      account.branch_id,
      account.first_name,
      account.last_name,
      account.role
  )
  select
    updated_account.employee_id,
    branch.name as branch,
    concat_ws(' ', updated_account.first_name, updated_account.last_name) as full_name,
    updated_account.role
  from updated_account
  join public.admission_branches branch
    on branch.id = updated_account.branch_id;

  if not found then
    raise exception 'The recovery details do not match the active staff account for this branch and role.';
  end if;
end;
$$;

create or replace function public.complete_staff_password_setup(
  p_employee_id text,
  p_current_password text,
  p_new_password text
)
returns table (
  employee_id text,
  branch text,
  full_name text,
  role text,
  password_change_required boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_employee_id, '')) = ''
    or trim(coalesce(p_current_password, '')) = ''
    or trim(coalesce(p_new_password, '')) = '' then
    raise exception 'Employee ID, current password, and new password are required.';
  end if;

  if char_length(trim(p_new_password)) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  if trim(p_current_password) = trim(p_new_password) then
    raise exception 'Please choose a new password different from the temporary password.';
  end if;

  return query
  with updated_account as (
    update public.staff_accounts account
    set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
        password_change_required = false
    where account.employee_id = upper(trim(p_employee_id))
      and account.status = 'active'
      and account.is_trashed = false
      and account.password_change_required = true
      and account.password_hash = extensions.crypt(trim(p_current_password), account.password_hash)
    returning
      account.employee_id,
      account.branch_id,
      account.first_name,
      account.last_name,
      account.role,
      account.password_change_required
  )
  select
    updated_account.employee_id,
    branch.name as branch,
    concat_ws(' ', updated_account.first_name, updated_account.last_name) as full_name,
    updated_account.role,
    updated_account.password_change_required
  from updated_account
  join public.admission_branches branch
    on branch.id = updated_account.branch_id;

  if found then
    return;
  end if;

  if exists (
    select 1
    from public.staff_accounts account
    where account.employee_id = upper(trim(p_employee_id))
      and account.status = 'inactive'
      and account.is_trashed = false
  ) then
    raise exception 'This staff account is disabled. Please contact the Area Manager.';
  end if;

  if exists (
    select 1
    from public.staff_accounts account
    where account.employee_id = upper(trim(p_employee_id))
      and account.status = 'active'
      and account.is_trashed = false
      and account.password_change_required = false
  ) then
    raise exception 'Password setup has already been completed for this account.';
  end if;

  raise exception 'Unable to update the password with the provided credentials.';
end;
$$;

alter table public.staff_accounts enable row level security;

grant execute on function public.generate_staff_employee_id(text) to anon, authenticated;
grant execute on function public.list_staff_accounts(text) to anon, authenticated;
grant execute on function public.create_staff_account(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;
grant execute on function public.update_staff_account(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) to anon, authenticated;
grant execute on function public.set_staff_account_trashed(text, boolean) to anon, authenticated;
grant execute on function public.delete_staff_account(text) to anon, authenticated;
grant execute on function public.staff_login(text, text, text) to anon, authenticated;
grant execute on function public.complete_staff_password_setup(text, text, text) to anon, authenticated;
grant execute on function public.reset_staff_account_password(
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;
