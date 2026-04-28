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

create or replace function public.resolve_academic_branch(p_branch text)
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

create or replace function public.normalize_academic_program(p_program text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_program, '')))
    when 'college' then 'College'
    when 'shs' then 'SHS'
    when 'senior high school' then 'SHS'
    else trim(coalesce(p_program, ''))
  end;
$$;

create or replace function public.normalize_academic_semester(p_semester text)
returns text
language sql
immutable
as $$
  select case
    when trim(coalesce(p_semester, '')) = '' then '1st Semester'
    when lower(trim(p_semester)) in ('1st semester', 'first semester') then '1st Semester'
    when lower(trim(p_semester)) in ('2nd semester', 'second semester') then '2nd Semester'
    when lower(trim(p_semester)) = 'summer' then 'Summer'
    else trim(p_semester)
  end;
$$;

create table if not exists public.branch_academic_subjects (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  code text not null,
  name text not null,
  units integer,
  program text not null,
  year_level text not null,
  semester text not null default '1st Semester',
  strand text,
  is_minor boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_academic_subjects_program_check
    check (program in ('College', 'SHS')),
  constraint branch_academic_subjects_units_check
    check (units is null or units >= 0),
  constraint branch_academic_subjects_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  unique (branch_id, external_id)
);

create table if not exists public.branch_academic_subject_prerequisites (
  subject_row_id uuid not null references public.branch_academic_subjects(id) on delete cascade,
  prerequisite_subject_row_id uuid not null references public.branch_academic_subjects(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (subject_row_id, prerequisite_subject_row_id),
  constraint branch_academic_subject_prerequisites_distinct_check
    check (subject_row_id <> prerequisite_subject_row_id)
);

create table if not exists public.branch_academic_instructors (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  name text not null,
  employee_id text not null,
  department text not null,
  email citext,
  contact_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (branch_id, external_id),
  unique (branch_id, employee_id)
);

create table if not exists public.branch_class_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  code text not null,
  program text not null,
  year_level text not null,
  semester text not null default '1st Semester',
  strand text,
  section text not null,
  current_enrollees integer not null default 0,
  max_capacity integer not null default 40,
  enrollee_ids text[] not null default array[]::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_class_sections_program_check
    check (program in ('College', 'SHS')),
  constraint branch_class_sections_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  constraint branch_class_sections_current_enrollees_check
    check (current_enrollees >= 0),
  constraint branch_class_sections_max_capacity_check
    check (max_capacity > 0),
  unique (branch_id, external_id),
  unique (branch_id, code)
);

create table if not exists public.branch_assignment_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  room_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (branch_id, room_name)
);

create table if not exists public.branch_subject_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  subject_row_id uuid not null references public.branch_academic_subjects(id) on delete cascade,
  instructor_row_id uuid references public.branch_academic_instructors(id) on delete set null,
  section_row_id uuid not null references public.branch_class_sections(id) on delete cascade,
  academic_year text not null,
  semester text not null default '1st Semester',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_subject_assignments_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  unique (branch_id, external_id)
);

create table if not exists public.branch_subject_assignment_slots (
  id uuid primary key default extensions.gen_random_uuid(),
  assignment_id uuid not null references public.branch_subject_assignments(id) on delete cascade,
  sort_order integer not null default 0,
  day text not null,
  start_time text not null,
  end_time text not null,
  room text not null default 'TBA',
  created_at timestamptz not null default timezone('utc', now()),
  constraint branch_subject_assignment_slots_sort_order_check
    check (sort_order >= 0),
  constraint branch_subject_assignment_slots_start_time_check
    check (start_time ~ '^[0-9]{2}:[0-9]{2}$'),
  constraint branch_subject_assignment_slots_end_time_check
    check (end_time ~ '^[0-9]{2}:[0-9]{2}$')
);

create or replace function public.validate_academic_subject_prerequisite()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_subject_branch_id uuid;
  v_prerequisite_branch_id uuid;
begin
  select subject.branch_id
  into v_subject_branch_id
  from public.branch_academic_subjects subject
  where subject.id = new.subject_row_id;

  select subject.branch_id
  into v_prerequisite_branch_id
  from public.branch_academic_subjects subject
  where subject.id = new.prerequisite_subject_row_id;

  if v_subject_branch_id is null or v_prerequisite_branch_id is null then
    raise exception 'Subject prerequisites must reference existing subject rows.';
  end if;

  if v_subject_branch_id <> v_prerequisite_branch_id then
    raise exception 'Subject prerequisites must stay within the same branch catalog.';
  end if;

  return new;
end;
$$;

create index if not exists branch_academic_subjects_branch_program_idx
  on public.branch_academic_subjects (branch_id, program, year_level, semester);

create index if not exists branch_academic_subject_prerequisites_prerequisite_idx
  on public.branch_academic_subject_prerequisites (prerequisite_subject_row_id);

create index if not exists branch_academic_instructors_branch_idx
  on public.branch_academic_instructors (branch_id, department, name);

create index if not exists branch_class_sections_branch_program_idx
  on public.branch_class_sections (branch_id, program, year_level, semester);

create index if not exists branch_assignment_rooms_branch_idx
  on public.branch_assignment_rooms (branch_id, room_name);

create index if not exists branch_subject_assignments_branch_section_idx
  on public.branch_subject_assignments (branch_id, section_row_id, semester);

create index if not exists branch_subject_assignment_slots_assignment_idx
  on public.branch_subject_assignment_slots (assignment_id, sort_order);

drop trigger if exists branch_academic_subjects_set_updated_at on public.branch_academic_subjects;
create trigger branch_academic_subjects_set_updated_at
before update on public.branch_academic_subjects
for each row
execute function public.set_updated_at();

drop trigger if exists branch_academic_subject_prerequisites_validate_branch
  on public.branch_academic_subject_prerequisites;
create trigger branch_academic_subject_prerequisites_validate_branch
before insert or update on public.branch_academic_subject_prerequisites
for each row
execute function public.validate_academic_subject_prerequisite();

