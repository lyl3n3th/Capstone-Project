create or replace function public.sync_student_contact_email_to_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admission_applications app
  set email = new.email,
      updated_at = timezone('utc', now())
  from public.student_profiles student
  where student.id = new.student_id
    and app.id = student.admission_application_id
    and lower(trim(app.email::text)) <> lower(trim(new.email::text));

  return new;
end;
$$;

drop trigger if exists student_contact_details_sync_email_to_admission
  on public.student_contact_details;
create trigger student_contact_details_sync_email_to_admission
after insert or update of email on public.student_contact_details
for each row
execute function public.sync_student_contact_email_to_admission();

update public.admission_applications app
set email = contact.email,
    updated_at = timezone('utc', now())
from public.student_profiles student
join public.student_contact_details contact
  on contact.student_id = student.id
where app.id = student.admission_application_id
  and lower(trim(app.email::text)) <> lower(trim(contact.email::text));

grant execute on function public.sync_student_contact_email_to_admission() to anon, authenticated;
