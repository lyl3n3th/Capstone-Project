drop function if exists public.student_portal_email_login(text);

create or replace function public.student_portal_email_login(
  p_email text
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
  program_name text,
  track_name text,
  year_level text,
  section text,
  email text,
  phone_number text,
  address text,
  birth_date date,
  sex text,
  civil_status text,
  portal_account_registered boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_email text;
  v_tracking_number text;
  v_student_id uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  if v_email = '' then
    raise exception 'Admission email is required.';
  end if;

  select app.tracking_number
  into v_tracking_number
  from public.admission_applications app
  where lower(trim(app.email::text)) = v_email
    and app.application_status = 'accepted'
  order by app.submitted_at desc nulls last, app.created_at desc
  limit 1;

  if v_tracking_number is null then
    raise exception 'No accepted admission record matched this email address.';
  end if;

  perform 1
  from public.activate_approved_student(v_tracking_number);

  select student.id
  into v_student_id
  from public.student_profiles student
  join public.student_contact_details contact
    on contact.student_id = student.id
  where lower(trim(contact.email::text)) = v_email
    and student.status = 'active'
    and student.admission_application_id = (
      select app.id
      from public.admission_applications app
      where app.tracking_number = v_tracking_number
      limit 1
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Unable to activate the accepted admission record for this email.';
  end if;

  update public.student_portal_accounts account
  set last_login_at = timezone('utc', now())
  where account.student_id = v_student_id
    and account.status = 'active';

  return query
  select *
  from public.get_student_portal_snapshot(v_student_id);
end;
$$;

grant execute on function public.student_portal_email_login(text) to anon, authenticated;