drop trigger if exists branch_academic_instructors_set_updated_at on public.branch_academic_instructors;
create trigger branch_academic_instructors_set_updated_at
before update on public.branch_academic_instructors
for each row
execute function public.set_updated_at();

drop trigger if exists branch_class_sections_set_updated_at on public.branch_class_sections;
create trigger branch_class_sections_set_updated_at
before update on public.branch_class_sections
for each row
execute function public.set_updated_at();

drop trigger if exists branch_assignment_rooms_set_updated_at on public.branch_assignment_rooms;
create trigger branch_assignment_rooms_set_updated_at
before update on public.branch_assignment_rooms
for each row
execute function public.set_updated_at();

drop trigger if exists branch_subject_assignments_set_updated_at on public.branch_subject_assignments;
create trigger branch_subject_assignments_set_updated_at
before update on public.branch_subject_assignments
for each row
execute function public.set_updated_at();

drop function if exists public.list_academic_subjects(text);

create or replace function public.list_academic_subjects(
  p_branch text default null
)
returns table (
  id text,
  code text,
  name text,
  units integer,
  program text,
  year_level text,
  semester text,
  strand text,
  is_minor boolean,
  prerequisite_subject_ids text[],
  prerequisite_subject_codes text[]
)
language sql
security definer
set search_path = public
as $$
  select
    subject.external_id as id,
    subject.code,
    subject.name,
    subject.units,
    subject.program,
    subject.year_level,
    subject.semester,
    subject.strand,
    subject.is_minor,
    coalesce(prerequisite.prerequisite_subject_ids, array[]::text[]),
    coalesce(prerequisite.prerequisite_subject_codes, array[]::text[])
  from public.branch_academic_subjects subject
  join public.admission_branches branch
    on branch.id = subject.branch_id
  left join lateral (
    select
      array_agg(prerequisite_subject.external_id order by prerequisite_subject.code)
        as prerequisite_subject_ids,
      array_agg(prerequisite_subject.code order by prerequisite_subject.code)
        as prerequisite_subject_codes
    from public.branch_academic_subject_prerequisites prerequisite_link
    join public.branch_academic_subjects prerequisite_subject
      on prerequisite_subject.id = prerequisite_link.prerequisite_subject_row_id
     and prerequisite_subject.is_active
    where prerequisite_link.subject_row_id = subject.id
  ) prerequisite on true
  where subject.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by
    subject.program,
    subject.year_level,
    subject.semester,
    subject.code;
$$;

drop function if exists public.upsert_academic_subject(jsonb);

create or replace function public.upsert_academic_subject(
  p_payload jsonb
)
returns table (
  id text,
  code text,
  name text,
  units integer,
  program text,
  year_level text,
  semester text,
  strand text,
  is_minor boolean,
  prerequisite_subject_ids text[],
  prerequisite_subject_codes text[]
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_subject_row_id uuid;
  v_program text;
  v_semester text;
  v_units integer;
  v_invalid_prerequisite_ids text[];
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'code', '')) = ''
    or trim(coalesce(p_payload->>'name', '')) = ''
    or trim(coalesce(p_payload->>'program', '')) = ''
    or trim(coalesce(p_payload->>'year_level', '')) = '' then
    raise exception 'Branch, subject code, subject name, program, and year level are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'subject_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  v_program := public.normalize_academic_program(p_payload->>'program');
  if v_program not in ('College', 'SHS') then
    raise exception 'Program "%" is not supported.', p_payload->>'program';
  end if;

  v_semester := public.normalize_academic_semester(p_payload->>'semester');
  if v_semester not in ('1st Semester', '2nd Semester', 'Summer') then
    raise exception 'Semester "%" is not supported.', p_payload->>'semester';
  end if;

  if nullif(trim(coalesce(p_payload->>'units', '')), '') is not null then
    v_units := (p_payload->>'units')::integer;
  else
    v_units := null;
  end if;

  insert into public.branch_academic_subjects (
    branch_id,
    external_id,
    code,
    name,
    units,
    program,
    year_level,
    semester,
    strand,
    is_minor
  )
  values (
    v_branch_id,
    v_external_id,
    trim(p_payload->>'code'),
    trim(p_payload->>'name'),
    v_units,
    v_program,
    trim(p_payload->>'year_level'),
    v_semester,
    nullif(trim(coalesce(p_payload->>'strand', '')), ''),
    coalesce((p_payload->>'is_minor')::boolean, false)
  )
  on conflict (branch_id, external_id) do update
  set code = excluded.code,
      name = excluded.name,
      units = excluded.units,
      program = excluded.program,
      year_level = excluded.year_level,
      semester = excluded.semester,
      strand = excluded.strand,
      is_minor = excluded.is_minor,
      is_active = true
  returning id into v_subject_row_id;

  if jsonb_typeof(coalesce(p_payload->'prerequisite_subject_ids', '[]'::jsonb)) not in ('array', 'null') then
    raise exception 'Prerequisite subject ids must be provided as an array.';
  end if;

  with requested_prerequisites as (
    select distinct trim(value) as external_id
    from jsonb_array_elements_text(coalesce(p_payload->'prerequisite_subject_ids', '[]'::jsonb)) value
    where trim(value) <> ''
  ),
  matched_prerequisites as (
    select prerequisite.id, prerequisite.external_id
    from requested_prerequisites requested
    join public.branch_academic_subjects prerequisite
      on prerequisite.branch_id = v_branch_id
     and prerequisite.external_id = requested.external_id
     and prerequisite.is_active
  )
  select array_agg(requested.external_id order by requested.external_id)
  into v_invalid_prerequisite_ids
  from requested_prerequisites requested
  left join matched_prerequisites matched
    on matched.external_id = requested.external_id
  where matched.id is null or matched.id = v_subject_row_id;

  if coalesce(array_length(v_invalid_prerequisite_ids, 1), 0) > 0 then
    raise exception
      'Prerequisite subject ids "%" were not found in branch "%" or referenced the same subject.',
      array_to_string(v_invalid_prerequisite_ids, ', '),
      v_branch_name;
  end if;

  delete from public.branch_academic_subject_prerequisites prerequisite
  where prerequisite.subject_row_id = v_subject_row_id;

  insert into public.branch_academic_subject_prerequisites (
    subject_row_id,
    prerequisite_subject_row_id
  )
  select
    v_subject_row_id,
    matched.id
  from (
    select distinct prerequisite.id
    from jsonb_array_elements_text(coalesce(p_payload->'prerequisite_subject_ids', '[]'::jsonb)) value
    join public.branch_academic_subjects prerequisite
      on prerequisite.branch_id = v_branch_id
     and prerequisite.external_id = trim(value)
     and prerequisite.is_active
    where trim(value) <> ''
      and prerequisite.id <> v_subject_row_id
  ) matched;

  return query
  select *
  from public.list_academic_subjects(v_branch_name) subject
  where subject.id = v_external_id
  limit 1;
