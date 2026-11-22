create or replace function public.list_student_grade_records(p_branch text)
returns table (payload jsonb)
language sql
security definer
set search_path = public
as $$
  select grade.payload
  from public.branch_student_grade_records grade
  join public.resolve_staff_branch(p_branch) branch
    on branch.branch_id = grade.branch_id
  order by
    grade.academic_year,
    grade.semester,
    grade.subject_code,
    grade.grading_period,
    grade.student_number,
    grade.id;
$$;
