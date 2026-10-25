-- All requests intentionally omit required profile fields, so none can insert.
begin;
set local statement_timeout = '15s';
do $$
declare
  v_branch record;
  v_candidate text;
  v_result jsonb;
  v_wrong_prefix text;
  v_test_code text := 'import_format_test_' || replace(gen_random_uuid()::text, '-', '');
begin
  -- A configured prefix need not be the first three letters of a renamed branch.
  insert into public.admission_branches(code, name, student_number_prefix)
    values(v_test_code, 'Import Format Fixture ' || v_test_code,
      public.allocate_branch_student_number_prefix('ZZ Import Format Test', v_test_code));
  for v_branch in select id, code, name from public.admission_branches where is_active loop
    v_wrong_prefix := case when public.resolve_student_number_prefix(v_branch.id) = 'ZZZ' then 'YYY' else 'ZZZ' end;
    foreach v_candidate in array array[
      '123456', public.resolve_student_number_prefix(v_branch.id) || '123456',
      lower(public.resolve_student_number_prefix(v_branch.id)) || '-123456',
      v_wrong_prefix || '-123456',
      public.resolve_student_number_prefix(v_branch.id) || '-12345',
      public.resolve_student_number_prefix(v_branch.id) || '-1234567',
      public.resolve_student_number_prefix(v_branch.id) || '_123456',
      public.resolve_student_number_prefix(v_branch.id) || '-12345A'
    ] loop
      v_result := public.import_existing_students(v_branch.code,
        jsonb_build_array(jsonb_build_object('row_number', 7, 'student_number', v_candidate)));
      assert (v_result->>'imported_count')::integer = 0;
      assert exists(select 1 from jsonb_array_elements(v_result->'errors') item
        where item->>'field' = 'student_number' and item->>'row_number' = '7'
          and item->>'message' like '%exactly 6 digits%'),
        format('Expected ID format error for %s in %s', v_candidate, v_branch.name);
    end loop;

    v_candidate := public.resolve_student_number_prefix(v_branch.id) || '-000123';
    v_result := public.import_existing_students(v_branch.name,
      jsonb_build_array(jsonb_build_object('row_number', 7, 'student_number', v_candidate)));
    assert (v_result->>'imported_count')::integer = 0;
    assert not exists(select 1 from jsonb_array_elements(v_result->'errors') item
      where item->>'field' = 'student_number' and item->>'message' like '%exactly 6 digits%'),
      format('Valid branch ID %s should pass the format check', v_candidate);
  end loop;
end;
$$;
select 'Branch student ID format checks passed' as result;
rollback;