end;
$$;

drop function if exists public.delete_academic_subject(text, text);

create or replace function public.delete_academic_subject(
  p_branch text,
  p_subject_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_subject_row_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  select subject.id
  into v_subject_row_id
  from public.branch_academic_subjects subject
  where subject.branch_id = v_branch_id
    and subject.external_id = trim(coalesce(p_subject_id, ''))
    and subject.is_active
  limit 1;

  if v_subject_row_id is null then
    raise exception 'Subject "%" was not found for branch "%".', p_subject_id, p_branch;
  end if;

  delete from public.branch_academic_subject_prerequisites prerequisite
  where prerequisite.subject_row_id = v_subject_row_id
     or prerequisite.prerequisite_subject_row_id = v_subject_row_id;

  update public.branch_subject_assignments assignment
  set is_active = false
  where assignment.subject_row_id = v_subject_row_id
    and assignment.is_active;

  update public.branch_academic_subjects subject
  set is_active = false
  where subject.id = v_subject_row_id;

  if not found then
    raise exception 'Subject "%" was not found for branch "%".', p_subject_id, p_branch;
  end if;
end;
$$;

drop function if exists public.list_academic_instructors(text);

create or replace function public.list_academic_instructors(
  p_branch text default null
)
returns table (
  id text,
  name text,
  employee_id text,
  department text,
  email text,
  contact_number text
)
language sql
security definer
set search_path = public
as $$
  select
    instructor.external_id as id,
    instructor.name,
    instructor.employee_id,
    instructor.department,
    instructor.email::text as email,
    instructor.contact_number
  from public.branch_academic_instructors instructor
  join public.admission_branches branch
    on branch.id = instructor.branch_id
  where instructor.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by instructor.name;
$$;

drop function if exists public.upsert_academic_instructor(jsonb);

create or replace function public.upsert_academic_instructor(
  p_payload jsonb
)
returns table (
  id text,
  name text,
  employee_id text,
  department text,
  email text,
  contact_number text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'name', '')) = ''
    or trim(coalesce(p_payload->>'employee_id', '')) = ''
    or trim(coalesce(p_payload->>'department', '')) = '' then
    raise exception 'Branch, instructor name, employee ID, and department are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'instructor_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  insert into public.branch_academic_instructors (
    branch_id,
    external_id,
    name,
    employee_id,
    department,
    email,
    contact_number
  )
  values (
    v_branch_id,
    v_external_id,
    trim(p_payload->>'name'),
    trim(p_payload->>'employee_id'),
    trim(p_payload->>'department'),
    nullif(trim(coalesce(p_payload->>'email', '')), '')::citext,
    nullif(trim(coalesce(p_payload->>'contact_number', '')), '')
  )
  on conflict (branch_id, external_id) do update
  set name = excluded.name,
      employee_id = excluded.employee_id,
      department = excluded.department,
      email = excluded.email,
      contact_number = excluded.contact_number,
      is_active = true;

  return query
  select *
  from public.list_academic_instructors(v_branch_name) instructor
  where instructor.id = v_external_id
  limit 1;
end;
$$;

drop function if exists public.delete_academic_instructor(text, text);

