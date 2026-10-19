begin;

create table public.branch_track_offerings (
  branch_id uuid not null references public.admission_branches(id) on delete cascade,
  track_id uuid not null references public.program_tracks(id) on delete restrict,
  is_active boolean not null default true,
  primary key (branch_id, track_id)
);

alter table public.branch_track_offerings enable row level security;
revoke all on public.branch_track_offerings from anon, authenticated;

-- Preserve current offerings; branches created after this migration start empty.
insert into public.branch_track_offerings (branch_id, track_id)
select offering.branch_id, track.id
from public.program_offerings offering
join public.program_tracks track on track.program_id = offering.program_id
where offering.is_active and track.is_active;

create function public.list_branch_track_catalog()
returns table (program_name text, track_name text)
language sql stable security definer set search_path = public
as $$
  select program.name, track.name
  from public.program_tracks track
  join public.academic_programs program on program.id = track.program_id
  where program.is_active and track.is_active
  order by program.name, track.name;
$$;

create function public.list_branch_track_offerings(p_branch text default null)
returns table (branch_code text, branch_name text, program_name text, track_name text)
language sql stable security definer set search_path = public
as $$
  select branch.code, branch.name, program.name, track.name
  from public.branch_track_offerings available
  join public.admission_branches branch on branch.id = available.branch_id
  join public.program_tracks track on track.id = available.track_id
  join public.academic_programs program on program.id = track.program_id
  join public.program_offerings offering
    on offering.branch_id = branch.id and offering.program_id = program.id
  where available.is_active and branch.is_active and program.is_active
    and offering.is_active and track.is_active
    and (p_branch is null or lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch)))
  order by branch.name, program.name, track.name;
$$;

create function public.save_branch_track_offerings(
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

  update public.branch_track_offerings set is_active = false where branch_id = v_branch_id;

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

    insert into public.branch_track_offerings (branch_id, track_id, is_active)
    values (v_branch_id, v_track_id, true)
    on conflict (branch_id, track_id) do update set is_active = true;
  end loop;

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

create function public.validate_admission_branch_track()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.program_offering_id = old.program_offering_id and new.track_id = old.track_id then
      return new;
    end if;
  end if;
  if not exists (
    select 1 from public.program_offerings offering
    join public.branch_track_offerings available on available.branch_id = offering.branch_id
    join public.program_tracks track on track.id = available.track_id
    where offering.id = new.program_offering_id and track.id = new.track_id
      and track.program_id = offering.program_id
      and available.is_active and offering.is_active and track.is_active
  ) then
    raise exception 'This course or strand is no longer available at the selected branch. Please choose another.';
  end if;
  return new;
end;
$$;

create trigger admission_applications_validate_branch_track
before insert or update of program_offering_id, track_id on public.admission_applications
for each row execute function public.validate_admission_branch_track();

revoke all on function public.list_branch_track_catalog() from public;
revoke all on function public.list_branch_track_offerings(text) from public;
revoke all on function public.save_branch_track_offerings(text, text, jsonb) from public;
revoke all on function public.validate_admission_branch_track() from public;
grant execute on function public.list_branch_track_catalog() to anon, authenticated;
grant execute on function public.list_branch_track_offerings(text) to anon, authenticated;
grant execute on function public.save_branch_track_offerings(text, text, jsonb) to anon, authenticated;

-- Branch creation/synchronization must not turn an educational level back on.
create or replace function public.upsert_area_manager_branch(p_code text, p_name text)
returns table (code text, name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_name = '' then raise exception 'Branch name is required.'; end if;
  v_code := lower(trim(coalesce(nullif(trim(p_code), ''), v_name)));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '_', 'g');
  v_code := regexp_replace(v_code, '^_+|_+$', '', 'g');
  if v_code = '' then raise exception 'Branch code could not be generated.'; end if;
  insert into public.admission_branches (code, name, is_active)
  values (v_code, v_name, true)
  on conflict on constraint admission_branches_code_key do update
  set name = excluded.name, is_active = true;
  return query select branch.code, branch.name
    from public.admission_branches branch where branch.code = v_code;
end;
$$;
revoke all on function public.upsert_area_manager_branch(text, text) from public;
grant execute on function public.upsert_area_manager_branch(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
