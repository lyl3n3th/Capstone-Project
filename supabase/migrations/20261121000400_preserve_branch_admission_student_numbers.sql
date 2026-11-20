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

  v_branch_prefix := public.resolve_student_number_prefix(v_branch_id);

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
        raise exception 'Student number "%" does not match the % branch format.',
          v_preferred_student_number, v_branch_prefix;
      end if;

      if exists (
        select 1
        from public.student_profiles student
        where upper(student.student_number) = v_preferred_student_number
          and student.branch_id = v_branch_id
      ) then
        raise exception 'Student number "%" is already assigned to another student in this branch.',
          v_preferred_student_number;
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
    or branch.id = (
      select resolved.branch_id
      from public.resolve_student_branch(p_branch) as resolved
      limit 1
    )
  order by
    branch.name,
    student.created_at desc,
    student.student_number;
$$;

grant execute on function public.activate_approved_student(text, text)
  to anon, authenticated;
grant execute on function public.list_admin_students(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
