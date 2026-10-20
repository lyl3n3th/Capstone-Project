-- Prevent overlapping weekly subject schedules within a section and term.
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
  v_schedule jsonb;
  v_slot jsonb;
  v_schedule_conflict record;
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

  v_schedule := coalesce(nullif(p_payload->'schedule', 'null'::jsonb), '[]'::jsonb);
  for v_slot in select value from jsonb_array_elements(v_schedule)
  loop
    if trim(coalesce(v_slot->>'day', '')) = ''
      or coalesce(v_slot->>'startTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(v_slot->>'endTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (v_slot->>'startTime') >= (v_slot->>'endTime') then
      raise exception 'Every schedule row needs a day and valid start and end times, with the end time after the start time.';
    end if;
  end loop;

  -- Serialize saves for the section so simultaneous requests cannot both pass.
  perform 1 from public.branch_class_sections section
  where section.id = v_section_row_id
  for update;

  select subject.code as subject_code, slot.day, slot.start_time, slot.end_time
  into v_schedule_conflict
  from public.branch_subject_assignments assignment
  join public.branch_subject_assignment_slots slot on slot.assignment_id = assignment.id
  join public.branch_academic_subjects subject on subject.id = assignment.subject_row_id
  cross join jsonb_array_elements(v_schedule) as incoming(value)
  where assignment.branch_id = v_branch_id
    and assignment.section_row_id = v_section_row_id
    and assignment.academic_year = trim(p_payload->>'academic_year')
    and assignment.semester = v_semester
    and assignment.is_active
    and assignment.external_id <> v_external_id
    and lower(trim(slot.day)) = lower(trim(incoming.value->>'day'))
    and slot.start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and slot.end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (incoming.value->>'startTime') < slot.end_time
    and slot.start_time < (incoming.value->>'endTime')
  order by subject.code, slot.sort_order
  limit 1;

  if found then
    raise exception 'Cannot save: schedule overlaps with % on % (%-%), in this section.',
      v_schedule_conflict.subject_code, v_schedule_conflict.day,
      v_schedule_conflict.start_time, v_schedule_conflict.end_time;
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
  from jsonb_array_elements(v_schedule)
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
