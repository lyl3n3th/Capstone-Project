do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_student_planning_states_student_unique'
      and conrelid = 'public.branch_student_planning_states'::regclass
  ) then
    alter table public.branch_student_planning_states
      add constraint branch_student_planning_states_student_unique
      unique (branch_id, student_number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_student_subject_plans_external_unique'
      and conrelid = 'public.branch_student_subject_plans'::regclass
  ) then
    alter table public.branch_student_subject_plans
      add constraint branch_student_subject_plans_external_unique
      unique (branch_id, external_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_student_schedule_requests_student_term_unique'
      and conrelid = 'public.branch_student_schedule_requests'::regclass
  ) then
    alter table public.branch_student_schedule_requests
      add constraint branch_student_schedule_requests_student_term_unique
      unique (branch_id, student_number, academic_year, semester);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_enrollment_requests_student_term_unique'
      and conrelid = 'public.branch_enrollment_requests'::regclass
  ) then
    alter table public.branch_enrollment_requests
      add constraint branch_enrollment_requests_student_term_unique
      unique (branch_id, student_number, academic_year, semester);
  end if;
end;
$$;

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
#variable_conflict use_column
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
  on conflict on constraint branch_student_planning_states_student_unique do update
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
#variable_conflict use_column
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
  on conflict on constraint branch_student_subject_plans_external_unique do update
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
#variable_conflict use_column
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
  on conflict on constraint branch_student_schedule_requests_student_term_unique do update
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
#variable_conflict use_column
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
  on conflict on constraint branch_enrollment_requests_student_term_unique do update
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
