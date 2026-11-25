alter table public.branch_student_planning_states
  add column if not exists placement_academic_year text,
  add column if not exists placement_semester text,
  add column if not exists current_academic_year text,
  add column if not exists current_semester text,
  add column if not exists current_year_level text;

alter table public.branch_student_planning_states
  add constraint branch_student_planning_states_placement_semester_check
    check (placement_semester is null or placement_semester in ('1st Semester', '2nd Semester', 'Summer')),
  add constraint branch_student_planning_states_current_semester_check
    check (current_semester is null or current_semester in ('1st Semester', '2nd Semester', 'Summer'));

drop function if exists public.list_student_planning_states(text);
create function public.list_student_planning_states(p_branch text default null)
returns table (
  student_number text,
  tracking_number text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  placement_academic_year text,
  placement_semester text,
  current_academic_year text,
  current_semester text,
  current_year_level text
)
language sql security definer set search_path = public as $$
  select state.student_number, state.tracking_number,
    state.requested_own_schedule, state.own_schedule_request_status,
    state.own_schedule_academic_year, state.own_schedule_semester,
    state.own_schedule_selection_status, state.placement_academic_year,
    state.placement_semester, state.current_academic_year,
    state.current_semester, state.current_year_level
  from public.branch_student_planning_states state
  join public.admission_branches branch on branch.id = state.branch_id
  where p_branch is null or lower(branch.code) = lower(trim(p_branch))
     or lower(branch.name) = lower(trim(p_branch))
  order by state.updated_at desc, state.student_number;
$$;

drop function if exists public.upsert_student_planning_state(jsonb);
create function public.upsert_student_planning_state(p_payload jsonb)
returns table (
  student_number text,
  tracking_number text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  placement_academic_year text,
  placement_semester text,
  current_academic_year text,
  current_semester text,
  current_year_level text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_student_number text;
  v_own_semester text;
  v_placement_semester text;
  v_current_semester text;
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
  v_own_semester := nullif(trim(coalesce(p_payload->>'own_schedule_semester', '')), '');
  v_placement_semester := nullif(trim(coalesce(p_payload->>'placement_semester', '')), '');
  v_current_semester := nullif(trim(coalesce(p_payload->>'current_semester', '')), '');
  if v_own_semester is not null then v_own_semester := public.normalize_academic_semester(v_own_semester); end if;
  if v_placement_semester is not null then v_placement_semester := public.normalize_academic_semester(v_placement_semester); end if;
  if v_current_semester is not null then v_current_semester := public.normalize_academic_semester(v_current_semester); end if;

  insert into public.branch_student_planning_states (
    branch_id, student_number, tracking_number, requested_own_schedule,
    own_schedule_request_status, own_schedule_academic_year, own_schedule_semester,
    own_schedule_selection_status, placement_academic_year, placement_semester,
    current_academic_year, current_semester, current_year_level
  ) values (
    v_branch_id, v_student_number,
    nullif(trim(coalesce(p_payload->>'tracking_number', '')), ''),
    coalesce((p_payload->>'requested_own_schedule')::boolean, false),
    nullif(trim(coalesce(p_payload->>'own_schedule_request_status', '')), ''),
    nullif(trim(coalesce(p_payload->>'own_schedule_academic_year', '')), ''),
    v_own_semester,
    nullif(trim(coalesce(p_payload->>'own_schedule_selection_status', '')), ''),
    nullif(trim(coalesce(p_payload->>'placement_academic_year', '')), ''),
    v_placement_semester,
    nullif(trim(coalesce(p_payload->>'current_academic_year', '')), ''),
    v_current_semester,
    nullif(trim(coalesce(p_payload->>'current_year_level', '')), '')
  ) on conflict on constraint branch_student_planning_states_student_unique do update
  set tracking_number = excluded.tracking_number,
      requested_own_schedule = excluded.requested_own_schedule,
      own_schedule_request_status = excluded.own_schedule_request_status,
      own_schedule_academic_year = excluded.own_schedule_academic_year,
      own_schedule_semester = excluded.own_schedule_semester,
      own_schedule_selection_status = excluded.own_schedule_selection_status,
      placement_academic_year = case when p_payload ? 'placement_academic_year' then excluded.placement_academic_year else branch_student_planning_states.placement_academic_year end,
      placement_semester = case when p_payload ? 'placement_semester' then excluded.placement_semester else branch_student_planning_states.placement_semester end,
      current_academic_year = case when p_payload ? 'current_academic_year' then excluded.current_academic_year else branch_student_planning_states.current_academic_year end,
      current_semester = case when p_payload ? 'current_semester' then excluded.current_semester else branch_student_planning_states.current_semester end,
      current_year_level = case when p_payload ? 'current_year_level' then excluded.current_year_level else branch_student_planning_states.current_year_level end;

  return query select * from public.list_student_planning_states(v_branch_name) state
    where state.student_number = v_student_number limit 1;
end;
$$;

grant execute on function public.list_student_planning_states(text) to anon, authenticated;
grant execute on function public.upsert_student_planning_state(jsonb) to anon, authenticated;
