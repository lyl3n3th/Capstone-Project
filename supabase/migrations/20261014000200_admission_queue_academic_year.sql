-- Make the academic year saved with each admission available to the
-- Registrar/Admin queue. This is intentionally separate from class-assignment
-- academic years, which may be for a later term.

create or replace function public.list_admission_academic_years(
  p_branch_code text default null
)
returns table (
  tracking_number text,
  academic_year text
)
language sql
security definer
set search_path = public
as $$
  select
    app.tracking_number,
    nullif(trim(app.academic_year), '') as academic_year
  from public.admission_applications app
  join public.admission_branches branch
    on branch.id = app.branch_id
  where app.application_status not in ('draft', 'cancelled')
    and (
      p_branch_code is null
      or branch.code = lower(trim(p_branch_code))
    )
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

grant execute on function public.list_admission_academic_years(text)
  to anon, authenticated;