create or replace function public.delete_academic_instructor(
  p_branch text,
  p_instructor_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_instructor_row_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  select instructor.id
  into v_instructor_row_id
  from public.branch_academic_instructors instructor
  where instructor.branch_id = v_branch_id
    and instructor.external_id = trim(coalesce(p_instructor_id, ''))
    and instructor.is_active
  limit 1;

  if v_instructor_row_id is null then
    raise exception 'Instructor "%" was not found for branch "%".', p_instructor_id, p_branch;
  end if;

  update public.branch_subject_assignments assignment
  set instructor_row_id = null
  where assignment.instructor_row_id = v_instructor_row_id
    and assignment.is_active;

  update public.branch_academic_instructors instructor
  set is_active = false
  where instructor.id = v_instructor_row_id;

  if not found then
    raise exception 'Instructor "%" was not found for branch "%".', p_instructor_id, p_branch;
  end if;
end;
$$;

drop function if exists public.list_class_sections(text);

create or replace function public.list_class_sections(
  p_branch text default null
)
returns table (
  id text,
  code text,
  program text,
  year_level text,
  semester text,
  strand text,
  section text,
  current_enrollees integer,
  max_capacity integer,
  enrollee_ids text[]
)
language sql
security definer
set search_path = public
as $$
  select
    section.external_id as id,
    section.code,
    section.program,
    section.year_level,
    section.semester,
    section.strand,
    section.section,
    section.current_enrollees,
    section.max_capacity,
    section.enrollee_ids
  from public.branch_class_sections section
  join public.admission_branches branch
    on branch.id = section.branch_id
  where section.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by
    section.program,
    section.year_level,
    section.semester,
    section.code;
$$;

drop function if exists public.upsert_class_section(jsonb);

create or replace function public.upsert_class_section(
  p_payload jsonb
)
returns table (
  id text,
  code text,
  program text,
  year_level text,
  semester text,
  strand text,
  section text,
  current_enrollees integer,
  max_capacity integer,
  enrollee_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_program text;
  v_semester text;
  v_current_enrollees integer;
  v_max_capacity integer;
  v_enrollee_ids text[];
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'code', '')) = ''
    or trim(coalesce(p_payload->>'program', '')) = ''
    or trim(coalesce(p_payload->>'year_level', '')) = ''
    or trim(coalesce(p_payload->>'section', '')) = '' then
    raise exception 'Branch, section code, program, year level, and section label are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'section_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  v_program := public.normalize_academic_program(p_payload->>'program');
  if v_program not in ('College', 'SHS') then
    raise exception 'Program "%" is not supported.', p_payload->>'program';
  end if;

  v_semester := public.normalize_academic_semester(p_payload->>'semester');
  if v_semester not in ('1st Semester', '2nd Semester', 'Summer') then
    raise exception 'Semester "%" is not supported.', p_payload->>'semester';
  end if;

  v_current_enrollees := coalesce((p_payload->>'current_enrollees')::integer, 0);
  v_max_capacity := coalesce((p_payload->>'max_capacity')::integer, 40);

  if jsonb_typeof(coalesce(p_payload->'enrollee_ids', '[]'::jsonb)) not in ('array', 'null') then
    raise exception 'Enrollee ids must be provided as an array.';
  end if;

  select coalesce(array_agg(value), array[]::text[])
  into v_enrollee_ids
  from jsonb_array_elements_text(coalesce(p_payload->'enrollee_ids', '[]'::jsonb)) as value;

  insert into public.branch_class_sections (
    branch_id,
    external_id,
    code,
    program,
    year_level,
    semester,
    strand,
    section,
    current_enrollees,
    max_capacity,
    enrollee_ids
  )
  values (
    v_branch_id,
    v_external_id,
    trim(p_payload->>'code'),
    v_program,
    trim(p_payload->>'year_level'),
    v_semester,
    nullif(trim(coalesce(p_payload->>'strand', '')), ''),
    trim(p_payload->>'section'),
    v_current_enrollees,
    v_max_capacity,
    v_enrollee_ids
  )
  on conflict (branch_id, external_id) do update
  set code = excluded.code,
      program = excluded.program,
      year_level = excluded.year_level,
      semester = excluded.semester,
      strand = excluded.strand,
      section = excluded.section,
      current_enrollees = excluded.current_enrollees,
      max_capacity = excluded.max_capacity,
      enrollee_ids = excluded.enrollee_ids,
      is_active = true;

  return query
  select *
  from public.list_class_sections(v_branch_name) section
  where section.id = v_external_id
  limit 1;
end;
$$;

drop function if exists public.delete_class_section(text, text);

create or replace function public.delete_class_section(
  p_branch text,
  p_section_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_section_row_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  select section.id
  into v_section_row_id
  from public.branch_class_sections section
  where section.branch_id = v_branch_id
    and section.external_id = trim(coalesce(p_section_id, ''))
    and section.is_active
  limit 1;

  if v_section_row_id is null then
    raise exception 'Section "%" was not found for branch "%".', p_section_id, p_branch;
  end if;

  update public.branch_subject_assignments assignment
  set is_active = false
  where assignment.section_row_id = v_section_row_id
    and assignment.is_active;

  update public.branch_class_sections section
  set is_active = false
  where section.id = v_section_row_id;

  if not found then
    raise exception 'Section "%" was not found for branch "%".', p_section_id, p_branch;
  end if;
end;
$$;

drop function if exists public.list_assignment_rooms(text);

create or replace function public.list_assignment_rooms(
  p_branch text default null
)
returns table (
  room_name text
)
language sql
security definer
set search_path = public
as $$
  select room.room_name
  from public.branch_assignment_rooms room
  join public.admission_branches branch
    on branch.id = room.branch_id
  where room.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by room.room_name;
$$;

drop function if exists public.upsert_assignment_room(text, text);

create or replace function public.upsert_assignment_room(
  p_branch text,
  p_room_name text
)
returns table (
  room_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_room_name text;
begin
  v_room_name := trim(coalesce(p_room_name, ''));

  if trim(coalesce(p_branch, '')) = '' or v_room_name = '' then
    raise exception 'Branch and room name are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  insert into public.branch_assignment_rooms (
    branch_id,
    room_name
  )
  values (
    v_branch_id,
    v_room_name
  )
  on conflict (branch_id, room_name) do update
  set is_active = true;

  return query
  select *
  from public.list_assignment_rooms(v_branch_name) room
  where room.room_name = v_room_name
  limit 1;
end;
$$;

drop function if exists public.delete_assignment_room(text, text);

create or replace function public.delete_assignment_room(
  p_branch text,
  p_room_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  update public.branch_assignment_rooms room
  set is_active = false
  where room.branch_id = v_branch_id
    and room.room_name = trim(coalesce(p_room_name, ''))
    and room.is_active;

  if not found then
    raise exception 'Room "%" was not found for branch "%".', p_room_name, p_branch;
  end if;
end;
$$;

drop function if exists public.list_subject_assignments(text);

create or replace function public.list_subject_assignments(
  p_branch text default null
)
returns table (
  id text,
  subject_id text,
  subject_code text,
  subject_name text,
  instructor_id text,
  instructor_name text,
  section_id text,
  section_code text,
  schedule jsonb,
  academic_year text,
  semester text
)
language sql
security definer
set search_path = public
as $$
  select
    assignment.external_id as id,
    subject.external_id as subject_id,
    subject.code as subject_code,
    subject.name as subject_name,
    coalesce(instructor.external_id, '') as instructor_id,
    coalesce(instructor.name, 'To be assigned') as instructor_name,
    section.external_id as section_id,
    section.code as section_code,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'day', slot.day,
          'startTime', slot.start_time,
          'endTime', slot.end_time,
          'room', slot.room
        )
        order by slot.sort_order
      ) filter (where slot.id is not null),
      '[]'::jsonb
    ) as schedule,
    assignment.academic_year,
    assignment.semester
  from public.branch_subject_assignments assignment
  join public.admission_branches branch
    on branch.id = assignment.branch_id
  join public.branch_academic_subjects subject
    on subject.id = assignment.subject_row_id
   and subject.is_active
  join public.branch_class_sections section
    on section.id = assignment.section_row_id
   and section.is_active
  left join public.branch_academic_instructors instructor
    on instructor.id = assignment.instructor_row_id
   and instructor.is_active
  left join public.branch_subject_assignment_slots slot
    on slot.assignment_id = assignment.id
  where assignment.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  group by
    assignment.external_id,
    subject.external_id,
    subject.code,
    subject.name,
    instructor.external_id,
    instructor.name,
    section.external_id,
    section.code,
    assignment.academic_year,
    assignment.semester
  order by
    assignment.academic_year desc,
    assignment.semester,
    section.code,
    subject.code;
