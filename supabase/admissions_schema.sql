create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.admission_branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint admission_branches_code_format check (code = lower(code))
);

create table if not exists public.admission_student_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.academic_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  level text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint academic_programs_level_check
    check (level in ('college', 'senior_high_school'))
);

create table if not exists public.program_offerings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  program_id uuid not null references public.academic_programs(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (branch_id, program_id)
);

create table if not exists public.program_tracks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academic_programs(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (program_id, code),
  unique (program_id, name)
);

create table if not exists public.admission_honors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  tuition_discount_percent numeric(5, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admission_requirement_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admission_requirement_rules (
  id uuid primary key default gen_random_uuid(),
  student_status_id uuid not null references public.admission_student_statuses(id) on delete cascade,
  requirement_type_id uuid not null references public.admission_requirement_types(id) on delete cascade,
  program_level text not null default 'any',
  honor_required boolean not null default false,
  is_optional boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint admission_requirement_rules_program_level_check
    check (program_level in ('any', 'college', 'senior_high_school')),
  unique (student_status_id, requirement_type_id, program_level, honor_required)
);

create table if not exists public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  tracking_number text not null unique,
  branch_id uuid not null references public.admission_branches(id),
  student_status_id uuid not null references public.admission_student_statuses(id),
  program_offering_id uuid not null references public.program_offerings(id),
  track_id uuid not null references public.program_tracks(id),
  honor_id uuid references public.admission_honors(id),
  first_name text not null,
  last_name text not null,
  middle_name text,
  sex text not null,
  civil_status text not null,
  address text not null,
  email citext not null,
  phone_number text not null,
  last_school_attended text not null,
  year_completion integer not null,
  applied_for_scholarship boolean not null default false,
  current_step smallint not null default 2,
  application_status text not null default 'draft',
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admission_applications_sex_check
    check (sex in ('Male', 'Female')),
  constraint admission_applications_civil_status_check
    check (civil_status in ('Single', 'Married', 'Widowed', 'Separated')),
  constraint admission_applications_year_completion_check
    check (
      year_completion between 1900
      and extract(year from timezone('utc', now()))::integer + 1
    ),
  constraint admission_applications_current_step_check
    check (current_step between 1 and 5),
  constraint admission_applications_status_check
    check (
      application_status in (
        'draft',
        'submitted',
        'under_review',
        'accepted',
        'rejected',
        'cancelled'
      )
    )
);

