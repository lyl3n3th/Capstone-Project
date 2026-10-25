begin;

-- Patch only the ID check so existing deployments retain their other import
-- validations and any already-applied school-history fields.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.import_existing_students(text,jsonb)'::regprocedure);
  v_old text := $old$('student_number', case when trim(coalesce(v_row->>'student_number','')) !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,49}$' then 'Use the original school student number, up to 50 letters/digits or . _ / - characters.' end)$old$;
  v_new text := $new$('student_number', case when trim(coalesce(v_row->>'student_number','')) !~ ('^' || public.resolve_student_number_prefix(v_branch_id) || '-[0-9]{6}$') then format('Use %s- followed by exactly 6 digits (e.g. %s-123456). The prefix must match %s.', public.resolve_student_number_prefix(v_branch_id), public.resolve_student_number_prefix(v_branch_id), v_branch_name) end)$new$;
begin
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'The existing import ID validation was not found. Review import_existing_students before applying this migration.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
commit;