$$;

drop function if exists public.upsert_subject_assignment(jsonb);

create or replace function public.upsert_subject_assignment(
  p_payload jsonb
)
returns table (
  id text,
  subject_id text,
  subject_code text,
  subject_name text,
  instructor_id text,
  instructor_name text,
  section_id text,
  section_code text,
  schedule jsonb,
  academic_year text,
  semester text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_subject_row_id uuid;
  v_instructor_row_id uuid;
  v_section_row_id uuid;
  v_assignment_row_id uuid;
  v_conflicting_assignment_id text;
  v_semester text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'subject_id', '')) = ''
    or trim(coalesce(p_payload->>'section_id', '')) = ''
    or trim(coalesce(p_payload->>'academic_year', '')) = '' then
    raise exception 'Branch, subject, section, and academic year are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  select subject.id
  into v_subject_row_id
  from public.branch_academic_subjects subject
  where subject.branch_id = v_branch_id
    and subject.external_id = trim(p_payload->>'subject_id')
    and subject.is_active
  limit 1;

  if v_subject_row_id is null then
    raise exception 'Subject "%" was not found in branch "%".', p_payload->>'subject_id', v_branch_name;
  end if;

  select section.id
  into v_section_row_id
  from public.branch_class_sections section
  where section.branch_id = v_branch_id
    and section.external_id = trim(p_payload->>'section_id')
    and section.is_active
  limit 1;

  if v_section_row_id is null then
    raise exception 'Section "%" was not found in branch "%".', p_payload->>'section_id', v_branch_name;
  end if;

  if nullif(trim(coalesce(p_payload->>'instructor_id', '')), '') is not null then
    select instructor.id
    into v_instructor_row_id
    from public.branch_academic_instructors instructor
    where instructor.branch_id = v_branch_id
      and instructor.external_id = trim(p_payload->>'instructor_id')
      and instructor.is_active
    limit 1;

    if v_instructor_row_id is null then
      raise exception 'Instructor "%" was not found in branch "%".', p_payload->>'instructor_id', v_branch_name;
    end if;
  else
    v_instructor_row_id := null;
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'assignment_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  v_semester := public.normalize_academic_semester(p_payload->>'semester');
  if v_semester not in ('1st Semester', '2nd Semester', 'Summer') then
    raise exception 'Semester "%" is not supported.', p_payload->>'semester';
  end if;

  if jsonb_typeof(coalesce(p_payload->'schedule', '[]'::jsonb)) not in ('array', 'null') then
    raise exception 'Schedule must be provided as an array.';
  end if;

  select assignment.external_id
  into v_conflicting_assignment_id
  from public.branch_subject_assignments assignment
  where assignment.branch_id = v_branch_id
    and assignment.subject_row_id = v_subject_row_id
    and assignment.section_row_id = v_section_row_id
    and assignment.academic_year = trim(p_payload->>'academic_year')
    and assignment.semester = v_semester
    and assignment.is_active
    and assignment.external_id <> v_external_id
  limit 1;

  if v_conflicting_assignment_id is not null then
    raise exception
      'An active assignment already exists for this subject, section, academic year, and semester (assignment id "%").',
      v_conflicting_assignment_id;
  end if;

  insert into public.branch_subject_assignments (
    branch_id,
    external_id,
    subject_row_id,
    instructor_row_id,
    section_row_id,
    academic_year,
    semester
  )
  values (
    v_branch_id,
    v_external_id,
    v_subject_row_id,
    v_instructor_row_id,
    v_section_row_id,
    trim(p_payload->>'academic_year'),
    v_semester
  )
  on conflict (branch_id, external_id) do update
  set subject_row_id = excluded.subject_row_id,
      instructor_row_id = excluded.instructor_row_id,
      section_row_id = excluded.section_row_id,
      academic_year = excluded.academic_year,
      semester = excluded.semester,
      is_active = true
  returning id into v_assignment_row_id;

  delete from public.branch_subject_assignment_slots slot
  where slot.assignment_id = v_assignment_row_id;

  insert into public.branch_subject_assignment_slots (
    assignment_id,
    sort_order,
    day,
    start_time,
    end_time,
    room
  )
  select
    v_assignment_row_id,
    slot.ordinality - 1,
    trim(coalesce(slot.value->>'day', '')),
    trim(coalesce(slot.value->>'startTime', '')),
    trim(coalesce(slot.value->>'endTime', '')),
    coalesce(nullif(trim(coalesce(slot.value->>'room', '')), ''), 'TBA')
  from jsonb_array_elements(coalesce(p_payload->'schedule', '[]'::jsonb))
    with ordinality as slot(value, ordinality)
  where trim(coalesce(slot.value->>'day', '')) <> ''
    and trim(coalesce(slot.value->>'startTime', '')) <> ''
    and trim(coalesce(slot.value->>'endTime', '')) <> '';

  return query
  select *
  from public.list_subject_assignments(v_branch_name) assignment
  where assignment.id = v_external_id
  limit 1;
end;
$$;

drop function if exists public.delete_subject_assignment(text, text);

