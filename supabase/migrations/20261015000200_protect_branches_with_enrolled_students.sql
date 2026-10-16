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

  if exists (
    select 1
    from public.student_profiles student
    where student.branch_id = v_branch_id
      and lower(trim(coalesce(student.status, 'active'))) = 'active'
  ) then
    raise exception 'This branch cannot be deleted because it has enrolled students.';
  end if;

  update public.admission_branches
  set is_active = false
  where id = v_branch_id;
end;
$$;

grant execute on function public.deactivate_area_manager_branch(text) to anon, authenticated;
