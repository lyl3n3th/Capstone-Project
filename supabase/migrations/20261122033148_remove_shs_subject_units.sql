-- Senior High School subjects are not credit-bearing units.
-- Keep College unit values unchanged.
update public.branch_academic_subjects
set units = null
where program = 'SHS'
  and units is not null;

alter table public.branch_academic_subjects
  add constraint branch_academic_subjects_shs_units_null_check
  check (program <> 'SHS' or units is null);