create or replace function public.delete_subject_assignment(
  p_branch text,
  p_assignment_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  update public.branch_subject_assignments assignment
  set is_active = false
  where assignment.branch_id = v_branch_id
    and assignment.external_id = trim(coalesce(p_assignment_id, ''))
    and assignment.is_active;

  if not found then
    raise exception 'Assignment "%" was not found for branch "%".', p_assignment_id, p_branch;
  end if;
end;
$$;

create table if not exists public.branch_student_planning_states (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  student_number text not null,
  tracking_number text,
  requested_own_schedule boolean not null default false,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_student_planning_states_request_status_check
    check (
      own_schedule_request_status is null
      or own_schedule_request_status in ('Pending', 'Approved', 'Rejected')
    ),
  constraint branch_student_planning_states_selection_status_check
    check (
      own_schedule_selection_status is null
      or own_schedule_selection_status in (
        'Not Submitted',
        'Pending Approval',
        'Approved',
        'Rejected'
      )
    ),
  constraint branch_student_planning_states_semester_check
    check (
      own_schedule_semester is null
      or own_schedule_semester in ('1st Semester', '2nd Semester', 'Summer')
    ),
  unique (branch_id, student_number)
);

create table if not exists public.branch_student_subject_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  student_number text,
  tracking_number text,
  semester text not null,
  academic_year text not null,
  source text not null,
  payload jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_student_subject_plans_source_check
    check (
      source in (
        'transferee_validation',
        'irregular_assignment',
        'student_schedule_request',
        'enrollment_request'
      )
    ),
  constraint branch_student_subject_plans_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  unique (branch_id, external_id)
);

create table if not exists public.branch_student_schedule_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  student_number text not null,
  tracking_number text,
  academic_year text not null,
  semester text not null,
  status text not null,
  payload jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_student_schedule_requests_status_check
    check (status in ('Pending', 'Approved', 'Rejected')),
  constraint branch_student_schedule_requests_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  unique (branch_id, external_id),
  unique (branch_id, student_number, academic_year, semester)
);

create table if not exists public.branch_enrollment_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  external_id text not null,
  student_number text not null,
  tracking_number text,
  academic_year text not null,
  semester text not null,
  enrollment_status text not null,
  payload jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_enrollment_requests_status_check
    check (enrollment_status in ('Pending', 'Approved', 'Rejected')),
  constraint branch_enrollment_requests_semester_check
    check (semester in ('1st Semester', '2nd Semester', 'Summer')),
  unique (branch_id, external_id),
  unique (branch_id, student_number, academic_year, semester)
);

create index if not exists branch_student_planning_states_branch_student_idx
  on public.branch_student_planning_states (branch_id, student_number);

create index if not exists branch_student_subject_plans_branch_student_idx
  on public.branch_student_subject_plans (
    branch_id,
    student_number,
    tracking_number,
    academic_year,
    semester
  );

create index if not exists branch_student_schedule_requests_branch_student_idx
  on public.branch_student_schedule_requests (
    branch_id,
    student_number,
    academic_year,
    semester
  );

create index if not exists branch_enrollment_requests_branch_student_idx
  on public.branch_enrollment_requests (
    branch_id,
    student_number,
    tracking_number,
    academic_year,
    semester
  );

drop trigger if exists branch_student_planning_states_set_updated_at
  on public.branch_student_planning_states;
create trigger branch_student_planning_states_set_updated_at
before update on public.branch_student_planning_states
for each row
execute function public.set_updated_at();

drop trigger if exists branch_student_subject_plans_set_updated_at
  on public.branch_student_subject_plans;
create trigger branch_student_subject_plans_set_updated_at
before update on public.branch_student_subject_plans
for each row
execute function public.set_updated_at();

drop trigger if exists branch_student_schedule_requests_set_updated_at
  on public.branch_student_schedule_requests;
create trigger branch_student_schedule_requests_set_updated_at
before update on public.branch_student_schedule_requests
for each row
execute function public.set_updated_at();

drop trigger if exists branch_enrollment_requests_set_updated_at
  on public.branch_enrollment_requests;
create trigger branch_enrollment_requests_set_updated_at
before update on public.branch_enrollment_requests
for each row
execute function public.set_updated_at();

drop function if exists public.list_student_planning_states(text);

create or replace function public.list_student_planning_states(
  p_branch text default null
)
returns table (
  student_number text,
  tracking_number text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text
)
language sql
security definer
set search_path = public
as $$
  select
    planning_state.student_number,
    planning_state.tracking_number,
    planning_state.requested_own_schedule,
    planning_state.own_schedule_request_status,
    planning_state.own_schedule_academic_year,
    planning_state.own_schedule_semester,
    planning_state.own_schedule_selection_status
  from public.branch_student_planning_states planning_state
  join public.admission_branches branch
    on branch.id = planning_state.branch_id
  where
    p_branch is null
    or lower(branch.code) = lower(trim(p_branch))
    or lower(branch.name) = lower(trim(p_branch))
  order by
    planning_state.updated_at desc,
    planning_state.student_number;
$$;

drop function if exists public.upsert_student_planning_state(jsonb);

create or replace function public.upsert_student_planning_state(
  p_payload jsonb
)
returns table (
  student_number text,
  tracking_number text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_student_number text;
  v_semester text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'student_number', '')) = '' then
    raise exception 'Branch and student number are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_student_number := trim(p_payload->>'student_number');
  v_semester := nullif(trim(coalesce(p_payload->>'own_schedule_semester', '')), '');

  if v_semester is not null then
    v_semester := public.normalize_academic_semester(v_semester);
  end if;

  insert into public.branch_student_planning_states (
    branch_id,
    student_number,
    tracking_number,
    requested_own_schedule,
    own_schedule_request_status,
    own_schedule_academic_year,
    own_schedule_semester,
    own_schedule_selection_status
  )
  values (
    v_branch_id,
    v_student_number,
    nullif(trim(coalesce(p_payload->>'tracking_number', '')), ''),
    coalesce((p_payload->>'requested_own_schedule')::boolean, false),
    nullif(trim(coalesce(p_payload->>'own_schedule_request_status', '')), ''),
    nullif(trim(coalesce(p_payload->>'own_schedule_academic_year', '')), ''),
    v_semester,
    nullif(trim(coalesce(p_payload->>'own_schedule_selection_status', '')), '')
  )
  on conflict (branch_id, student_number) do update
  set tracking_number = excluded.tracking_number,
      requested_own_schedule = excluded.requested_own_schedule,
      own_schedule_request_status = excluded.own_schedule_request_status,
      own_schedule_academic_year = excluded.own_schedule_academic_year,
      own_schedule_semester = excluded.own_schedule_semester,
      own_schedule_selection_status = excluded.own_schedule_selection_status;

  return query
  select *
  from public.list_student_planning_states(v_branch_name) planning_state
  where planning_state.student_number = v_student_number
  limit 1;