create table if not exists public.admission_application_requirement_files (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  requirement_type_id uuid not null references public.admission_requirement_types(id),
  storage_bucket text not null,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  uploaded_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (application_id, requirement_type_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists admission_applications_set_updated_at on public.admission_applications;
create trigger admission_applications_set_updated_at
before update on public.admission_applications
for each row
execute function public.set_updated_at();

drop trigger if exists admission_application_requirement_files_set_updated_at on public.admission_application_requirement_files;
create trigger admission_application_requirement_files_set_updated_at
before update on public.admission_application_requirement_files
for each row
execute function public.set_updated_at();

create index if not exists admission_applications_tracking_number_idx
  on public.admission_applications (tracking_number);

create index if not exists admission_applications_email_idx
  on public.admission_applications (email);

create index if not exists admission_applications_phone_number_idx
  on public.admission_applications (phone_number);

create index if not exists admission_applications_status_idx
  on public.admission_applications (application_status, current_step);

create unique index if not exists admission_applications_active_contact_unique_idx
  on public.admission_applications (email, phone_number)
  where application_status <> 'cancelled';

insert into public.admission_branches (code, name)
values
  ('bacoor', 'Bacoor'),
  ('taytay', 'Taytay'),
  ('gma', 'GMA')
on conflict (code) do update
set name = excluded.name,
    is_active = true;

insert into public.admission_student_statuses (code, label)
values
  ('junior_high_completer', 'Junior High Completer'),
  ('senior_high_graduate', 'Senior High Graduate'),
  ('transferee', 'Transferee'),
  ('foreign_student', 'Foreign Student'),
  ('cross_registrant', 'Cross-Registrant')
on conflict (code) do update
set label = excluded.label,
    is_active = true;

insert into public.academic_programs (code, name, level)
values
  ('college', 'College', 'college'),
  ('senior_high_school', 'Senior High School', 'senior_high_school')
on conflict (code) do update
set name = excluded.name,
    level = excluded.level,
    is_active = true;

insert into public.program_offerings (branch_id, program_id)
select branch.id, program.id
from public.admission_branches branch
join public.academic_programs program
  on (
    (branch.code = 'bacoor' and program.code in ('college', 'senior_high_school'))
    or (branch.code in ('taytay', 'gma') and program.code = 'senior_high_school')
  )
on conflict (branch_id, program_id) do update
set is_active = true;

insert into public.program_tracks (program_id, code, name)
select program.id, track.code, track.name
from public.academic_programs program
join (
  values
    ('college', 'bse', 'BSE - Bachelor of Entrepreneurship'),
    ('senior_high_school', 'abm', 'ABM - Accountancy, Business, and Management'),
    ('senior_high_school', 'humss', 'HUMSS - Humanities and Social Sciences'),
    ('senior_high_school', 'gas', 'GAS - General Academic Strand'),
    ('senior_high_school', 'ict', 'ICT - Information and Communications Technology'),
    ('senior_high_school', 'ia', 'IA - Industrial Arts')
) as track(program_code, code, name)
  on track.program_code = program.code
on conflict (program_id, code) do update
set name = excluded.name,
    is_active = true;

insert into public.admission_honors (code, label, tuition_discount_percent)
values
  ('no_honor', 'No Honor', 0),
  ('with_honor', 'With Honor (50%)', 50),
  ('high_honor', 'High Honor (60%)', 60),
  ('highest_honor', 'Highest Honor (80%)', 80)
on conflict (code) do update
set label = excluded.label,
    tuition_discount_percent = excluded.tuition_discount_percent,
    is_active = true;

insert into public.admission_requirement_types (code, name, sort_order)
values
  ('form_137', 'Form 137', 10),
  ('grade_report_card', 'Grade Report Card', 20),
  ('birth_certificate_psa', 'Birth Certificate/PSA', 30),
  ('good_moral_character', 'Good Moral Character', 40),
  ('diploma_certificate_of_graduation', 'Diploma/Certificate of Graduation', 50),
  ('transcript_of_records', 'Transcript of Records (TOR)', 60),
  ('honorable_dismissal', 'Honorable Dismissal', 70),
  ('passport', 'Passport', 80),
  ('visa', 'Visa', 90),
  ('permit_to_cross_register', 'Permit to Cross-Register', 100),
  ('current_school_id', 'Current School ID', 110),
  ('honor_certificate', 'Honor Certificate', 120)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.admission_requirement_rules (
  student_status_id,
  requirement_type_id,
  program_level,
  honor_required,
  is_optional
)
select
  status.id,
  requirement.id,
  rule.program_level,
  rule.honor_required,
  rule.is_optional
from (
  values
    ('Junior High Completer', 'form_137', 'any', false, true),
    ('Junior High Completer', 'grade_report_card', 'any', false, true),
    ('Junior High Completer', 'birth_certificate_psa', 'any', false, true),
    ('Junior High Completer', 'good_moral_character', 'any', false, true),
    ('Senior High Graduate', 'form_137', 'any', false, true),
    ('Senior High Graduate', 'diploma_certificate_of_graduation', 'any', false, true),
    ('Senior High Graduate', 'birth_certificate_psa', 'any', false, true),
    ('Senior High Graduate', 'good_moral_character', 'any', false, true),
    ('Transferee', 'transcript_of_records', 'any', false, true),
    ('Transferee', 'honorable_dismissal', 'any', false, true),
    ('Transferee', 'birth_certificate_psa', 'any', false, true),
    ('Transferee', 'good_moral_character', 'any', false, true),
    ('Foreign Student', 'passport', 'any', false, true),
    ('Foreign Student', 'visa', 'any', false, true),
    ('Foreign Student', 'birth_certificate_psa', 'any', false, true),
    ('Foreign Student', 'good_moral_character', 'any', false, true),
    ('Cross-Registrant', 'permit_to_cross_register', 'any', false, true),
    ('Cross-Registrant', 'current_school_id', 'any', false, true),
    ('Cross-Registrant', 'birth_certificate_psa', 'any', false, true),
    ('Cross-Registrant', 'good_moral_character', 'any', false, true),
    ('Senior High Graduate', 'honor_certificate', 'college', true, false),
    ('Transferee', 'honor_certificate', 'college', true, false),
    ('Foreign Student', 'honor_certificate', 'college', true, false),
    ('Cross-Registrant', 'honor_certificate', 'college', true, false)
) as rule(status_label, requirement_code, program_level, honor_required, is_optional)
join public.admission_student_statuses status
  on status.label = rule.status_label
join public.admission_requirement_types requirement
  on requirement.code = rule.requirement_code
on conflict (student_status_id, requirement_type_id, program_level, honor_required) do update
set is_optional = excluded.is_optional;

create or replace function public.generate_aics_tracking_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_tracking_number text;
begin
  loop
    generated_tracking_number :=
      'AICS-'
      || to_char(timezone('utc', now()), 'YYYYMMDD')
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    exit when not exists (
      select 1
      from public.admission_applications
      where tracking_number = generated_tracking_number
    );
  end loop;

  return generated_tracking_number;
end;
$$;

create or replace function public.get_admission_progress(
  p_tracking_number text
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
  applied_for_scholarship boolean,
  application_status text,
  current_step smallint,
  first_name text,
  last_name text,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    app.applied_for_scholarship,
    app.application_status,
    app.current_step,
    app.first_name,
    app.last_name,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at
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
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;
$$;

create or replace function public.upsert_admission_application(
  p_tracking_number text,
  p_branch_code text,
  p_student_status_label text,
  p_program_name text,
  p_track_name text,
  p_first_name text,
  p_last_name text,
  p_middle_name text default null,
  p_sex text default 'Male',
  p_civil_status text default 'Single',
  p_address text default '',
  p_email text default '',
  p_phone_number text default '',
  p_last_school_attended text default '',
  p_year_completion integer default null,
  p_honor_label text default 'No Honor',
  p_apply_scholarship boolean default false,
  p_current_step smallint default 2,
  p_application_status text default 'draft'
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
  applied_for_scholarship boolean,
  application_status text,
  current_step smallint,
  first_name text,
  last_name text,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tracking_number text;
  v_branch_id uuid;
  v_student_status_id uuid;
  v_program_offering_id uuid;
  v_program_id uuid;
  v_track_id uuid;
  v_honor_id uuid;
  v_duplicate_tracking text;
begin
  select id
  into v_branch_id
  from public.admission_branches
  where code = lower(trim(p_branch_code))
    and is_active
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch_code;
  end if;

  select id
  into v_student_status_id
  from public.admission_student_statuses
  where label = trim(p_student_status_label)
    and is_active
  limit 1;

  if v_student_status_id is null then
    raise exception 'Student status "%" is not configured in Supabase.', p_student_status_label;
  end if;

  select offering.id, program.id
  into v_program_offering_id, v_program_id
  from public.program_offerings offering
  join public.academic_programs program
    on program.id = offering.program_id
  where offering.branch_id = v_branch_id
    and program.name = trim(p_program_name)
    and offering.is_active
    and program.is_active
  limit 1;

  if v_program_offering_id is null then
    raise exception 'Program "%" is not offered in branch "%".', p_program_name, p_branch_code;
  end if;

  select id
  into v_track_id
  from public.program_tracks
  where program_id = v_program_id
    and name = trim(p_track_name)
    and is_active
  limit 1;

  if v_track_id is null then
    raise exception 'Track "%" is not configured for program "%".', p_track_name, p_program_name;
  end if;

  if coalesce(nullif(trim(p_honor_label), ''), 'No Honor') <> 'No Honor' then
    select id
    into v_honor_id
    from public.admission_honors
    where label = trim(p_honor_label)
      and is_active
    limit 1;

    if v_honor_id is null then
      raise exception 'Honor "%" is not configured in Supabase.', p_honor_label;
    end if;
  else
    v_honor_id := null;
  end if;

  select app.tracking_number
  into v_duplicate_tracking
  from public.admission_applications app
  where app.tracking_number <> coalesce(upper(trim(p_tracking_number)), '')
    and app.application_status <> 'cancelled'
    and (
      app.email = trim(lower(p_email))::citext
      or app.phone_number = regexp_replace(trim(p_phone_number), '\D', '', 'g')
    )
  order by app.updated_at desc
  limit 1;

  if v_duplicate_tracking is not null then
    raise exception using
      message = format(
        'A matching application already exists for this email or phone number. Existing tracking number: %s',
        v_duplicate_tracking
      ),
      errcode = 'P0001';
  end if;

  if p_tracking_number is null or trim(p_tracking_number) = '' then
    v_tracking_number := public.generate_aics_tracking_number();
  else
    v_tracking_number := upper(trim(p_tracking_number));
  end if;

  if v_tracking_number is null or v_tracking_number = '' then
    raise exception 'Tracking number generation failed.';
  end if;

  update public.admission_applications as app
  set branch_id = v_branch_id,
      student_status_id = v_student_status_id,
      program_offering_id = v_program_offering_id,
      track_id = v_track_id,
      honor_id = v_honor_id,
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      middle_name = nullif(trim(p_middle_name), ''),
      sex = trim(p_sex),
      civil_status = trim(p_civil_status),
      address = trim(p_address),
      email = trim(lower(p_email))::citext,
      phone_number = regexp_replace(trim(p_phone_number), '\D', '', 'g'),
      last_school_attended = trim(p_last_school_attended),
      year_completion = p_year_completion,
      applied_for_scholarship = p_apply_scholarship,
      current_step = greatest(app.current_step, p_current_step),
      application_status = p_application_status
  where app.tracking_number = v_tracking_number
  returning app.tracking_number into v_tracking_number;

  if not found then
    insert into public.admission_applications (
      tracking_number,
      branch_id,
      student_status_id,
      program_offering_id,
      track_id,
      honor_id,
      first_name,
      last_name,
      middle_name,
      sex,
      civil_status,
      address,
      email,
      phone_number,
      last_school_attended,
      year_completion,
      applied_for_scholarship,
      current_step,
      application_status
    )
    values (
      coalesce(v_tracking_number, public.generate_aics_tracking_number()),
      v_branch_id,
      v_student_status_id,
      v_program_offering_id,
      v_track_id,
      v_honor_id,
      trim(p_first_name),
      trim(p_last_name),
      nullif(trim(p_middle_name), ''),
      trim(p_sex),
      trim(p_civil_status),
      trim(p_address),
      trim(lower(p_email))::citext,
      regexp_replace(trim(p_phone_number), '\D', '', 'g'),
      trim(p_last_school_attended),
      p_year_completion,
      p_apply_scholarship,
      p_current_step,
      p_application_status
    )
    returning public.admission_applications.tracking_number into v_tracking_number;
  end if;

  return query
  select *
  from public.get_admission_progress(v_tracking_number);
end;
$$;

create or replace function public.update_admission_progress(
  p_tracking_number text,
  p_current_step smallint,
  p_application_status text default null,
  p_mark_submitted boolean default false
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
  applied_for_scholarship boolean,
  application_status text,
  current_step smallint,
  first_name text,
  last_name text,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tracking_number text;
begin
  update public.admission_applications as app
  set current_step = greatest(app.current_step, p_current_step),
      application_status = coalesce(p_application_status, app.application_status),
      submitted_at = case
        when p_mark_submitted then coalesce(app.submitted_at, timezone('utc', now()))
        else app.submitted_at
      end
  where app.tracking_number = upper(trim(p_tracking_number))
  returning app.tracking_number into v_tracking_number;

  if v_tracking_number is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  return query
  select *
  from public.get_admission_progress(v_tracking_number);
end;
$$;

create or replace function public.save_admission_requirement_file(
  p_tracking_number text,
  p_requirement_code text,
  p_requirement_name text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text default null,
  p_file_size_bytes bigint default null
)
returns table (
  tracking_number text,
  requirement_code text,
  requirement_name text,
  file_name text,
  storage_path text,
  uploaded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_application_id uuid;
  v_requirement_type_id uuid;
  v_uploaded_at timestamptz := now();
begin
  select id
  into v_application_id
  from public.admission_applications app
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;

  if v_application_id is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  select id
  into v_requirement_type_id
  from public.admission_requirement_types
  where code = trim(p_requirement_code)
    and is_active
  limit 1;

  if v_requirement_type_id is null then
    raise exception 'Requirement "%" is not configured in Supabase.', p_requirement_code;
  end if;

  insert into public.admission_application_requirement_files (
    application_id,
    requirement_type_id,
    storage_bucket,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes
  )
  values (
    v_application_id,
    v_requirement_type_id,
    p_storage_bucket,
    p_storage_path,
    p_original_file_name,
    p_mime_type,
    p_file_size_bytes
  )
  on conflict (application_id, requirement_type_id) do update
  set storage_bucket = excluded.storage_bucket,
      storage_path = excluded.storage_path,
      original_file_name = excluded.original_file_name,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      uploaded_at = v_uploaded_at;

  update public.admission_applications as app
  set requirements_uploaded_at = v_uploaded_at,
      current_step = greatest(app.current_step, 3)
  where app.id = v_application_id;

  return query
  select
    upper(trim(p_tracking_number)) as tracking_number,
    trim(p_requirement_code) as requirement_code,
    trim(p_requirement_name) as requirement_name,
    p_original_file_name as file_name,
    p_storage_path as storage_path,
    v_uploaded_at as uploaded_at;
end;
$$;

create or replace function public.find_admission_tracking_numbers(
  p_email text default null,
  p_phone_number text default null
)
returns table (
  tracking_number text,
  branch_name text,
  program_name text,
  application_status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    app.tracking_number,
    branch.name as branch_name,
    program.name as program_name,
    app.application_status,
    app.created_at
  from public.admission_applications app
  join public.admission_branches branch
    on branch.id = app.branch_id
  join public.program_offerings offering
    on offering.id = app.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  where (
    p_email is not null
    and app.email = trim(lower(p_email))::citext
  ) or (
    p_phone_number is not null
    and app.phone_number = regexp_replace(trim(p_phone_number), '\D', '', 'g')
  )
  order by app.created_at desc;
$$;

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
  requirement_files jsonb
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
    ) as requirement_files
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
    app.updated_at
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

alter table public.admission_branches enable row level security;
alter table public.admission_student_statuses enable row level security;
alter table public.academic_programs enable row level security;
alter table public.program_offerings enable row level security;
alter table public.program_tracks enable row level security;
alter table public.admission_honors enable row level security;
alter table public.admission_requirement_types enable row level security;
alter table public.admission_requirement_rules enable row level security;
alter table public.admission_applications enable row level security;
alter table public.admission_application_requirement_files enable row level security;

drop policy if exists "Reference data is viewable by everyone" on public.admission_branches;
create policy "Reference data is viewable by everyone"
on public.admission_branches
for select
to anon, authenticated
using (true);

drop policy if exists "Student statuses are viewable by everyone" on public.admission_student_statuses;
create policy "Student statuses are viewable by everyone"
on public.admission_student_statuses
for select
to anon, authenticated
using (true);

drop policy if exists "Programs are viewable by everyone" on public.academic_programs;
create policy "Programs are viewable by everyone"
on public.academic_programs
for select
to anon, authenticated
using (true);

drop policy if exists "Program offerings are viewable by everyone" on public.program_offerings;
create policy "Program offerings are viewable by everyone"
on public.program_offerings
for select
to anon, authenticated
using (true);

drop policy if exists "Program tracks are viewable by everyone" on public.program_tracks;
create policy "Program tracks are viewable by everyone"
on public.program_tracks
for select
to anon, authenticated
using (true);

drop policy if exists "Admission honors are viewable by everyone" on public.admission_honors;
create policy "Admission honors are viewable by everyone"
on public.admission_honors
for select
to anon, authenticated
using (true);

drop policy if exists "Requirement types are viewable by everyone" on public.admission_requirement_types;
create policy "Requirement types are viewable by everyone"
on public.admission_requirement_types
for select
to anon, authenticated
using (true);

drop policy if exists "Requirement rules are viewable by everyone" on public.admission_requirement_rules;
create policy "Requirement rules are viewable by everyone"
on public.admission_requirement_rules
for select
to anon, authenticated
using (true);

grant execute on function public.generate_aics_tracking_number() to anon, authenticated;
grant execute on function public.get_admission_progress(text) to anon, authenticated;
grant execute on function public.upsert_admission_application(
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
  text,
  text,
  text,
  text,
  integer,
  text,
  boolean,
  smallint,
  text
) to anon, authenticated;
grant execute on function public.update_admission_progress(text, smallint, text, boolean) to anon, authenticated;
grant execute on function public.save_admission_requirement_file(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint
) to anon, authenticated;
grant execute on function public.find_admission_tracking_numbers(text, text) to anon, authenticated;
grant execute on function public.get_admin_admission_queue(text) to anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'admission-requirements',
  'admission-requirements',
  false,
  5242880,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admission requirement files can be uploaded by anyone" on storage.objects;
create policy "Admission requirement files can be uploaded by anyone"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'admission-requirements');

drop policy if exists "Admission requirement files can be updated by anyone" on storage.objects;
create policy "Admission requirement files can be updated by anyone"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'admission-requirements')
with check (bucket_id = 'admission-requirements');

drop policy if exists "Admission requirement files can be viewed by anyone" on storage.objects;
create policy "Admission requirement files can be viewed by anyone"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'admission-requirements');
