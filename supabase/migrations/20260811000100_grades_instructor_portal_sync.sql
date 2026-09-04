create extension if not exists pgcrypto;

create table if not exists public.branch_student_grade_records (
  id text not null,
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  student_number text not null,
  subject_code text not null,
  academic_year text not null,
  semester text not null,
  grading_period text not null,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (branch_id, id)
);

create index if not exists branch_student_grade_records_student_idx
  on public.branch_student_grade_records (branch_id, student_number);

create table if not exists public.instructor_grade_submissions (
  id text primary key,
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  instructor_id text not null,
  instructor_name text not null,
  employee_id text not null,
  file_name text not null,
  submitted_at timestamptz not null,
  status text not null default 'Pending',
  records jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint instructor_grade_submissions_status_check
    check (status in ('Pending', 'Approved', 'Rejected'))
);

create index if not exists instructor_grade_submissions_branch_status_idx
  on public.instructor_grade_submissions (branch_id, status, submitted_at desc);

create table if not exists public.branch_instructor_passwords (
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  employee_id text not null,
  password_hash text not null,
  password_change_required boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (branch_id, employee_id)
);

create table if not exists public.admission_portal_statuses (
  branch_id uuid primary key references public.admission_branches(id) on delete cascade,
  is_open boolean not null default true,
  close_on_date text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.branch_local_storage_records (
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  scope text not null,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (branch_id, scope)
);

create index if not exists branch_local_storage_records_scope_idx
  on public.branch_local_storage_records (scope);

create or replace function public.get_branch_local_storage_record(
  p_branch text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_payload jsonb;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  select record.payload into v_payload
  from public.branch_local_storage_records record
  where record.branch_id = v_branch_id
    and record.scope = trim(p_scope);

  return v_payload;
end;
$$;

create or replace function public.upsert_branch_local_storage_record(
  p_branch text,
  p_scope text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  insert into public.branch_local_storage_records (
    branch_id,
    scope,
    payload,
    updated_at
  )
  values (
    v_branch_id,
    trim(p_scope),
    p_payload,
    timezone('utc', now())
  )
  on conflict (branch_id, scope) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.list_student_grade_records(p_branch text)
returns table (payload jsonb)
language sql
security definer
set search_path = public
as $$
  select grade.payload
  from public.branch_student_grade_records grade
  join public.resolve_staff_branch(p_branch) branch
    on branch.branch_id = grade.branch_id
  order by grade.academic_year, grade.semester, grade.subject_code, grade.grading_period;
$$;

create or replace function public.upsert_student_grade_record(p_branch text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_record_id text;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_record_id := trim(coalesce(p_payload->>'id', ''));
  if v_record_id = '' then
    raise exception 'Grade payload is missing an id.';
  end if;

  insert into public.branch_student_grade_records (
    id,
    branch_id,
    student_number,
    subject_code,
    academic_year,
    semester,
    grading_period,
    payload,
    updated_at
  )
  values (
    v_record_id,
    v_branch_id,
    coalesce(p_payload->>'studentId', ''),
    coalesce(p_payload->>'subjectCode', ''),
    coalesce(p_payload->>'academicYear', ''),
    coalesce(p_payload->>'semester', ''),
    coalesce(p_payload->>'gradingPeriod', ''),
    p_payload,
    timezone('utc', now())
  )
  on conflict (branch_id, id) do update
  set student_number = excluded.student_number,
      subject_code = excluded.subject_code,
      academic_year = excluded.academic_year,
      semester = excluded.semester,
      grading_period = excluded.grading_period,
      payload = excluded.payload,
      updated_at = excluded.updated_at;

  return p_payload;
end;
$$;

create or replace function public.delete_student_grade_record(p_branch text, p_record_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  delete from public.branch_student_grade_records grade
  where grade.branch_id = v_branch_id
    and grade.id = p_record_id;
end;
$$;

create or replace function public.list_instructor_grade_submissions(p_branch text)
returns table (
  id text,
  branch text,
  instructor_id text,
  instructor_name text,
  employee_id text,
  file_name text,
  submitted_at timestamptz,
  status text,
  records jsonb,
  errors jsonb,
  reviewed_at timestamptz,
  reviewed_by text
)
language sql
security definer
set search_path = public
as $$
  select
    submission.id,
    branch.branch_name as branch,
    submission.instructor_id,
    submission.instructor_name,
    submission.employee_id,
    submission.file_name,
    submission.submitted_at,
    submission.status,
    submission.records,
    submission.errors,
    submission.reviewed_at,
    submission.reviewed_by
  from public.instructor_grade_submissions submission
  join public.resolve_staff_branch(p_branch) branch
    on branch.branch_id = submission.branch_id
  order by submission.submitted_at desc;
$$;

create or replace function public.upsert_instructor_grade_submission(
  p_branch text,
  p_submission jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  insert into public.instructor_grade_submissions (
    id,
    branch_id,
    instructor_id,
    instructor_name,
    employee_id,
    file_name,
    submitted_at,
    status,
    records,
    errors,
    reviewed_at,
    reviewed_by,
    updated_at
  )
  values (
    p_submission->>'id',
    v_branch_id,
    p_submission->>'instructorId',
    p_submission->>'instructorName',
    p_submission->>'employeeId',
    p_submission->>'fileName',
    coalesce((p_submission->>'submittedAt')::timestamptz, timezone('utc', now())),
    coalesce(p_submission->>'status', 'Pending'),
    coalesce(p_submission->'records', '[]'::jsonb),
    coalesce(p_submission->'errors', '[]'::jsonb),
    nullif(p_submission->>'reviewedAt', '')::timestamptz,
    nullif(p_submission->>'reviewedBy', ''),
    timezone('utc', now())
  )
  on conflict (id) do update
  set instructor_id = excluded.instructor_id,
      instructor_name = excluded.instructor_name,
      employee_id = excluded.employee_id,
      file_name = excluded.file_name,
      submitted_at = excluded.submitted_at,
      status = excluded.status,
      records = excluded.records,
      errors = excluded.errors,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      updated_at = excluded.updated_at;
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

  if v_password_hash is null and trim(p_password) = '123456' then
    insert into public.branch_instructor_passwords (
      branch_id,
      employee_id,
      password_hash,
      password_change_required
    )
    values (
      v_branch_id,
      v_employee_id,
      extensions.crypt('123456', extensions.gen_salt('bf')),
      true
    )
    on conflict (branch_id, employee_id) do nothing;

    v_password_change_required := true;
  elsif v_password_hash is null
    or v_password_hash <> extensions.crypt(trim(p_password), v_password_hash) then
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

create or replace function public.set_instructor_temporary_password(
  p_branch text,
  p_employee_id text,
  p_password text default '123456',
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

  if trim(coalesce(p_password, '')) = '' then
    raise exception 'Temporary password is required.';
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

create or replace function public.complete_instructor_password_setup(
  p_branch text,
  p_employee_id text,
  p_current_password text,
  p_new_password text
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
  if char_length(trim(coalesce(p_new_password, ''))) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  if trim(p_current_password) = trim(p_new_password) then
    raise exception 'Please choose a new password different from the temporary password.';
  end if;

  v_employee_id := upper(trim(coalesce(p_employee_id, '')));

  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  update public.branch_instructor_passwords password
  set password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
      password_change_required = false,
      updated_at = timezone('utc', now())
  where password.branch_id = v_branch_id
    and password.employee_id = v_employee_id
    and password.password_hash = extensions.crypt(trim(p_current_password), password.password_hash);

  if not found then
    raise exception 'Unable to update the instructor password.';
  end if;
end;
$$;

create or replace function public.list_admission_portal_statuses()
returns table (
  branch text,
  is_open boolean,
  close_on_date text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    branch.name,
    coalesce(status.is_open, true),
    coalesce(status.close_on_date, ''),
    coalesce(status.updated_at, timezone('utc', now()))
  from public.admission_branches branch
  left join public.admission_portal_statuses status
    on status.branch_id = branch.id
  where branch.is_active
  order by branch.name;
$$;

create or replace function public.upsert_admission_portal_status(
  p_branch text,
  p_is_open boolean,
  p_close_on_date text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  insert into public.admission_portal_statuses (
    branch_id,
    is_open,
    close_on_date,
    updated_at
  )
  values (
    v_branch_id,
    p_is_open,
    coalesce(p_close_on_date, ''),
    timezone('utc', now())
  )
  on conflict (branch_id) do update
  set is_open = excluded.is_open,
      close_on_date = excluded.close_on_date,
      updated_at = excluded.updated_at;
end;
$$;
