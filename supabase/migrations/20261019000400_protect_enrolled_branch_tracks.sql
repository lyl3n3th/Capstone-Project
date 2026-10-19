begin;

alter table public.branch_track_offerings add column is_deleted boolean not null default false;
alter table public.branch_track_offerings add constraint deleted_branch_tracks_are_disabled
  check (not is_deleted or not is_active);

-- Deletions are scoped to a branch. Keep shared track identities for other
-- branches and historical student/admission records.
create function public.list_branch_track_catalog(p_branch text)
returns table (program_name text, track_name text)
language sql stable security definer set search_path = public
as $$
  select program.name, track.name
  from public.program_tracks track
  join public.academic_programs program on program.id = track.program_id
  join public.admission_branches branch on branch.is_active
    and (lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch)))
  where program.is_active and track.is_active and not exists (
    select 1 from public.branch_track_offerings available
    where available.branch_id = branch.id and available.track_id = track.id and available.is_deleted
  )
  order by program.name, track.name;
$$;

create function public.get_branch_track_usage(p_branch text)
returns table (program_name text, track_name text, student_count bigint)
language sql stable security definer set search_path = public
as $$
  select program.name, track.name, count(*)
  from public.student_profiles student
  join public.admission_branches branch on branch.id = student.branch_id
  join public.program_tracks track on track.id = student.track_id
  join public.academic_programs program on program.id = track.program_id
  where student.status = 'active'
    and (lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch)))
  group by program.name, track.name;
$$;

create function public.protect_enrolled_branch_track()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_active and not new.is_deleted and new.track_id = old.track_id and new.branch_id = old.branch_id then
      return new;
    end if;
  end if;
  perform 1 from public.admission_branches where id = old.branch_id for update;
  if exists (
    select 1 from public.student_profiles student
    where student.branch_id = old.branch_id and student.track_id = old.track_id and student.status = 'active'
  ) then
    raise exception 'This course or strand cannot be removed because active students in this branch are taking it.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger branch_track_offerings_protect_enrolled
before update or delete on public.branch_track_offerings
for each row execute function public.protect_enrolled_branch_track();

-- Serialize new enrollment with offering changes so an enrollment cannot
-- race a successful deletion and leave a student taking a deleted course.
create function public.validate_student_branch_track()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.branch_id = new.branch_id
      and old.track_id = new.track_id and old.program_offering_id = new.program_offering_id then
      return new;
    end if;
  end if;
  perform 1 from public.admission_branches where id = new.branch_id for update;
  if not exists (
    select 1 from public.branch_track_offerings available
    join public.admission_branches branch on branch.id = available.branch_id
    join public.program_tracks track on track.id = available.track_id
    join public.program_offerings offering on offering.branch_id = branch.id and offering.program_id = track.program_id
    where branch.id = new.branch_id and track.id = new.track_id and offering.id = new.program_offering_id
      and branch.is_active and available.is_active and not available.is_deleted and track.is_active and offering.is_active
  ) then
    raise exception 'This course or strand is not available at the selected branch.';
  end if;
  return new;
end;
$$;

create trigger student_profiles_validate_branch_track
before insert or update of branch_id, track_id, program_offering_id, status on public.student_profiles
for each row execute function public.validate_student_branch_track();

