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
  on conflict on constraint branch_assignment_rooms_branch_id_room_name_key do update
  set is_active = true;

  return query
  select room.room_name
  from public.list_assignment_rooms(v_branch_name) room
  where room.room_name = v_room_name
  limit 1;
end;
$$;

revoke execute on function public.upsert_assignment_room(text, text) from anon;
grant execute on function public.upsert_assignment_room(text, text) to anon, authenticated;
