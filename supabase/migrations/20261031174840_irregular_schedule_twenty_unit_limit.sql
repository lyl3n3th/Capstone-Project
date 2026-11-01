-- Own-schedule requests are the irregular scheduling flow. All selected
-- subjects count toward the requested semester, including leftover subjects.
create or replace function public.enforce_irregular_schedule_unit_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_selection jsonb;
  v_selections jsonb := '[]'::jsonb;
  v_units numeric;
  v_program text;
  v_total numeric := 0;
  v_is_college boolean := coalesce(new.payload->>'program', 'College') = 'College';
begin
  -- Staff must still be able to reject or deactivate an older over-limit request.
  if new.status = 'Rejected' or not new.is_active then
    return new;
  end if;

  if jsonb_typeof(new.payload->'selections') is distinct from 'array' then
    raise exception 'Schedule selections must be an array.';
  end if;

  for v_selection in select value from jsonb_array_elements(new.payload->'selections')
  loop
    -- Catalog units are authoritative; do not trust units sent by the browser.
    select subject.units, subject.program into v_units, v_program
    from public.branch_academic_subjects subject
    where subject.branch_id = new.branch_id
      and (
        subject.external_id = v_selection->>'subjectId'
        or subject.id::text = v_selection->>'subjectId'
        or upper(trim(subject.code)) = upper(trim(v_selection->>'subjectCode'))
        or exists (
          select 1 from public.branch_subject_assignments assignment
          where assignment.branch_id = new.branch_id
            and assignment.subject_row_id = subject.id
            and (assignment.external_id = v_selection->>'assignmentId'
              or assignment.id::text = v_selection->>'assignmentId')
        )
      )
    order by
      case when exists (
        select 1 from public.branch_subject_assignments assignment
        where assignment.branch_id = new.branch_id
          and assignment.subject_row_id = subject.id
          and (assignment.external_id = v_selection->>'assignmentId'
            or assignment.id::text = v_selection->>'assignmentId')
      ) then 0
      when subject.external_id = v_selection->>'subjectId'
        or subject.id::text = v_selection->>'subjectId' then 1
      else 2 end,
      subject.id
    limit 1;

    if not found then
      raise exception 'Cannot verify units for selected subject %. Ask the admin or registrar to update the subject catalog.',
        coalesce(v_selection->>'subjectCode', v_selection->>'subjectId', '(unknown)');
    end if;
    if v_program = 'College' then
      v_is_college := true;
      if v_units is null or v_units < 0 then
        raise exception 'Selected college subjects must have valid catalog units before requesting a schedule.';
      end if;
      v_selection := v_selection || jsonb_build_object('units', v_units);
    end if;
    v_total := v_total + coalesce(v_units, 0);
    v_selections := v_selections || jsonb_build_array(v_selection);
  end loop;

  if v_is_college and v_total > 20 then
    raise exception 'Irregular students can request a maximum of 20 units per semester. Selected load: % units, including leftover subjects.', v_total;
  end if;
  new.payload := jsonb_set(new.payload, '{selections}', v_selections);
  return new;
end;
$$;

revoke all on function public.enforce_irregular_schedule_unit_limit() from public, anon, authenticated;

drop trigger if exists enforce_irregular_schedule_unit_limit
  on public.branch_student_schedule_requests;
create trigger enforce_irregular_schedule_unit_limit
before insert or update on public.branch_student_schedule_requests
for each row execute function public.enforce_irregular_schedule_unit_limit();
