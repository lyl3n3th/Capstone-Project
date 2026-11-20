begin;

create or replace function public.delete_branch_local_storage_record(
  p_branch text,
  p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_scope text := trim(coalesce(p_scope, ''));
begin
  if left(v_scope, length('imported-student-credential-')) <> 'imported-student-credential-' then
    raise exception 'Only imported student credential records can be removed.';
  end if;

  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  delete from public.branch_local_storage_records record
  where record.branch_id = v_branch_id
    and record.scope = v_scope;
end;
$$;

revoke all on function public.delete_branch_local_storage_record(text, text) from public;
grant execute on function public.delete_branch_local_storage_record(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
