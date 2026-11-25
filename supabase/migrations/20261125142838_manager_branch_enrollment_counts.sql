create or replace function public.get_manager_branch_enrollment_counts(p_branches text[])
returns table (branch text, shs integer, college integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select requested.name,
         count(*) filter (where eligible.program = 'SHS')::integer,
         count(*) filter (where eligible.program = 'College')::integer
  from (select distinct unnest(p_branches) as name) requested
  cross join lateral public.resolve_staff_branch(requested.name) resolved
  left join lateral (
    with stored as (
      select distinct on (entry->>'trackingNumber') entry
      from jsonb_array_elements(
        coalesce(nullif(public.get_branch_local_storage_record(requested.name, 'enrollees'), 'null'::jsonb), '[]'::jsonb)
      ) with ordinality as records(entry, position)
      order by entry->>'trackingNumber', position desc
    ),
    combined as (
      select
        coalesce(stored.entry->>'program',
          case when queue.application_id is not null then
            case when queue.program_name = 'Senior High School' then 'SHS' else 'College' end
          end) as program,
        coalesce(nullif(stored.entry->>'status', ''),
          case when queue.application_status = 'accepted' then 'Approved' end) as status,
        coalesce(stored.entry->>'studentStatus', queue.student_status_label) as applicant_type,
        stored.entry->>'archivedAt' as archived_at
      from public.get_admin_admission_queue(resolved.branch_code) queue
      full join stored on stored.entry->>'trackingNumber' = queue.tracking_number
    )
    select program from combined
    where status = 'Approved'
      and coalesce(archived_at, '') = ''
      and lower(trim(applicant_type)) in ('junior high completer', 'senior high graduate', 'transferee', 'new admission', 'new student')
  ) eligible on true
  group by requested.name
  order by requested.name;
$$;

revoke execute on function public.get_manager_branch_enrollment_counts(text[]) from public;
grant execute on function public.get_manager_branch_enrollment_counts(text[]) to anon, authenticated;
