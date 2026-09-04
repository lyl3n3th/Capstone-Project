drop function if exists public.update_admin_student_email(jsonb);

create or replace function public.update_admin_student_email(
  p_payload jsonb
)
returns table (
  student_id uuid,
  student_number text,
  tracking_number text,
  branch text,
  full_name text,
  first_name text,
  last_name text,
  middle_name text,
  program text,
  year_level text,
  section text,
  shs_track_type text,
  strand_or_course text,
  document_submitted_date date,
  contact_number text,
  email text,
  address text,
  status text,
  student_status text,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_academic_year text,
  own_schedule_semester text,
  own_schedule_selection_status text,
  birth_date date,
  guardian_name text,
  guardian_contact text,
  sex text,
  civil_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_branch_id uuid;
  v_branch_name text;
  v_student_id uuid;
  v_student_number text;
begin
  if trim(coalesce(p_payload->>'email', '')) = '' then
    raise exception 'Email is required.';
  end if;

  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_payload->>'branch') as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_payload->>'branch';
  end if;

  select student.id, student.student_number
  into v_student_id, v_student_number
  from public.student_profiles student
  left join public.admission_applications app
    on app.id = student.admission_application_id
  where student.branch_id = v_branch_id
    and (
      upper(student.student_number) = upper(trim(coalesce(p_payload->>'student_number', '')))
      or (
        trim(coalesce(p_payload->>'tracking_number', '')) <> ''
        and app.tracking_number = upper(trim(p_payload->>'tracking_number'))
      )
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student "%" was not found in branch "%".', p_payload->>'student_number', v_branch_name;
  end if;

  update public.student_contact_details contact
  set email = trim(lower(p_payload->>'email'))::citext
  where contact.student_id = v_student_id;

  if not found then
    raise exception 'Student contact details were not found for "%".', v_student_number;
  end if;

  update public.admission_applications app
  set email = trim(lower(p_payload->>'email'))::citext,
      updated_at = timezone('utc', now())
  from public.student_profiles student
  where student.id = v_student_id
    and app.id = student.admission_application_id;

  return query
  select *
  from public.list_admin_students(v_branch_name) student
  where student.student_number = v_student_number
  limit 1;
end;
$$;

grant execute on function public.update_admin_student_email(jsonb) to anon, authenticated;
