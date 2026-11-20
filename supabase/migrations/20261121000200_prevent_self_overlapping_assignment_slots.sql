create or replace function public.prevent_overlapping_slots_within_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_conflicting_slot public.branch_subject_assignment_slots%rowtype;
  v_subject_code text;
begin
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
$$;

drop trigger if exists branch_subject_assignment_slots_prevent_self_overlap
  on public.branch_subject_assignment_slots;

create trigger branch_subject_assignment_slots_prevent_self_overlap
before insert or update on public.branch_subject_assignment_slots
for each row
execute function public.prevent_overlapping_slots_within_assignment();
