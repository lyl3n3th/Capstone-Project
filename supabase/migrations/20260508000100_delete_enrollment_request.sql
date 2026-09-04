drop function if exists public.delete_enrollment_request(jsonb);

create or replace function public.delete_enrollment_request(
  p_payload jsonb
)
returns table (
  id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_external_id text;
  v_student_number text;
  v_academic_year text;
  v_semester text;
begin
  if trim(coalesce(p_payload->>'branch', '')) = '' then
    raise exception 'Branch is required.';
  end if;

  select resolved.branch_id
  into v_branch_id
  from public.resolve_academic_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  v_external_id := nullif(trim(coalesce(p_payload->>'id', '')), '');
  v_student_number := nullif(trim(coalesce(p_payload->>'student_number', '')), '');
  v_academic_year := nullif(trim(coalesce(p_payload->>'academic_year', '')), '');
  v_semester := nullif(trim(coalesce(p_payload->>'semester', '')), '');

  if v_semester is not null then
    v_semester := public.normalize_academic_semester(v_semester);
  end if;

  return query
  with deleted as (
    delete from public.branch_enrollment_requests request
    where request.branch_id = v_branch_id
      and (
        (v_external_id is not null and request.external_id = v_external_id)
        or (
          v_student_number is not null
          and v_academic_year is not null
          and v_semester is not null
          and request.student_number = v_student_number
          and request.academic_year = v_academic_year
          and request.semester = v_semester
        )
      )
    returning request.external_id
  )
  select deleted.external_id
  from deleted;

  if not found then
    raise exception 'Enrollment request "%" was not found.', coalesce(v_external_id, v_student_number, 'unknown');
  end if;
end;
$$;

grant execute on function public.delete_enrollment_request(jsonb) to anon, authenticated;
