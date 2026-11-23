create or replace function public.prevent_overlapping_slots_within_assignment()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_conflicting_slot public.branch_subject_assignment_slots%rowtype;
  v_subject_code text;
begin
  -- Preserve historical rows from an authenticated complete-backup restore.
  if current_user = 'service_role'
     and pg_catalog.current_setting('app.restore_branch_backup', true) = 'on' then
    return new;
  end if;

  select subject.code
  into v_subject_code
  from public.branch_subject_assignments assignment
  join public.branch_academic_subjects subject
    on subject.id = assignment.subject_row_id
  where assignment.id = new.assignment_id;

  select slot.*
  into v_conflicting_slot
  from public.branch_subject_assignment_slots slot
  where slot.assignment_id = new.assignment_id
    and slot.id <> new.id
    and lower(trim(slot.day)) = lower(trim(new.day))
    and new.start_time < slot.end_time
    and slot.start_time < new.end_time
  order by slot.sort_order, slot.id
  limit 1;

  if found then
    raise exception
      'Cannot save: % has overlapping schedule entries on % (%-% overlaps %-%).',
      coalesce(v_subject_code, 'This subject'),
      trim(new.day),
      trim(new.start_time),
      trim(new.end_time),
      trim(v_conflicting_slot.start_time),
      trim(v_conflicting_slot.end_time);
  end if;

  return new;
end;
$function$;

alter function public.restore_branch_backup_data(text, jsonb)
  rename to restore_branch_backup_data_impl;

revoke all on function public.restore_branch_backup_data_impl(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_branch_backup_data_impl(text, jsonb)
  to service_role;

create function public.restore_branch_backup_data(p_branch text, p_snapshot jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  restored_counts jsonb;
begin
  perform pg_catalog.set_config('app.restore_branch_backup', 'on', true);
  restored_counts := public.restore_branch_backup_data_impl(p_branch, p_snapshot);
  perform pg_catalog.set_config('app.restore_branch_backup', 'off', true);
  return restored_counts;
end;
$function$;

revoke all on function public.restore_branch_backup_data(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_branch_backup_data(text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