end;
$$;

drop function if exists public.list_student_subject_plans(text);

create or replace function public.list_student_subject_plans(
  p_branch text default null
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  semester text,
  academic_year text,
  source text,
  payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    plan.external_id as id,
    plan.student_number,
    plan.tracking_number,
    plan.semester,
    plan.academic_year,
    plan.source,
    plan.payload
  from public.branch_student_subject_plans plan
  join public.admission_branches branch
    on branch.id = plan.branch_id
  where plan.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by
    plan.updated_at desc,
    plan.academic_year desc,
    plan.semester,
    plan.external_id;
$$;

drop function if exists public.upsert_student_subject_plan(jsonb);

create or replace function public.upsert_student_subject_plan(
  p_payload jsonb
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  semester text,
  academic_year text,
  source text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_semester text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'id', '')) = ''
    or trim(coalesce(p_payload->>'academicYear', '')) = ''
    or trim(coalesce(p_payload->>'semester', '')) = ''
    or trim(coalesce(p_payload->>'source', '')) = '' then
    raise exception 'Branch, plan id, academic year, semester, and source are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := trim(p_payload->>'id');
  v_semester := public.normalize_academic_semester(p_payload->>'semester');

  insert into public.branch_student_subject_plans (
    branch_id,
    external_id,
    student_number,
    tracking_number,
    semester,
    academic_year,
    source,
    payload
  )
  values (
    v_branch_id,
    v_external_id,
    nullif(trim(coalesce(p_payload->>'studentNumber', '')), ''),
    nullif(trim(coalesce(p_payload->>'trackingNumber', '')), ''),
    v_semester,
    trim(p_payload->>'academicYear'),
    trim(p_payload->>'source'),
    p_payload - 'branch'
  )
  on conflict (branch_id, external_id) do update
  set student_number = excluded.student_number,
      tracking_number = excluded.tracking_number,
      semester = excluded.semester,
      academic_year = excluded.academic_year,
      source = excluded.source,
      payload = excluded.payload,
      is_active = true;

  return query
  select *
  from public.list_student_subject_plans(v_branch_name) plan
  where plan.id = v_external_id
  limit 1;
end;
$$;

drop function if exists public.delete_student_subject_plan(text, text);

create or replace function public.delete_student_subject_plan(
  p_branch text,
  p_plan_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_branch) as resolved;

  update public.branch_student_subject_plans plan
  set is_active = false
  where plan.branch_id = v_branch_id
    and plan.external_id = trim(coalesce(p_plan_id, ''))
    and plan.is_active;

  if not found then
    raise exception 'Student subject plan "%" was not found for branch "%".', p_plan_id, p_branch;
  end if;
end;
$$;

drop function if exists public.list_student_schedule_requests(text);

create or replace function public.list_student_schedule_requests(
  p_branch text default null
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  status text,
  payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    request.external_id as id,
    request.student_number,
    request.tracking_number,
    request.academic_year,
    request.semester,
    request.status,
    request.payload
  from public.branch_student_schedule_requests request
  join public.admission_branches branch
    on branch.id = request.branch_id
  where request.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by
    request.updated_at desc,
    request.academic_year desc,
    request.semester,
    request.external_id;
$$;

drop function if exists public.upsert_student_schedule_request(jsonb);

create or replace function public.upsert_student_schedule_request(
  p_payload jsonb
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_student_number text;
  v_academic_year text;
  v_semester text;
  v_status text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'studentNumber', '')) = ''
    or trim(coalesce(p_payload->>'academicYear', '')) = ''
    or trim(coalesce(p_payload->>'semester', '')) = ''
    or trim(coalesce(p_payload->>'status', '')) = '' then
    raise exception 'Branch, student number, academic year, semester, and status are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'schedule_request_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  v_student_number := trim(p_payload->>'studentNumber');
  v_academic_year := trim(p_payload->>'academicYear');
  v_semester := public.normalize_academic_semester(p_payload->>'semester');
  v_status := trim(p_payload->>'status');

  insert into public.branch_student_schedule_requests (
    branch_id,
    external_id,
    student_number,
    tracking_number,
    academic_year,
    semester,
    status,
    payload
  )
  values (
    v_branch_id,
    v_external_id,
    v_student_number,
    nullif(trim(coalesce(p_payload->>'trackingNumber', '')), ''),
    v_academic_year,
    v_semester,
    v_status,
    p_payload
  )
  on conflict (branch_id, student_number, academic_year, semester) do update
  set external_id = excluded.external_id,
      tracking_number = excluded.tracking_number,
      status = excluded.status,
      semester = excluded.semester,
      payload = excluded.payload,
      is_active = true;

  return query
  select *
  from public.list_student_schedule_requests(v_branch_name) request
  where request.student_number = v_student_number
    and request.academic_year = v_academic_year
    and request.semester = v_semester
  limit 1;
end;
$$;

drop function if exists public.list_enrollment_requests(text);

