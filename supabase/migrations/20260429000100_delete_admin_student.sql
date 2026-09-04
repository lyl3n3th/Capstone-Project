drop function if exists public.delete_admin_student(jsonb);

create or replace function public.delete_admin_student(
  p_payload jsonb
)
returns table (
  student_number text,
  tracking_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_student_id uuid;
  v_student_number text;
  v_tracking_number text;
begin
  if trim(coalesce(p_payload->>'student_number', '')) = '' then
    raise exception 'Student number is required.';
  end if;

  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  select student.id, student.student_number, app.tracking_number
  into v_student_id, v_student_number, v_tracking_number
  from public.student_profiles student
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where upper(student.student_number) = upper(trim(p_payload->>'student_number'))
    and (
      v_branch_id is null
      or student.branch_id = v_branch_id
    )
    and (
      trim(coalesce(p_payload->>'tracking_number', '')) = ''
      or upper(coalesce(app.tracking_number, '')) =
        upper(trim(p_payload->>'tracking_number'))
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student number "%" was not found.', p_payload->>'student_number';
  end if;

  delete from public.student_profiles student
  where student.id = v_student_id;

  return query
  select v_student_number, v_tracking_number;
end;
$$;

grant execute on function public.delete_admin_student(jsonb) to anon, authenticated;
