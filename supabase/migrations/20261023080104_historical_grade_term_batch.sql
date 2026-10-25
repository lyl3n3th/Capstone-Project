begin;

-- The existing function already saves its batch atomically and validates every
-- subject, period, instructor, grade, and protected uploaded record.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.save_imported_student_historical_grades(text,text,jsonb)'::regprocedure);
  v_old text := $old$if jsonb_array_length(p_records) not between 1 and 2 then raise exception 'Save one subject at a time.'; end if;$old$;
  v_new text := $new$if jsonb_array_length(p_records) not between 1 and 500 then raise exception 'Save between 1 and 500 historical grades at a time.'; end if;$new$;
begin
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'Historical grade batch limit was not found. Review save_imported_student_historical_grades before applying this migration.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
commit;
