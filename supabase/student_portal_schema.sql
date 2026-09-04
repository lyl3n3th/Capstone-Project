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
  admission_application_id uuid unique references public.admission_applications(id) on delete restrict,
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
  completion_status text not null default 'complete',
  document_submitted_date date,
  approved_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_profiles_sex_check
    check (sex in ('Male', 'Female')),
  constraint student_profiles_civil_status_check
    check (civil_status in ('Single', 'Married', 'Widowed', 'Separated')),
  constraint student_profiles_completion_status_check
    check (completion_status in ('complete', 'incomplete')),
  constraint student_profiles_status_check
    check (status in ('active', 'inactive', 'graduated', 'archived'))
);

alter table public.student_profiles
alter column id set default extensions.gen_random_uuid();

alter table public.student_profiles
alter column admission_application_id drop not null;

alter table public.student_profiles
add column if not exists completion_status text not null default 'complete';

alter table public.student_profiles
add column if not exists document_submitted_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_profiles_completion_status_check'
      and conrelid = 'public.student_profiles'::regclass
  ) then
    alter table public.student_profiles
      add constraint student_profiles_completion_status_check
      check (completion_status in ('complete', 'incomplete'));
  end if;
end;
$$;

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

create or replace function public.sync_student_contact_email_to_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admission_applications app
  set email = new.email,
      updated_at = timezone('utc', now())
  from public.student_profiles student
  where student.id = new.student_id
    and app.id = student.admission_application_id
    and lower(trim(app.email::text)) <> lower(trim(new.email::text));

  return new;
end;
$$;

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

drop trigger if exists student_contact_details_sync_email_to_admission
  on public.student_contact_details;
create trigger student_contact_details_sync_email_to_admission
after insert or update of email on public.student_contact_details
for each row
execute function public.sync_student_contact_email_to_admission();

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

create or replace function public.resolve_student_program_name(
  p_program text
)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_program, '')))
    when 'shs' then 'Senior High School'
    when 'senior high school' then 'Senior High School'
    when 'college' then 'College'
    else trim(coalesce(p_program, ''))
  end;
$$;

create or replace function public.resolve_default_student_status_label(
  p_program_name text
)
returns text
language sql
immutable
as $$
  select case public.resolve_student_program_name(p_program_name)
    when 'Senior High School' then 'Junior High Completer'
    else 'Senior High Graduate'
  end;
$$;

create or replace function public.normalize_student_track_code(
  p_program_name text,
  p_track_name text
)
returns text
language sql
immutable
as $$
  with cleaned as (
    select
      public.resolve_student_program_name(p_program_name) as program_name,
      lower(
        regexp_replace(trim(coalesce(p_track_name, '')), '[^a-z0-9]+', '', 'g')
      ) as normalized_track
  )
  select case
    when program_name = 'College' and normalized_track in (
      'bse',
      'bsentrepreneurship',
      'bachelorofentrepreneurship',
      'bsebachelorofentrepreneurship'
    ) then 'bse'
    when program_name = 'Senior High School' and normalized_track in (
      'abm',
      'businessentrepreneurship',
      'accountancybusinessandmanagement',
      'abmaccountancybusinessandmanagement'
    ) then 'abm'
    when program_name = 'Senior High School' and normalized_track in (
      'humss',
      'artssocialscienceandhumanities',
      'humanitiesandsocialsciences',
      'humsshumanitiesandsocialsciences'
    ) then 'humss'
    when program_name = 'Senior High School' and normalized_track in (
      'gas',
      'generalacademicstrand',
      'gasgeneralacademicstrand'
    ) then 'gas'
    when program_name = 'Senior High School' and normalized_track in (
      'ict',
      'ictsupportandprogrammingtechnologies',
      'informationandcommunicationstechnology',
      'ictinformationandcommunicationstechnology'
    ) then 'ict'
    when program_name = 'Senior High School' and normalized_track in (
      'ia',
      'industrialarts',
      'iaindustrialarts'
    ) then 'ia'
    else null
  end
  from cleaned;
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

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

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

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

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

