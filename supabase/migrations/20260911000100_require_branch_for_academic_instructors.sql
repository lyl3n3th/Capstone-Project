drop function if exists public.list_academic_instructors(text);

create or replace function public.list_academic_instructors(
  p_branch text default null
)
returns table (
  id text,
  name text,
  employee_id text,
  department text,
  email text,
  contact_number text
)
language sql
security definer
set search_path = public
as $$
  select
    instructor.external_id as id,
    instructor.name,
    instructor.employee_id,
    instructor.department,
    instructor.email::text as email,
    instructor.contact_number
  from public.branch_academic_instructors instructor
  join public.admission_branches branch
    on branch.id = instructor.branch_id
  where instructor.is_active
    and trim(coalesce(p_branch, '')) <> ''
    and (
      lower(branch.code) = lower(trim(p_branch))
      or lower(branch.name) = lower(trim(p_branch))
    )
  order by instructor.name;
$$;

revoke execute on function public.list_academic_instructors(text) from anon;
grant execute on function public.list_academic_instructors(text) to anon, authenticated;
