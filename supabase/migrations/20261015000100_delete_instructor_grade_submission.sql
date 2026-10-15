create or replace function public.delete_instructor_grade_submission(
  p_branch text,
  p_submission_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  delete from public.instructor_grade_submissions submission
  where submission.branch_id = v_branch_id
    and submission.id = p_submission_id;
end;
$$;
