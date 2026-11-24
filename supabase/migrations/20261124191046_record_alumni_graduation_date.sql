-- Record the branch's Philippine calendar date at the actual alumni transition.
-- Keep this in branch-scoped backup data so existing backup/restore includes it.
create or replace function public.record_alumni_graduation_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'graduated' then
    insert into public.branch_local_storage_records (branch_id, scope, payload)
    values (
      new.branch_id,
      'alumni-graduation-dates',
      jsonb_build_object(new.student_number, jsonb_build_object(
        'date', to_char(statement_timestamp() at time zone 'Asia/Manila', 'YYYY-MM-DD'),
        'estimated', false
      ))
    )
    on conflict (branch_id, scope) do update
    set payload = branch_local_storage_records.payload || excluded.payload,
        updated_at = now();
  elsif old.status = 'graduated' then
    update public.branch_local_storage_records
    set payload = payload - old.student_number, updated_at = now()
    where branch_id = old.branch_id and scope = 'alumni-graduation-dates';
  end if;
  return new;
end;
$$;

drop trigger if exists student_profiles_record_alumni_graduation_date on public.student_profiles;
create trigger student_profiles_record_alumni_graduation_date
after update of status on public.student_profiles
for each row
when (old.status is distinct from new.status)
execute function public.record_alumni_graduation_date();

-- Historical transfers did not record their transition date. The last profile
-- update is the best available estimate; mark it as such and preserve dates
-- already recorded by the trigger.
insert into public.branch_local_storage_records (branch_id, scope, payload)
select branch_id, 'alumni-graduation-dates',
  jsonb_object_agg(student_number, jsonb_build_object(
    'date', to_char(updated_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    'estimated', true
  ))
from public.student_profiles
where status = 'graduated'
group by branch_id
on conflict (branch_id, scope) do update
set payload = excluded.payload || branch_local_storage_records.payload,
    updated_at = now();