create or replace function public.resolve_student_completion_status(
  p_application_id uuid
)
returns text
language sql
stable
set search_path = public
as $$
  with app as (
    select
      admission.id,
      admission.student_status_id,
      admission.honor_id,
      program.level as program_level
    from public.admission_applications admission
    join public.program_offerings offering
      on offering.id = admission.program_offering_id
    join public.academic_programs program
      on program.id = offering.program_id
    where admission.id = p_application_id
    limit 1
  ),
  required_rules as (
    select count(*)::integer as required_count
    from app
    join public.admission_requirement_rules rule
      on rule.student_status_id = app.student_status_id
     and (
       rule.program_level = 'any'
       or rule.program_level = app.program_level
     )
     and (
       rule.honor_required = false
       or app.honor_id is not null
     )
  ),
  uploaded_files as (
    select count(*)::integer as uploaded_count
    from public.admission_application_requirement_files file
    where file.application_id = p_application_id
  )
  select case
    when not exists (select 1 from app) then 'complete'
    when coalesce((select required_count from required_rules), 0) = 0 then 'complete'
    when coalesce((select uploaded_count from uploaded_files), 0)
      >= coalesce((select required_count from required_rules), 0) then 'complete'
    else 'incomplete'
  end;
$$;

create or replace function public.resolve_admin_student_status(
  p_profile_status text,
  p_completion_status text
)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_profile_status, 'active')))
    when 'archived' then 'Archived'
    when 'inactive' then 'Archived'
    when 'graduated' then 'Graduated'
    else case lower(trim(coalesce(p_completion_status, 'complete')))
      when 'incomplete' then 'Incomplete'
      else 'Complete'
    end
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
    coalesce(app.tracking_number, student.student_number) as tracking_number,
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
  left join public.admission_applications app
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
drop function if exists public.student_portal_email_login(text);
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
  v_student_id uuid;
  v_student_number text;
begin
  select app.id, app.branch_id
  into v_application_id, v_branch_id
  from public.admission_applications app
  where app.tracking_number = upper(trim(coalesce(p_tracking_number, '')))
    and app.application_status <> 'cancelled'
  limit 1;

  if v_application_id is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

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
    v_student_number := public.generate_student_number(v_branch_id);

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
      completion_status,
      document_submitted_date,
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
      public.resolve_student_completion_status(v_application_id),
      coalesce(app.submitted_at::date, timezone('utc', now())::date),
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
        completion_status = public.resolve_student_completion_status(v_application_id),
        document_submitted_date = coalesce(
          app.submitted_at::date,
          student.document_submitted_date,
          timezone('utc', now())::date
        ),
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

update public.student_profiles student
set completion_status = public.resolve_student_completion_status(student.admission_application_id),
    document_submitted_date = coalesce(
      app.submitted_at::date,
      student.document_submitted_date,
      student.approved_at::date
    )
from public.admission_applications app
where student.admission_application_id = app.id;

update public.student_profiles student
set document_submitted_date = coalesce(student.document_submitted_date, student.approved_at::date)
where student.document_submitted_date is null;

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

