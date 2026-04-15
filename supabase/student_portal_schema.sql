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

create table if not exists public.student_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  admission_application_id uuid not null unique references public.admission_applications(id) on delete restrict,
  branch_id uuid not null references public.admission_branches(id) on delete restrict,
  student_status_id uuid not null references public.admission_student_statuses(id) on delete restrict,
  program_offering_id uuid not null references public.program_offerings(id) on delete restrict,
  track_id uuid not null references public.program_tracks(id) on delete restrict,
  student_number text not null,
  first_name text not null,
  last_name text not null,
  middle_name text,
  sex text not null,
  civil_status text not null,
  year_level text not null,
  section text,
  status text not null default 'active',
  approved_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_profiles_sex_check
    check (sex in ('Male', 'Female')),
  constraint student_profiles_civil_status_check
    check (civil_status in ('Single', 'Married', 'Widowed', 'Separated')),
  constraint student_profiles_status_check
    check (status in ('active', 'inactive', 'graduated', 'archived'))
);

alter table public.student_profiles
alter column id set default extensions.gen_random_uuid();

alter table public.student_profiles
drop constraint if exists student_profiles_student_number_key;

create unique index if not exists student_profiles_branch_student_number_key
  on public.student_profiles (branch_id, student_number);

create table if not exists public.student_contact_details (
  student_id uuid primary key references public.student_profiles(id) on delete cascade,
  email citext not null,
  phone_number text not null,
  address text not null,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.student_portal_accounts (
  student_id uuid primary key references public.student_profiles(id) on delete cascade,
  password_hash text not null,
  status text not null default 'active',
  registered_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_portal_accounts_status_check
    check (status in ('active', 'inactive', 'locked'))
);

create sequence if not exists public.student_number_seq
start with 261001
increment by 1;

select setval(
  'public.student_number_seq',
  greatest(
    coalesce(
      (
        select max(
          case
            when upper(trim(student.student_number)) ~ '^[A-Z]{3}-[0-9]{6}$'
              then substring(upper(trim(student.student_number)) from '([0-9]{6})$')::bigint
            when trim(student.student_number) ~ '^[0-9]{6}$'
              then trim(student.student_number)::bigint
            else null
          end
        )
        from public.student_profiles student
      ),
      261000
    ),
    261000
  ),
  true
);

create index if not exists student_profiles_branch_status_idx
  on public.student_profiles (branch_id, status);

create index if not exists student_profiles_student_number_idx
  on public.student_profiles (student_number);

create index if not exists student_profiles_application_idx
  on public.student_profiles (admission_application_id);

create index if not exists student_contact_details_email_idx
  on public.student_contact_details (email);

create index if not exists student_contact_details_phone_idx
  on public.student_contact_details (phone_number);

drop trigger if exists student_profiles_set_updated_at on public.student_profiles;
create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists student_contact_details_set_updated_at on public.student_contact_details;
create trigger student_contact_details_set_updated_at
before update on public.student_contact_details
for each row
execute function public.set_updated_at();

drop trigger if exists student_portal_accounts_set_updated_at on public.student_portal_accounts;
create trigger student_portal_accounts_set_updated_at
before update on public.student_portal_accounts
for each row
execute function public.set_updated_at();

create or replace function public.resolve_student_branch(p_branch text)
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

create or replace function public.resolve_initial_student_year_level(
  p_program_name text
)
returns text
language sql
immutable
as $$
  select case
    when trim(coalesce(p_program_name, '')) = 'Senior High School'
      then 'Grade 11'
    else '1st Year'
  end;
$$;

create or replace function public.resolve_student_number_prefix(
  p_branch_id uuid
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(branch.code)
    when 'bacoor' then 'BAC'
    when 'taytay' then 'TAY'
    when 'gma' then 'GMA'
    else null
  end
  from public.admission_branches branch
  where branch.id = p_branch_id
  limit 1;
$$;

create or replace function public.extract_student_number_sequence(
  p_student_number text
)
returns bigint
language sql
immutable
as $$
  select case
    when upper(trim(coalesce(p_student_number, ''))) ~ '^[A-Z]{3}-[0-9]{6}$'
      then substring(upper(trim(p_student_number)) from '([0-9]{6})$')::bigint
    when trim(coalesce(p_student_number, '')) ~ '^[0-9]{6}$'
      then trim(p_student_number)::bigint
    else null
  end;
$$;

create or replace function public.normalize_branch_student_number(
  p_student_number text,
  p_branch_id uuid
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_student_number text;
  v_branch_prefix text;
  v_digits text;
begin
  v_student_number := upper(trim(coalesce(p_student_number, '')));

  if v_student_number = '' then
    return null;
  end if;

  select public.resolve_student_number_prefix(p_branch_id)
  into v_branch_prefix;

  if coalesce(v_branch_prefix, '') = '' then
    return v_student_number;
  end if;

  if v_student_number ~ '^[0-9]{6}$' then
    return format('%s-%s', v_branch_prefix, v_student_number);
  end if;

  if v_student_number ~ '^[A-Z]{3}-[0-9]{6}$' then
    return v_student_number;
  end if;

  v_digits := regexp_replace(v_student_number, '\D', '', 'g');

  if char_length(v_digits) = 6 then
    return format('%s-%s', v_branch_prefix, v_digits);
  end if;

  return v_student_number;
end;
$$;

create or replace function public.normalize_portal_student_number(
  p_student_number text
)
returns text
language sql
immutable
as $$
  with cleaned as (
    select upper(
      regexp_replace(trim(coalesce(p_student_number, '')), '[^A-Z0-9]', '', 'g')
    ) as compact_student_number
  )
  select case
    when compact_student_number ~ '^[A-Z]{3}[0-9]{6}$'
      then regexp_replace(
        compact_student_number,
        '^([A-Z]{3})([0-9]{6})$',
        '\1-\2'
      )
    when compact_student_number ~ '^[0-9]{6}$'
      then compact_student_number
    else upper(trim(coalesce(p_student_number, '')))
  end
  from cleaned;
$$;

create or replace function public.generate_student_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_number text;
begin
  loop
    v_student_number := lpad(nextval('public.student_number_seq')::text, 6, '0');

    exit when not exists (
      select 1
      from public.student_profiles student
      where student.student_number = v_student_number
    );
  end loop;

  return v_student_number;
end;
$$;

create or replace function public.generate_student_number(
  p_branch_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_number bigint;
  v_branch_prefix text;
begin
  perform pg_advisory_xact_lock(2610, coalesce(hashtext(p_branch_id::text), 0));

  select public.resolve_student_number_prefix(p_branch_id)
  into v_branch_prefix;

  select greatest(
    coalesce(
      max(public.extract_student_number_sequence(student.student_number)),
      261000
    ),
    261000
  ) + 1
  into v_student_number
  from public.student_profiles student
  where (
      p_branch_id is null
      or student.branch_id = p_branch_id
    );

  if coalesce(v_branch_prefix, '') = '' then
    return lpad(v_student_number::text, 6, '0');
  end if;

  return format('%s-%s', v_branch_prefix, lpad(v_student_number::text, 6, '0'));
end;
$$;

create or replace function public.get_student_portal_snapshot(
  p_student_id uuid
)
returns table (
  student_id uuid,
  student_number text,
  tracking_number text,
  branch text,
  full_name text,
  first_name text,
  last_name text,
  middle_name text,
  program_name text,
  track_name text,
  year_level text,
  section text,
  email text,
  phone_number text,
  address text,
  birth_date date,
  sex text,
  civil_status text,
  portal_account_registered boolean
)
language sql
stable
set search_path = public
as $$
  select
    student.id as student_id,
    student.student_number,
    app.tracking_number,
    branch.name as branch,
    concat_ws(' ', student.first_name, student.middle_name, student.last_name) as full_name,
    student.first_name,
    student.last_name,
    student.middle_name,
    program.name as program_name,
    track.name as track_name,
    student.year_level,
    student.section,
    contact.email::text as email,
    contact.phone_number,
    contact.address,
    contact.birth_date,
    student.sex,
    student.civil_status,
    (account.student_id is not null and account.status = 'active') as portal_account_registered
  from public.student_profiles student
  join public.admission_applications app
    on app.id = student.admission_application_id
  join public.admission_branches branch
    on branch.id = student.branch_id
  join public.program_offerings offering
    on offering.id = student.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  join public.program_tracks track
    on track.id = student.track_id
  join public.student_contact_details contact
    on contact.student_id = student.id
  left join public.student_portal_accounts account
    on account.student_id = student.id
  where student.id = p_student_id
  limit 1;
$$;

create or replace function public.get_student_activation_status(
  p_tracking_number text
)
returns table (
  student_number text,
  portal_account_registered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    student.student_number,
    (account.student_id is not null and account.status = 'active') as portal_account_registered
  from public.admission_applications app
  left join public.student_profiles student
    on student.admission_application_id = app.id
  left join public.student_portal_accounts account
    on account.student_id = student.id
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;
$$;

drop function if exists public.register_student_portal_account(
  text,
  text,
  text,
  text,
  date,
  text
);
drop function if exists public.register_student_portal_account(
  text,
  text,
  text,
  date,
  text
);
drop function if exists public.student_portal_login(text, text, text);
drop function if exists public.student_portal_login(text, text);
drop function if exists public.activate_approved_student(text);
drop function if exists public.activate_approved_student(text, text);

create or replace function public.activate_approved_student(
  p_tracking_number text,
  p_preferred_student_number text default null
)
returns table (
  student_id uuid,
  student_number text,
  tracking_number text,
  branch text,
  full_name text,
  first_name text,
  last_name text,
  middle_name text,
  program_name text,
  track_name text,
  year_level text,
  section text,
  email text,
  phone_number text,
  address text,
  birth_date date,
  sex text,
  civil_status text,
  portal_account_registered boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_application_id uuid;
  v_branch_id uuid;
  v_branch_prefix text;
  v_student_id uuid;
  v_student_number text;
  v_preferred_student_number text;
begin
  v_preferred_student_number := nullif(
    upper(trim(coalesce(p_preferred_student_number, ''))),
    ''
  );

  select app.id, app.branch_id
  into v_application_id, v_branch_id
  from public.admission_applications app
  where app.tracking_number = upper(trim(coalesce(p_tracking_number, '')))
    and app.application_status <> 'cancelled'
  limit 1;

  if v_application_id is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  select public.resolve_student_number_prefix(v_branch_id)
  into v_branch_prefix;

  update public.admission_applications app
  set application_status = 'accepted',
      current_step = greatest(app.current_step, 4),
      submitted_at = coalesce(app.submitted_at, timezone('utc', now()))
  where app.id = v_application_id;

  select student.id, student.student_number
  into v_student_id, v_student_number
  from public.student_profiles student
  where student.admission_application_id = v_application_id
  limit 1;

  if v_student_id is null then
    if v_preferred_student_number is not null then
      v_preferred_student_number := public.normalize_branch_student_number(
        v_preferred_student_number,
        v_branch_id
      );

      if (
        v_branch_prefix is not null
        and split_part(v_preferred_student_number, '-', 1) <> v_branch_prefix
      ) then
        raise exception 'Student number "%" does not match the % branch format.', v_preferred_student_number, v_branch_prefix;
      end if;

      if exists (
        select 1
        from public.student_profiles student
        where upper(student.student_number) = v_preferred_student_number
          and student.branch_id = v_branch_id
      ) then
        raise exception 'Student number "%" is already assigned to another student in this branch.', v_preferred_student_number;
      end if;

      v_student_number := v_preferred_student_number;
    else
      v_student_number := public.generate_student_number(v_branch_id);
    end if;

    insert into public.student_profiles (
      admission_application_id,
      branch_id,
      student_status_id,
      program_offering_id,
      track_id,
      student_number,
      first_name,
      last_name,
      middle_name,
      sex,
      civil_status,
      year_level,
      status,
      approved_at
    )
    select
      app.id,
      app.branch_id,
      app.student_status_id,
      app.program_offering_id,
      app.track_id,
      v_student_number,
      trim(app.first_name),
      trim(app.last_name),
      nullif(trim(app.middle_name), ''),
      trim(app.sex),
      trim(app.civil_status),
      public.resolve_initial_student_year_level(program.name),
      'active',
      timezone('utc', now())
    from public.admission_applications app
    join public.program_offerings offering
      on offering.id = app.program_offering_id
    join public.academic_programs program
      on program.id = offering.program_id
    where app.id = v_application_id
    returning id into v_student_id;
  else
    update public.student_profiles student
    set branch_id = app.branch_id,
        student_status_id = app.student_status_id,
        program_offering_id = app.program_offering_id,
        track_id = app.track_id,
        first_name = trim(app.first_name),
        last_name = trim(app.last_name),
        middle_name = nullif(trim(app.middle_name), ''),
        sex = trim(app.sex),
        civil_status = trim(app.civil_status),
        year_level = public.resolve_initial_student_year_level(program.name),
        status = case
          when student.status = 'archived' then student.status
          else 'active'
        end,
        approved_at = coalesce(student.approved_at, timezone('utc', now()))
    from public.admission_applications app
    join public.program_offerings offering
      on offering.id = app.program_offering_id
    join public.academic_programs program
      on program.id = offering.program_id
    where student.id = v_student_id
      and app.id = v_application_id;
  end if;

  insert into public.student_contact_details (
    student_id,
    email,
    phone_number,
    address
  )
  select
    v_student_id,
    app.email::citext,
    app.phone_number,
    app.address
  from public.admission_applications app
  where app.id = v_application_id
  on conflict (student_id) do update
  set email = excluded.email,
      phone_number = excluded.phone_number,
      address = excluded.address;

  return query
  select *
  from public.get_student_portal_snapshot(v_student_id);
end;
$$;

drop function if exists public.delete_admission_application(text);

create or replace function public.delete_admission_application(
  p_tracking_number text
)
returns table (
  tracking_number text,
  deleted_student_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking_number text;
  v_application_id uuid;
  v_student_id uuid;
  v_student_number text;
begin
  v_tracking_number := upper(trim(coalesce(p_tracking_number, '')));

  if v_tracking_number = '' then
    raise exception 'Tracking number is required.';
  end if;

  select
    app.id,
    student.id,
    student.student_number
  into
    v_application_id,
    v_student_id,
    v_student_number
  from public.admission_applications app
  left join public.student_profiles student
    on student.admission_application_id = app.id
  where app.tracking_number = v_tracking_number
  limit 1;

  if v_application_id is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  if v_student_id is not null then
    delete from public.student_profiles student
    where student.id = v_student_id;
  end if;

  delete from public.admission_applications app
  where app.id = v_application_id;

  return query
  select
    v_tracking_number,
    v_student_number;
end;
$$;

create or replace function public.register_student_portal_account(
  p_student_number text,
  p_email text,
  p_phone_number text,
  p_birth_date date default null,
  p_password text default null
)
returns table (
  student_id uuid,
  student_number text,
  tracking_number text,
  branch text,
  full_name text,
  first_name text,
  last_name text,
  middle_name text,
  program_name text,
  track_name text,
  year_level text,
  section text,
  email text,
  phone_number text,
  address text,
  birth_date date,
  sex text,
  civil_status text,
  portal_account_registered boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_normalized_student_number text;
  v_student_id uuid;
  v_contact_email text;
  v_contact_phone text;
begin
  v_normalized_student_number := public.normalize_portal_student_number(
    p_student_number
  );

  if trim(coalesce(v_normalized_student_number, '')) = ''
    or trim(coalesce(p_email, '')) = ''
    or trim(coalesce(p_phone_number, '')) = ''
    or trim(coalesce(p_password, '')) = '' then
    raise exception 'Student number, email, mobile number, and password are required.';
  end if;

  if char_length(trim(p_password)) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  if v_normalized_student_number !~ '^[A-Z]{3}-[0-9]{6}$' then
    raise exception 'Student number must use the branch-prefixed format (e.g. BAC-261001).';
  end if;

  select student.id, contact.email::text, contact.phone_number
  into v_student_id, v_contact_email, v_contact_phone
  from public.student_profiles student
  join public.student_contact_details contact
    on contact.student_id = student.id
  where upper(student.student_number) = v_normalized_student_number
    and student.status = 'active'
  limit 1;

  if v_student_id is null then
    raise exception 'Student number "%" was not found, or the admission has not been approved yet.', v_normalized_student_number;
  end if;

  if lower(trim(p_email)) <> lower(trim(coalesce(v_contact_email, ''))) then
    raise exception 'The email address does not match the approved admission record.';
  end if;

  if regexp_replace(trim(p_phone_number), '\D', '', 'g')
    <> regexp_replace(trim(coalesce(v_contact_phone, '')), '\D', '', 'g') then
    raise exception 'The mobile number does not match the approved admission record.';
  end if;

  if exists (
    select 1
    from public.student_portal_accounts account
    where account.student_id = v_student_id
  ) then
    raise exception 'This student portal account is already registered. Please sign in instead.';
  end if;

  update public.student_contact_details contact
  set birth_date = coalesce(p_birth_date, contact.birth_date)
  where contact.student_id = v_student_id;

  insert into public.student_portal_accounts (
    student_id,
    password_hash,
    status,
    registered_at
  )
  values (
    v_student_id,
    extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    'active',
    timezone('utc', now())
  );

  return query
  select *
  from public.get_student_portal_snapshot(v_student_id);
end;
$$;

create or replace function public.student_portal_login(
  p_student_number text,
  p_password text
)
returns table (
  student_id uuid,
  student_number text,
  tracking_number text,
  branch text,
  full_name text,
  first_name text,
  last_name text,
  middle_name text,
  program_name text,
  track_name text,
  year_level text,
  section text,
  email text,
  phone_number text,
  address text,
  birth_date date,
  sex text,
  civil_status text,
  portal_account_registered boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_normalized_student_number text;
  v_student_id uuid;
begin
  v_normalized_student_number := public.normalize_portal_student_number(
    p_student_number
  );

  if trim(coalesce(v_normalized_student_number, '')) = ''
    or trim(coalesce(p_password, '')) = '' then
    raise exception 'Student number and password are required.';
  end if;

  if v_normalized_student_number !~ '^[A-Z]{3}-[0-9]{6}$' then
    raise exception 'Student number must use the branch-prefixed format (e.g. BAC-261001).';
  end if;

  select student.id
  into v_student_id
  from public.student_profiles student
  where upper(student.student_number) = v_normalized_student_number
    and student.status = 'active'
  limit 1;

  if v_student_id is null then
    raise exception 'Student number "%" was not found.', v_normalized_student_number;
  end if;

  if not exists (
    select 1
    from public.student_portal_accounts account
    where account.student_id = v_student_id
  ) then
    raise exception 'This student number is approved but not yet registered. Please create your student portal account first.';
  end if;

  if exists (
    select 1
    from public.student_portal_accounts account
    where account.student_id = v_student_id
      and account.status <> 'active'
  ) then
    raise exception 'This student portal account is inactive. Please contact the registrar.';
  end if;

  update public.student_portal_accounts account
  set last_login_at = timezone('utc', now())
  where account.student_id = v_student_id
    and account.status = 'active'
    and account.password_hash = extensions.crypt(trim(p_password), account.password_hash);

  if not found then
    raise exception 'Invalid student number or password.';
  end if;

  return query
  select *
  from public.get_student_portal_snapshot(v_student_id);
end;
$$;

drop function if exists public.get_admin_admission_queue(text);

create or replace function public.get_admin_admission_queue(
  p_branch_code text default null
)
returns table (
  application_id uuid,
  tracking_number text,
  branch_code text,
  branch_name text,
  student_status_label text,
  program_name text,
  program_level text,
  track_name text,
  honor_label text,
  application_status text,
  current_step smallint,
  first_name text,
  last_name text,
  middle_name text,
  sex text,
  civil_status text,
  address text,
  email text,
  phone_number text,
  year_completion integer,
  applied_for_scholarship boolean,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  requirement_files jsonb,
  student_number text,
  portal_account_registered boolean
)
language sql
security definer
set search_path = public
as $$
  select
    app.id as application_id,
    app.tracking_number,
    branch.code as branch_code,
    branch.name as branch_name,
    status.label as student_status_label,
    program.name as program_name,
    program.level as program_level,
    track.name as track_name,
    honor.label as honor_label,
    app.application_status,
    app.current_step,
    app.first_name,
    app.last_name,
    app.middle_name,
    app.sex,
    app.civil_status,
    app.address,
    app.email::text as email,
    app.phone_number,
    app.year_completion,
    app.applied_for_scholarship,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirement_code', requirement.code,
          'requirement_name', requirement.name,
          'file_name', file.original_file_name,
          'storage_bucket', file.storage_bucket,
          'storage_path', file.storage_path,
          'mime_type', file.mime_type,
          'uploaded_at', file.uploaded_at
        )
        order by requirement.sort_order
      ) filter (where file.id is not null),
      '[]'::jsonb
    ) as requirement_files,
    student.student_number,
    (account.student_id is not null and account.status = 'active') as portal_account_registered
  from public.admission_applications app
  join public.admission_branches branch
    on branch.id = app.branch_id
  join public.admission_student_statuses status
    on status.id = app.student_status_id
  join public.program_offerings offering
    on offering.id = app.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  join public.program_tracks track
    on track.id = app.track_id
  left join public.admission_honors honor
    on honor.id = app.honor_id
  left join public.admission_application_requirement_files file
    on file.application_id = app.id
  left join public.admission_requirement_types requirement
    on requirement.id = file.requirement_type_id
  left join public.student_profiles student
    on student.admission_application_id = app.id
  left join public.student_portal_accounts account
    on account.student_id = student.id
  where app.application_status <> 'cancelled'
    and (
      p_branch_code is null
      or branch.code = lower(trim(p_branch_code))
    )
  group by
    app.id,
    app.tracking_number,
    branch.code,
    branch.name,
    status.label,
    program.name,
    program.level,
    track.name,
    honor.label,
    app.application_status,
    app.current_step,
    app.first_name,
    app.last_name,
    app.middle_name,
    app.sex,
    app.civil_status,
    app.address,
    app.email,
    app.phone_number,
    app.year_completion,
    app.applied_for_scholarship,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at,
    student.student_number,
    account.student_id,
    account.status
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

alter table public.student_profiles enable row level security;
alter table public.student_contact_details enable row level security;
alter table public.student_portal_accounts enable row level security;

grant execute on function public.generate_student_number() to anon, authenticated;
grant execute on function public.generate_student_number(uuid) to anon, authenticated;
grant execute on function public.get_student_activation_status(text) to anon, authenticated;
grant execute on function public.activate_approved_student(text, text) to anon, authenticated;
grant execute on function public.delete_admission_application(text) to anon, authenticated;
grant execute on function public.register_student_portal_account(
  text,
  text,
  text,
  date,
  text
) to anon, authenticated;
grant execute on function public.student_portal_login(text, text) to anon, authenticated;
grant execute on function public.get_admin_admission_queue(text) to anon, authenticated;