create function public.delete_branch_track_offering(
  p_session_token text, p_branch text, p_program_name text, p_track_name text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_branch_id uuid;
  v_track_id uuid;
begin
  if not exists (
    select 1 from public.area_manager_sessions session
    join public.area_manager_accounts account on account.id = session.account_id
    where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
      and session.expires_at > timezone('utc', now()) and account.is_active
  ) then
    raise exception 'Your Area Manager session has expired. Please sign in again.';
  end if;
  select id into v_branch_id from public.admission_branches
    where is_active and (lower(code) = lower(trim(p_branch)) or lower(name) = lower(trim(p_branch))) for update;
  if v_branch_id is null then raise exception 'Branch is not configured.'; end if;
  select track.id into v_track_id from public.program_tracks track
    join public.academic_programs program on program.id = track.program_id
    where program.name = trim(p_program_name) and lower(track.name) = lower(trim(p_track_name));
  if v_track_id is null then raise exception 'Course or strand was not found.'; end if;
  if exists (
    select 1 from public.student_profiles student
    where student.branch_id = v_branch_id and student.track_id = v_track_id and student.status = 'active'
  ) then
    raise exception 'This course or strand cannot be deleted because active students in this branch are taking it.';
  end if;

  insert into public.branch_track_offerings(branch_id, track_id, is_active, is_deleted)
  values (v_branch_id, v_track_id, false, true)
  on conflict (branch_id, track_id) do update set is_active = false, is_deleted = true;

  update public.program_offerings offering set is_active = exists (
    select 1 from public.branch_track_offerings available
    join public.program_tracks track on track.id = available.track_id
    where available.branch_id = v_branch_id and track.program_id = offering.program_id
      and available.is_active and not available.is_deleted and track.is_active
  ) where offering.branch_id = v_branch_id;
end;
$$;

revoke all on function public.list_branch_track_catalog(text) from public;
revoke all on function public.get_branch_track_usage(text) from public;
revoke all on function public.protect_enrolled_branch_track() from public;
revoke all on function public.validate_student_branch_track() from public;
revoke all on function public.delete_branch_track_offering(text, text, text, text) from public;
grant execute on function public.list_branch_track_catalog(text) to anon, authenticated;
grant execute on function public.get_branch_track_usage(text) to anon, authenticated;
grant execute on function public.delete_branch_track_offering(text, text, text, text) to anon, authenticated;

-- Updated availability saving follows below; enrolled tracks must stay selected.

create or replace function public.save_branch_track_offerings(
  p_session_token text,
  p_branch text,
  p_tracks jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_branch_id uuid;
  v_program_id uuid;
  v_track_id uuid;
  v_track jsonb;
  v_track_name text;
  v_selected_track_ids uuid[] := array[]::uuid[];
begin
  if not exists (
    select 1 from public.area_manager_sessions session
    join public.area_manager_accounts account on account.id = session.account_id
    where session.token_hash = extensions.digest(trim(coalesce(p_session_token, '')), 'sha256')
      and session.expires_at > timezone('utc', now()) and account.is_active
  ) then
    raise exception 'Your Area Manager session has expired. Please sign in again.';
  end if;

  select branch.id into v_branch_id from public.admission_branches branch
  where branch.is_active and (lower(branch.code) = lower(trim(p_branch))
    or lower(branch.name) = lower(trim(p_branch)))
  for update;
  if v_branch_id is null then raise exception 'Branch is not configured.'; end if;
  if p_tracks is null or jsonb_typeof(p_tracks) <> 'array' then
    raise exception 'Courses and strands must be a list.';
  end if;



  for v_track in select value from jsonb_array_elements(p_tracks) loop
    v_track_name := trim(coalesce(v_track->>'track_name', ''));
    if jsonb_typeof(v_track) <> 'object'
      or jsonb_typeof(v_track->'track_name') is distinct from 'string'
      or coalesce(v_track->>'program_name', '') not in ('College', 'Senior High School')
      or v_track_name = '' or char_length(v_track_name) > 160 then
      raise exception 'Each course or strand needs an educational level and a name of up to 160 characters.';
    end if;

    select id into v_program_id from public.academic_programs
    where name = v_track->>'program_name' and is_active;
    if v_program_id is null then raise exception 'Educational level is not configured.'; end if;

    perform pg_advisory_xact_lock(hashtextextended(v_program_id::text || lower(v_track_name), 0));
    select id into v_track_id from public.program_tracks
    where program_id = v_program_id and lower(name) = lower(v_track_name)
    limit 1;
    if v_track_id is null then
      insert into public.program_tracks (program_id, code, name)
      values (v_program_id, 'custom_' || md5(lower(v_track_name)), v_track_name)
      on conflict (program_id, name) do update set is_active = true
      returning id into v_track_id;
    else
      update public.program_tracks set is_active = true where id = v_track_id;
    end if;

    insert into public.branch_track_offerings (branch_id, track_id, is_active, is_deleted)
    values (v_branch_id, v_track_id, true, false)
    on conflict (branch_id, track_id) do update set is_active = true, is_deleted = false;
    v_selected_track_ids := array_append(v_selected_track_ids, v_track_id);
  end loop;

  if exists (
    select 1 from public.student_profiles student
    where student.branch_id = v_branch_id and student.status = 'active'
      and not (student.track_id = any(v_selected_track_ids))
  ) then
    raise exception 'A course or strand cannot be removed while active students in this branch are taking it.';
  end if;
  update public.branch_track_offerings set is_active = false
    where branch_id = v_branch_id and not (track_id = any(v_selected_track_ids));

  -- Keep the existing program-level checks consistent with the branch's tracks.
  insert into public.program_offerings (branch_id, program_id, is_active)
  select v_branch_id, program.id, exists (
    select 1 from public.branch_track_offerings available
    join public.program_tracks track on track.id = available.track_id
    where available.branch_id = v_branch_id and available.is_active
      and track.program_id = program.id and track.is_active
  )
  from public.academic_programs program where program.is_active
  on conflict (branch_id, program_id) do update set is_active = excluded.is_active;
end;
$$;


notify pgrst, 'reload schema';
commit;