create or replace function public.student_portal_email_login(
  p_email text
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
  v_email text;
  v_tracking_number text;
  v_application_id uuid;
  v_existing_student_id uuid;
  v_student_id uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  if v_email = '' then
    raise exception 'Student email is required.';
  end if;

  select student.id
  into v_student_id
  from public.student_profiles student
  join public.student_contact_details contact
    on contact.student_id = student.id
  where lower(trim(contact.email::text)) = v_email
    and student.status = 'active'
  order by student.approved_at desc nulls last, student.created_at desc
  limit 1;

  if v_student_id is not null then
    update public.student_portal_accounts account
    set last_login_at = timezone('utc', now())
    where account.student_id = v_student_id
      and account.status = 'active';

    return query
    select *
    from public.get_student_portal_snapshot(v_student_id);

    return;
  end if;

  select app.id, app.tracking_number
  into v_application_id, v_tracking_number
  from public.admission_applications app
  where lower(trim(app.email::text)) = v_email
    and app.application_status = 'accepted'
  order by app.submitted_at desc nulls last, app.created_at desc
  limit 1;

  if v_application_id is null then
    raise exception 'No active student record matched this email address.';
  end if;

  select student.id
  into v_existing_student_id
  from public.student_profiles student
  where student.admission_application_id = v_application_id
  limit 1;

  if v_existing_student_id is not null then
    raise exception 'No active student record matched this email address.';
  end if;

  perform 1
  from public.activate_approved_student(v_tracking_number);

  select student.id
  into v_student_id
  from public.student_profiles student
  join public.student_contact_details contact
    on contact.student_id = student.id
  where lower(trim(contact.email::text)) = v_email
    and student.status = 'active'
    and student.admission_application_id = v_application_id
  limit 1;

  if v_student_id is null then
    raise exception 'Unable to activate the accepted admission record for this email.';
  end if;

  update public.student_portal_accounts account
  set last_login_at = timezone('utc', now())
  where account.student_id = v_student_id
    and account.status = 'active';

  return query
  select *
  from public.get_student_portal_snapshot(v_student_id);
end;
$$;

drop function if exists public.reset_student_portal_password(
  text,
  text,
  text,
  text
);

create or replace function public.reset_student_portal_password(
  p_student_number text,
  p_email text,
  p_phone_number text,
  p_new_password text
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
    or trim(coalesce(p_email, '')) = ''
    or trim(coalesce(p_phone_number, '')) = ''
    or trim(coalesce(p_new_password, '')) = '' then
    raise exception 'Student number, email, mobile number, and new password are required.';
  end if;

  if char_length(trim(p_new_password)) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  if v_normalized_student_number !~ '^[A-Z]{3}-[0-9]{6}$' then
    raise exception 'Student number must use the branch-prefixed format (e.g. BAC-261001).';
  end if;

  v_student_id := (
    select student.id
    from public.student_profiles student
    join public.student_contact_details contact
      on contact.student_id = student.id
    where upper(student.student_number) = v_normalized_student_number
      and student.status = 'active'
      and lower(trim(p_email)) = lower(trim(coalesce(contact.email::text, '')))
      and regexp_replace(trim(p_phone_number), '\D', '', 'g')
        = regexp_replace(trim(coalesce(contact.phone_number, '')), '\D', '', 'g')
    limit 1
  );

  if v_student_id is null then
    raise exception 'The recovery details do not match the approved student record.';
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
  set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf'))
  where account.student_id = v_student_id;

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
  honor_discount_percentage numeric,
  application_status text,
  rejection_reason text,
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
  scholarship_exam_score numeric,
  effective_discount_percentage numeric,
  effective_discount_source text,
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
    coalesce(honor.tuition_discount_percent, 0)::numeric(5, 2) as honor_discount_percentage,
    app.application_status,
    app.rejection_reason,
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
    app.scholarship_exam_score,
    public.calculate_admission_discount_percentage(
      honor.tuition_discount_percent,
      app.applied_for_scholarship,
      app.scholarship_exam_score
    ) as effective_discount_percentage,
    case
      when coalesce(app.applied_for_scholarship, false)
        and app.scholarship_exam_score is not null
        and app.scholarship_exam_score > coalesce(honor.tuition_discount_percent, 0)
        then 'scholarship_exam'
      when coalesce(honor.tuition_discount_percent, 0) > 0
        then 'honor'
      when coalesce(app.applied_for_scholarship, false)
        and app.scholarship_exam_score is not null
        and app.scholarship_exam_score > 0
        then 'scholarship_exam'
      else 'none'
    end as effective_discount_source,
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
    honor.tuition_discount_percent,
    app.application_status,
    app.rejection_reason,
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
    app.scholarship_exam_score,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at,
    student.student_number,
    account.student_id,
    account.status
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

drop function if exists public.list_admin_students(text);

create or replace function public.list_admin_students(
  p_branch text default null
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
  program text,
  year_level text,
  section text,
  shs_track_type text,
  strand_or_course text,
  document_submitted_date date,
  contact_number text,
  email text,
  address text,
  status text,
  student_status text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  sex text,
  civil_status text
)
language sql
security definer
set search_path = public
as $$
  select
    student.id as student_id,
    student.student_number,
    coalesce(app.tracking_number, student.student_number) as tracking_number,
    branch.name as branch,
    concat_ws(' ', student.first_name, student.middle_name, student.last_name) as full_name,
    student.first_name,
    student.last_name,
    student.middle_name,
    case
      when program.name = 'Senior High School' then 'SHS'
      else 'College'
    end as program,
    student.year_level,
    student.section,
    case
      when program.name = 'Senior High School' and track.code in ('ict', 'ia')
        then 'Technical Professional Track'
      when program.name = 'Senior High School'
        then 'Academic Track'
      else null
    end as shs_track_type,
    track.name as strand_or_course,
    student.document_submitted_date,
    contact.phone_number as contact_number,
    contact.email::text as email,
    contact.address,
    public.resolve_admin_student_status(student.status, student.completion_status) as status,
    status.label as student_status,
    false as requested_own_schedule,
    null::text as own_schedule_request_status,
    null::text as own_schedule_academic_year,
    null::text as own_schedule_semester,
    null::text as own_schedule_selection_status,
    contact.birth_date,
    contact.guardian_name,
    contact.guardian_contact,
    student.sex,
    student.civil_status
  from public.student_profiles student
  join public.admission_branches branch
    on branch.id = student.branch_id
  join public.admission_student_statuses status
    on status.id = student.student_status_id
  join public.program_offerings offering
    on offering.id = student.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  join public.program_tracks track
    on track.id = student.track_id
  join public.student_contact_details contact
    on contact.student_id = student.id
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where
    p_branch is null
    or lower(branch.code) = lower(trim(p_branch))
    or lower(branch.name) = lower(trim(p_branch))
  order by
    branch.name,
    student.created_at desc,
    student.student_number;
$$;

drop function if exists public.get_next_admin_student_number(text);

create or replace function public.get_next_admin_student_number(
  p_branch text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  return public.generate_student_number(v_branch_id);
end;
$$;

drop function if exists public.upsert_admin_student(jsonb);

create or replace function public.upsert_admin_student(
  p_payload jsonb
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
  program text,
  year_level text,
  section text,
  shs_track_type text,
  strand_or_course text,
  document_submitted_date date,
  contact_number text,
  email text,
  address text,
  status text,
  student_status text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  sex text,
  civil_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_program_name text;
  v_program_id uuid;
  v_program_offering_id uuid;
  v_track_id uuid;
  v_resolved_track_name text;
  v_track_code text;
  v_student_status_id uuid;
  v_student_status_label text;
  v_requested_student_number text;
  v_tracking_number text;
  v_existing_student_id uuid;
  v_result_student_number text;
  v_profile_status text;
  v_completion_status text;
  v_document_submitted_date date;
  v_birth_date date;
  v_sex text;
  v_civil_status text;
begin
  if trim(coalesce(p_payload->>'first_name', '')) = ''
    or trim(coalesce(p_payload->>'last_name', '')) = ''
    or trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'program', '')) = ''
    or trim(coalesce(p_payload->>'year_level', '')) = ''
    or trim(coalesce(p_payload->>'track_name', '')) = ''
    or trim(coalesce(p_payload->>'email', '')) = '' then
    raise exception 'First name, last name, branch, program, year level, track, and email are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_program_name := public.resolve_student_program_name(p_payload->>'program');

  select offering.id, program.id
  into v_program_offering_id, v_program_id
  from public.program_offerings offering
  join public.academic_programs program
    on program.id = offering.program_id
  where offering.branch_id = v_branch_id
    and offering.is_active
    and program.is_active
    and program.name = v_program_name
  limit 1;

  if v_program_offering_id is null then
    raise exception 'Program "%" is not offered in branch "%".', v_program_name, v_branch_name;
  end if;

  v_track_code := public.normalize_student_track_code(
    v_program_name,
    p_payload->>'track_name'
  );

  select track.id, track.name
  into v_track_id, v_resolved_track_name
  from public.program_tracks track
  where track.program_id = v_program_id
    and track.is_active
    and (
      (v_track_code is not null and track.code = v_track_code)
      or lower(track.name) = lower(trim(coalesce(p_payload->>'track_name', '')))
    )
  order by case
    when v_track_code is not null and track.code = v_track_code then 0
    else 1
  end
  limit 1;

  if v_track_id is null then
    raise exception 'Track "%" is not configured for program "%".', p_payload->>'track_name', v_program_name;
  end if;

  v_student_status_label := coalesce(
    nullif(trim(coalesce(p_payload->>'student_status', '')), ''),
    public.resolve_default_student_status_label(v_program_name)
  );

  select status.id
  into v_student_status_id
  from public.admission_student_statuses status
  where status.label = v_student_status_label
    and status.is_active
  limit 1;

  if v_student_status_id is null then
    raise exception 'Student status "%" is not configured in Supabase.', v_student_status_label;
  end if;

  v_requested_student_number := public.normalize_branch_student_number(
    p_payload->>'student_number',
    v_branch_id
  );
  v_requested_student_number := nullif(trim(coalesce(v_requested_student_number, '')), '');
  v_tracking_number := nullif(upper(trim(coalesce(p_payload->>'tracking_number', ''))), '');

  select
    student.id,
    student.student_number
  into
    v_existing_student_id,
    v_result_student_number
  from public.student_profiles student
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where student.branch_id = v_branch_id
    and (
      (v_requested_student_number is not null and upper(student.student_number) = upper(v_requested_student_number))
      or (v_tracking_number is not null and app.tracking_number = v_tracking_number)
    )
  order by case
    when v_requested_student_number is not null and upper(student.student_number) = upper(v_requested_student_number)
      then 0
    else 1
  end
  limit 1;

  if nullif(trim(coalesce(p_payload->>'document_submitted_date', '')), '') is not null then
    v_document_submitted_date := (p_payload->>'document_submitted_date')::date;
  else
    v_document_submitted_date := null;
  end if;

  if nullif(trim(coalesce(p_payload->>'birth_date', '')), '') is not null then
    v_birth_date := (p_payload->>'birth_date')::date;
  else
    v_birth_date := null;
  end if;

  case lower(trim(coalesce(p_payload->>'status', 'incomplete')))
    when 'complete' then
      v_profile_status := 'active';
      v_completion_status := 'complete';
    when 'incomplete' then
      v_profile_status := 'active';
      v_completion_status := 'incomplete';
    when 'archived' then
      v_profile_status := 'archived';
      v_completion_status := 'complete';
    when 'graduated' then
      v_profile_status := 'graduated';
      v_completion_status := 'complete';
    else
      raise exception 'Status "%" is not supported.', p_payload->>'status';
  end case;

  v_sex := coalesce(nullif(trim(coalesce(p_payload->>'sex', '')), ''), 'Male');
  if v_sex not in ('Male', 'Female') then
    raise exception 'Sex "%" is not supported.', v_sex;
  end if;

  v_civil_status := coalesce(
    nullif(trim(coalesce(p_payload->>'civil_status', '')), ''),
    'Single'
  );
  if v_civil_status not in ('Single', 'Married', 'Widowed', 'Separated') then
    raise exception 'Civil status "%" is not supported.', v_civil_status;
  end if;

  if v_existing_student_id is null then
    if v_requested_student_number is null then
      v_result_student_number := public.generate_student_number(v_branch_id);
    else
      if exists (
        select 1
        from public.student_profiles student
        where student.branch_id = v_branch_id
          and upper(student.student_number) = upper(v_requested_student_number)
      ) then
        raise exception 'Student number "%" is already assigned in this branch.', v_requested_student_number;
      end if;

      v_result_student_number := v_requested_student_number;
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
      section,
      status,
      completion_status,
      document_submitted_date,
      approved_at
    )
    values (
      null,
      v_branch_id,
      v_student_status_id,
      v_program_offering_id,
      v_track_id,
      v_result_student_number,
      trim(p_payload->>'first_name'),
      trim(p_payload->>'last_name'),
      nullif(trim(coalesce(p_payload->>'middle_name', '')), ''),
      v_sex,
      v_civil_status,
      trim(p_payload->>'year_level'),
      nullif(trim(coalesce(p_payload->>'section', '')), ''),
      v_profile_status,
      v_completion_status,
      coalesce(v_document_submitted_date, timezone('utc', now())::date),
      timezone('utc', now())
    )
    returning id into v_existing_student_id;
  else
    update public.student_profiles student
    set student_status_id = v_student_status_id,
        program_offering_id = v_program_offering_id,
        track_id = v_track_id,
        first_name = trim(p_payload->>'first_name'),
        last_name = trim(p_payload->>'last_name'),
        middle_name = nullif(trim(coalesce(p_payload->>'middle_name', '')), ''),
        sex = v_sex,
        civil_status = v_civil_status,
        year_level = trim(p_payload->>'year_level'),
        section = nullif(trim(coalesce(p_payload->>'section', '')), ''),
        status = v_profile_status,
        completion_status = v_completion_status,
        document_submitted_date = coalesce(
          v_document_submitted_date,
          student.document_submitted_date,
          timezone('utc', now())::date
        )
    where student.id = v_existing_student_id;
  end if;

  insert into public.student_contact_details (
    student_id,
    email,
    phone_number,
    address,
    birth_date,
    guardian_name,
    guardian_contact
  )
  values (
    v_existing_student_id,
    trim(lower(p_payload->>'email'))::citext,
    regexp_replace(trim(coalesce(p_payload->>'phone_number', '')), '\D', '', 'g'),
    trim(coalesce(p_payload->>'address', '')),
    v_birth_date,
    nullif(trim(coalesce(p_payload->>'guardian_name', '')), ''),
    nullif(trim(coalesce(p_payload->>'guardian_contact', '')), '')
  )
  on conflict (student_id) do update
  set email = excluded.email,
      phone_number = excluded.phone_number,
      address = excluded.address,
      birth_date = coalesce(excluded.birth_date, student_contact_details.birth_date),
      guardian_name = coalesce(excluded.guardian_name, student_contact_details.guardian_name),
      guardian_contact = coalesce(excluded.guardian_contact, student_contact_details.guardian_contact);

  return query
  select *
  from public.list_admin_students(v_branch_name) student
  where student.student_number = v_result_student_number
  limit 1;
end;
$$;

drop function if exists public.update_admin_student_email(jsonb);

create or replace function public.update_admin_student_email(
  p_payload jsonb
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
  program text,
  year_level text,
  section text,
  shs_track_type text,
  strand_or_course text,
  document_submitted_date date,
  contact_number text,
  email text,
  address text,
  status text,
  student_status text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  sex text,
  civil_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_student_id uuid;
  v_student_number text;
begin
  if trim(coalesce(p_payload->>'email', '')) = '' then
    raise exception 'Email is required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  select student.id, student.student_number
  into v_student_id, v_student_number
  from public.student_profiles student
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where student.branch_id = v_branch_id
    and (
      upper(student.student_number) = upper(trim(coalesce(p_payload->>'student_number', '')))
      or (
        trim(coalesce(p_payload->>'tracking_number', '')) <> ''
        and app.tracking_number = upper(trim(p_payload->>'tracking_number'))
      )
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student "%" was not found in branch "%".', p_payload->>'student_number', v_branch_name;
  end if;

  update public.student_contact_details contact
  set email = trim(lower(p_payload->>'email'))::citext
  where contact.student_id = v_student_id;

  if not found then
    raise exception 'Student contact details were not found for "%".', v_student_number;
  end if;

  update public.admission_applications app
  set email = trim(lower(p_payload->>'email'))::citext,
      updated_at = timezone('utc', now())
  from public.student_profiles student
  where student.id = v_student_id
    and app.id = student.admission_application_id;

  return query
  select *
  from public.list_admin_students(v_branch_name) student
  where student.student_number = v_student_number
  limit 1;
end;
$$;

drop function if exists public.set_admin_student_status(jsonb);

create or replace function public.set_admin_student_status(
  p_payload jsonb
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
  program text,
  year_level text,
  section text,
  shs_track_type text,
  strand_or_course text,
  document_submitted_date date,
  contact_number text,
  email text,
  address text,
  status text,
  student_status text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  sex text,
  civil_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_student_id uuid;
  v_student_number text;
  v_profile_status text;
  v_completion_status text;
begin
  if trim(coalesce(p_payload->>'student_number', '')) = '' then
    raise exception 'Student number is required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  select student.id, student.student_number
  into v_student_id, v_student_number
  from public.student_profiles student
  where upper(student.student_number) = upper(trim(p_payload->>'student_number'))
    and (
      v_branch_id is null
      or student.branch_id = v_branch_id
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student number "%" was not found.', p_payload->>'student_number';
  end if;

  case lower(trim(coalesce(p_payload->>'status', '')))
    when 'complete' then
      v_profile_status := 'active';
      v_completion_status := 'complete';
    when 'incomplete' then
      v_profile_status := 'active';
      v_completion_status := 'incomplete';
    when 'archived' then
      v_profile_status := 'archived';
      v_completion_status := 'complete';
    when 'graduated' then
      v_profile_status := 'graduated';
      v_completion_status := 'complete';
    else
      raise exception 'Status "%" is not supported.', p_payload->>'status';
  end case;

  update public.student_profiles student
  set status = v_profile_status,
      completion_status = case
        when v_profile_status = 'active' then v_completion_status
        else student.completion_status
      end
  where student.id = v_student_id;

  return query
  select *
  from public.list_admin_students(v_branch_name) student
  where student.student_number = v_student_number
  limit 1;
end;
$$;

drop function if exists public.delete_admin_student(jsonb);

create or replace function public.delete_admin_student(
  p_payload jsonb
)
returns table (
  student_number text,
  tracking_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_student_id uuid;
  v_student_number text;
  v_tracking_number text;
begin
  if trim(coalesce(p_payload->>'student_number', '')) = '' then
    raise exception 'Student number is required.';
  end if;

  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  select student.id, student.student_number, app.tracking_number
  into v_student_id, v_student_number, v_tracking_number
  from public.student_profiles student
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where upper(student.student_number) = upper(trim(p_payload->>'student_number'))
    and (
      v_branch_id is null
      or student.branch_id = v_branch_id
    )
    and (
      trim(coalesce(p_payload->>'tracking_number', '')) = ''
      or upper(coalesce(app.tracking_number, '')) =
        upper(trim(p_payload->>'tracking_number'))
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student number "%" was not found.', p_payload->>'student_number';
  end if;

  delete from public.student_profiles student
  where student.id = v_student_id;

  return query
  select v_student_number, v_tracking_number;
end;
$$;

alter table public.student_profiles enable row level security;
alter table public.student_contact_details enable row level security;
alter table public.student_portal_accounts enable row level security;

create table if not exists public.branch_student_number_settings (
  branch_id uuid primary key references public.admission_branches(id) on delete cascade,
  next_sequence bigint not null default 261001,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_student_number_settings_next_sequence_check
    check (next_sequence between 0 and 1000000)
);

create or replace function public.get_default_branch_student_number_sequence(
  p_branch_id uuid
)
returns bigint
language sql
stable
set search_path = public
as $$
  select least(
    1000000,
    greatest(
      coalesce(
        max(public.extract_student_number_sequence(student.student_number)),
        261000
      ),
      261000
    ) + 1
  )
  from public.student_profiles student
  where p_branch_id is null
    or student.branch_id = p_branch_id;
$$;

create or replace function public.ensure_branch_student_number_setting(
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_student_number_settings (
    branch_id,
    next_sequence,
    updated_at
  )
  values (
    p_branch_id,
    public.get_default_branch_student_number_sequence(p_branch_id),
    timezone('utc', now())
  )
  on conflict (branch_id) do nothing;
end;
$$;

create or replace function public.peek_branch_student_number(
  p_branch_id uuid,
  p_start_sequence bigint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_sequence bigint;
  v_branch_prefix text;
  v_student_number text;
begin
  perform public.ensure_branch_student_number_setting(p_branch_id);

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

  if p_start_sequence is null then
    select setting.next_sequence
    into v_candidate_sequence
    from public.branch_student_number_settings setting
    where setting.branch_id = p_branch_id;
  else
    v_candidate_sequence := p_start_sequence;
  end if;

  loop
    if v_candidate_sequence > 999999 then
      return '';
    end if;

    if coalesce(v_branch_prefix, '') = '' then
      v_student_number := lpad(v_candidate_sequence::text, 6, '0');
    else
      v_student_number := format(
        '%s-%s',
        v_branch_prefix,
        lpad(v_candidate_sequence::text, 6, '0')
      );
    end if;

    if not exists (
      select 1
      from public.student_profiles student
      where student.branch_id = p_branch_id
        and upper(student.student_number) = upper(v_student_number)
    ) then
      return v_student_number;
    end if;

    v_candidate_sequence := v_candidate_sequence + 1;
  end loop;
end;
$$;

create or replace function public.get_branch_student_number_setting(
  p_branch text
)
returns table (
  branch text,
  prefix text,
  next_sequence bigint,
  next_digits text,
  next_student_number text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_prefix text;
begin
  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  perform public.ensure_branch_student_number_setting(v_branch_id);

  v_prefix := public.resolve_student_number_prefix(v_branch_id);

  return query
  select
    v_branch_name,
    coalesce(v_prefix, ''),
    setting.next_sequence,
    case
      when setting.next_sequence > 999999 then ''
      else lpad(setting.next_sequence::text, 6, '0')
    end,
    public.peek_branch_student_number(v_branch_id, setting.next_sequence),
    setting.updated_at
  from public.branch_student_number_settings setting
  where setting.branch_id = v_branch_id;
end;
$$;

create or replace function public.set_branch_student_number_setting(
  p_branch text,
  p_next_digits text
)
returns table (
  branch text,
  prefix text,
  next_sequence bigint,
  next_digits text,
  next_student_number text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_next_digits text;
  v_next_sequence bigint;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_next_digits := regexp_replace(trim(coalesce(p_next_digits, '')), '\D', '', 'g');

  if v_next_digits !~ '^[0-9]{6}$' then
    raise exception 'Student number start must be exactly 6 digits.';
  end if;

  v_next_sequence := v_next_digits::bigint;

  insert into public.branch_student_number_settings (
    branch_id,
    next_sequence,
    updated_at
  )
  values (
    v_branch_id,
    v_next_sequence,
    timezone('utc', now())
  )
  on conflict (branch_id) do update
  set next_sequence = excluded.next_sequence,
      updated_at = excluded.updated_at;

  return query
  select *
  from public.get_branch_student_number_setting(p_branch);
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
  v_candidate_sequence bigint;
  v_branch_prefix text;
  v_student_number text;
begin
  perform pg_advisory_xact_lock(2610, coalesce(hashtext(p_branch_id::text), 0));
  perform public.ensure_branch_student_number_setting(p_branch_id);

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

  select setting.next_sequence
  into v_candidate_sequence
  from public.branch_student_number_settings setting
  where setting.branch_id = p_branch_id
  for update;

  loop
    if v_candidate_sequence > 999999 then
      raise exception 'No student numbers are available for this branch. Please set a new 6-digit start value.';
    end if;

    if coalesce(v_branch_prefix, '') = '' then
      v_student_number := lpad(v_candidate_sequence::text, 6, '0');
    else
      v_student_number := format(
        '%s-%s',
        v_branch_prefix,
        lpad(v_candidate_sequence::text, 6, '0')
      );
    end if;

    exit when not exists (
      select 1
      from public.student_profiles student
      where student.branch_id = p_branch_id
        and upper(student.student_number) = upper(v_student_number)
    );

    v_candidate_sequence := v_candidate_sequence + 1;
  end loop;

  update public.branch_student_number_settings setting
  set next_sequence = v_candidate_sequence + 1,
      updated_at = timezone('utc', now())
  where setting.branch_id = p_branch_id;

  return v_student_number;
end;
$$;

create or replace function public.get_next_admin_student_number(
  p_branch text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_student_number text;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_student_number := public.peek_branch_student_number(v_branch_id);

  if trim(coalesce(v_student_number, '')) = '' then
    raise exception 'No student numbers are available for this branch. Please set a new 6-digit start value.';
  end if;

  return v_student_number;
end;
$$;

grant execute on function public.generate_student_number() to anon, authenticated;
grant execute on function public.generate_student_number(uuid) to anon, authenticated;
grant execute on function public.sync_student_contact_email_to_admission() to anon, authenticated;
grant execute on function public.get_default_branch_student_number_sequence(uuid) to anon, authenticated;
grant execute on function public.ensure_branch_student_number_setting(uuid) to anon, authenticated;
grant execute on function public.peek_branch_student_number(uuid, bigint) to anon, authenticated;
grant execute on function public.get_branch_student_number_setting(text) to anon, authenticated;
grant execute on function public.set_branch_student_number_setting(text, text) to anon, authenticated;
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
grant execute on function public.student_portal_email_login(text) to anon, authenticated;
grant execute on function public.reset_student_portal_password(
  text,
  text,
  text,
  text
) to anon, authenticated;
grant execute on function public.get_admin_admission_queue(text) to anon, authenticated;
grant execute on function public.list_admin_students(text) to anon, authenticated;
grant execute on function public.get_next_admin_student_number(text) to anon, authenticated;
grant execute on function public.upsert_admin_student(jsonb) to anon, authenticated;
grant execute on function public.update_admin_student_email(jsonb) to anon, authenticated;
grant execute on function public.set_admin_student_status(jsonb) to anon, authenticated;
grant execute on function public.delete_admin_student(jsonb) to anon, authenticated;
