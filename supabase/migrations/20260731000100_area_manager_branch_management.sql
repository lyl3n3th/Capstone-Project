create or replace function public.list_area_manager_branches()
returns table (
  code text,
  name text
)
language sql
security definer
set search_path = public
as $$
  select branch.code, branch.name
  from public.admission_branches branch
  where branch.is_active
  order by branch.name;
$$;

create or replace function public.upsert_area_manager_branch(
  p_code text,
  p_name text
)
returns table (
  code text,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
begin
  v_name := trim(coalesce(p_name, ''));
  v_code := lower(trim(coalesce(p_code, '')));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '_', 'g');
  v_code := regexp_replace(v_code, '^_+|_+$', '', 'g');

  if v_name = '' then
    raise exception 'Branch name is required.';
  end if;

  if v_code = '' then
    v_code := regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g');
    v_code := regexp_replace(v_code, '^_+|_+$', '', 'g');
  end if;

  if v_code = '' then
    raise exception 'Branch code could not be generated.';
  end if;

  insert into public.admission_branches (code, name, is_active)
  values (v_code, v_name, true)
  on conflict on constraint admission_branches_code_key do update
  set name = excluded.name,
      is_active = true;

  return query
  with saved_branch as (
    select branch.id, branch.code, branch.name
    from public.admission_branches branch
    where branch.code = v_code
  ),
  senior_high_program as (
    select program.id
    from public.academic_programs program
    where program.code = 'senior_high_school'
    limit 1
  ),
  enabled_offering as (
    insert into public.program_offerings (branch_id, program_id, is_active)
    select saved_branch.id, senior_high_program.id, true
    from saved_branch
    cross join senior_high_program
    on conflict (branch_id, program_id) do update
    set is_active = true
    returning branch_id
  )
  select saved_branch.code, saved_branch.name
  from saved_branch
  left join enabled_offering
    on enabled_offering.branch_id = saved_branch.id;
end;
$$;

create or replace function public.deactivate_area_manager_branch(p_branch text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
begin
  select branch.id, branch.name
  into v_branch_id, v_branch_name
  from public.admission_branches branch
  where branch.is_active
    and (
      lower(branch.code) = lower(trim(coalesce(p_branch, '')))
      or lower(branch.name) = lower(trim(coalesce(p_branch, '')))
    )
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured.', p_branch;
  end if;

  update public.admission_branches
  set is_active = false
  where id = v_branch_id;
end;
$$;

grant execute on function public.list_area_manager_branches() to anon, authenticated;
grant execute on function public.upsert_area_manager_branch(text, text) to anon, authenticated;
grant execute on function public.deactivate_area_manager_branch(text) to anon, authenticated;