create or replace function public.list_enrollment_requests(
  p_branch text default null
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  enrollment_status text,
  payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    request.external_id as id,
    request.student_number,
    request.tracking_number,
    request.academic_year,
    request.semester,
    request.enrollment_status,
    request.payload
  from public.branch_enrollment_requests request
  join public.admission_branches branch
    on branch.id = request.branch_id
  where request.is_active
    and (
      p_branch is null
      or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by
    request.updated_at desc,
    request.academic_year desc,
    request.semester,
    request.external_id;
$$;

drop function if exists public.upsert_enrollment_request(jsonb);

create or replace function public.upsert_enrollment_request(
  p_payload jsonb
)
returns table (
  id text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  enrollment_status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_external_id text;
  v_student_number text;
  v_academic_year text;
  v_semester text;
  v_enrollment_status text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = ''
    or trim(coalesce(p_payload->>'studentNumber', '')) = ''
    or trim(coalesce(p_payload->>'academicYear', '')) = ''
    or trim(coalesce(p_payload->>'semester', '')) = ''
    or trim(coalesce(p_payload->>'enrollmentStatus', '')) = '' then
    raise exception 'Branch, student number, academic year, semester, and enrollment status are required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  if v_external_id is null then
    v_external_id := 'enrollment_request_' || replace(extensions.gen_random_uuid()::text, '-', '');
  end if;

  v_student_number := trim(p_payload->>'studentNumber');
  v_academic_year := trim(p_payload->>'academicYear');
  v_semester := public.normalize_academic_semester(p_payload->>'semester');
  v_enrollment_status := trim(p_payload->>'enrollmentStatus');

  insert into public.branch_enrollment_requests (
    branch_id,
    external_id,
    student_number,
    tracking_number,
    academic_year,
    semester,
    enrollment_status,
    payload
  )
  values (
    v_branch_id,
    v_external_id,
    v_student_number,
    nullif(trim(coalesce(p_payload->>'trackingNumber', '')), ''),
    v_academic_year,
    v_semester,
    v_enrollment_status,
    p_payload
  )
  on conflict (branch_id, student_number, academic_year, semester) do update
  set external_id = excluded.external_id,
      tracking_number = excluded.tracking_number,
      enrollment_status = excluded.enrollment_status,
      semester = excluded.semester,
      payload = excluded.payload,
      is_active = true;

  return query
  select *
  from public.list_enrollment_requests(v_branch_name) request
  where request.student_number = v_student_number
    and request.academic_year = v_academic_year
    and request.semester = v_semester
  limit 1;
end;
$$;

alter table public.branch_academic_subjects enable row level security;
alter table public.branch_academic_subject_prerequisites enable row level security;
alter table public.branch_academic_instructors enable row level security;
alter table public.branch_class_sections enable row level security;
alter table public.branch_assignment_rooms enable row level security;
alter table public.branch_subject_assignments enable row level security;
alter table public.branch_subject_assignment_slots enable row level security;
alter table public.branch_student_planning_states enable row level security;
alter table public.branch_student_subject_plans enable row level security;
alter table public.branch_student_schedule_requests enable row level security;
alter table public.branch_enrollment_requests enable row level security;

revoke execute on function public.list_academic_subjects(text) from anon;
revoke execute on function public.upsert_academic_subject(jsonb) from anon;
revoke execute on function public.delete_academic_subject(text, text) from anon;
revoke execute on function public.list_academic_instructors(text) from anon;
revoke execute on function public.upsert_academic_instructor(jsonb) from anon;
revoke execute on function public.delete_academic_instructor(text, text) from anon;
revoke execute on function public.list_class_sections(text) from anon;
revoke execute on function public.upsert_class_section(jsonb) from anon;
revoke execute on function public.delete_class_section(text, text) from anon;
revoke execute on function public.list_assignment_rooms(text) from anon;
revoke execute on function public.upsert_assignment_room(text, text) from anon;
revoke execute on function public.delete_assignment_room(text, text) from anon;
revoke execute on function public.list_subject_assignments(text) from anon;
revoke execute on function public.upsert_subject_assignment(jsonb) from anon;
revoke execute on function public.delete_subject_assignment(text, text) from anon;
revoke execute on function public.list_student_planning_states(text) from anon;
revoke execute on function public.upsert_student_planning_state(jsonb) from anon;
revoke execute on function public.list_student_subject_plans(text) from anon;
revoke execute on function public.upsert_student_subject_plan(jsonb) from anon;
revoke execute on function public.delete_student_subject_plan(text, text) from anon;
revoke execute on function public.list_student_schedule_requests(text) from anon;
revoke execute on function public.upsert_student_schedule_request(jsonb) from anon;
revoke execute on function public.list_enrollment_requests(text) from anon;
revoke execute on function public.upsert_enrollment_request(jsonb) from anon;

grant execute on function public.list_academic_subjects(text) to anon, authenticated;
grant execute on function public.upsert_academic_subject(jsonb) to anon, authenticated;
grant execute on function public.delete_academic_subject(text, text) to anon, authenticated;
grant execute on function public.list_academic_instructors(text) to anon, authenticated;
grant execute on function public.upsert_academic_instructor(jsonb) to anon, authenticated;
grant execute on function public.delete_academic_instructor(text, text) to anon, authenticated;
grant execute on function public.list_class_sections(text) to anon, authenticated;
grant execute on function public.upsert_class_section(jsonb) to anon, authenticated;
grant execute on function public.delete_class_section(text, text) to anon, authenticated;
grant execute on function public.list_assignment_rooms(text) to anon, authenticated;
grant execute on function public.upsert_assignment_room(text, text) to anon, authenticated;
grant execute on function public.delete_assignment_room(text, text) to anon, authenticated;
grant execute on function public.list_subject_assignments(text) to anon, authenticated;
grant execute on function public.upsert_subject_assignment(jsonb) to anon, authenticated;
grant execute on function public.delete_subject_assignment(text, text) to anon, authenticated;
grant execute on function public.list_student_planning_states(text) to anon, authenticated;
grant execute on function public.upsert_student_planning_state(jsonb) to anon, authenticated;
grant execute on function public.list_student_subject_plans(text) to anon, authenticated;
grant execute on function public.upsert_student_subject_plan(jsonb) to anon, authenticated;
grant execute on function public.delete_student_subject_plan(text, text) to anon, authenticated;
grant execute on function public.list_student_schedule_requests(text) to anon, authenticated;
grant execute on function public.upsert_student_schedule_request(jsonb) to anon, authenticated;
grant execute on function public.list_enrollment_requests(text) to anon, authenticated;
grant execute on function public.upsert_enrollment_request(jsonb) to anon, authenticated;
