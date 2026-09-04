drop function if exists public.activate_approved_student(text);

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
