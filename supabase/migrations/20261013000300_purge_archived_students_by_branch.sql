-- Clear Archive must remove archived student profiles from the shared source,
-- not only from an individual browser's local archive cache.

drop function if exists public.purge_archived_admin_students(text);

create or replace function public.purge_archived_admin_students(
  p_branch text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_deleted_count integer := 0;
  v_application_ids uuid[];
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  with deleted_students as (
    delete from public.student_profiles student
    where student.branch_id = v_branch_id
      and student.status = 'archived'
    returning student.admission_application_id
  )
  select
    count(*)::integer,
    array_agg(admission_application_id)
      filter (where admission_application_id is not null)
  into v_deleted_count, v_application_ids
  from deleted_students;

  if v_application_ids is not null then
    delete from public.admission_applications app
    where app.id = any(v_application_ids);
  end if;

  return v_deleted_count;
end;
$$;

grant execute on function public.purge_archived_admin_students(text)
  to anon, authenticated;
