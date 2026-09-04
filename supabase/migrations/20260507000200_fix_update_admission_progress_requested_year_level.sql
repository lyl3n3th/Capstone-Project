drop function if exists public.update_admission_progress(
  text,
  smallint,
  text,
  boolean,
  numeric,
  text
);

create or replace function public.update_admission_progress(
  p_tracking_number text,
  p_current_step smallint,
  p_application_status text default null,
  p_mark_submitted boolean default false,
  p_scholarship_exam_score numeric default null,
  p_rejection_reason text default null
)
returns table (
  application_id uuid,
  tracking_number text,
  branch_code text,
  branch_name text,
  student_status_label text,
  program_name text,
  program_level text,
  track_name text,
  requested_year_level text,
  honor_label text,
  honor_discount_percentage numeric,
  applied_for_scholarship boolean,
  scholarship_exam_score numeric,
  effective_discount_percentage numeric,
  effective_discount_source text,
  application_status text,
  rejection_reason text,
  current_step smallint,
  first_name text,
  last_name text,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tracking_number text;
begin
  if p_scholarship_exam_score is not null
    and (p_scholarship_exam_score < 0 or p_scholarship_exam_score > 100) then
    raise exception 'Scholarship exam score must be between 0 and 100.';
  end if;

  update public.admission_applications as app
  set current_step = greatest(app.current_step, p_current_step),
      application_status = coalesce(p_application_status, app.application_status),
      rejection_reason = case
        when p_application_status is null then app.rejection_reason
        when lower(trim(p_application_status)) = 'rejected'
          then nullif(trim(coalesce(p_rejection_reason, '')), '')
        else null
      end,
      scholarship_exam_score = coalesce(
        round(p_scholarship_exam_score, 2),
        app.scholarship_exam_score
      ),
      submitted_at = case
        when p_mark_submitted then coalesce(app.submitted_at, timezone('utc', now()))
        else app.submitted_at
      end
  where app.tracking_number = upper(trim(p_tracking_number))
  returning app.tracking_number into v_tracking_number;

  if v_tracking_number is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  return query
  select *
  from public.get_admission_progress(v_tracking_number);
end;
$$;

grant execute on function public.update_admission_progress(
  text,
  smallint,
  text,
  boolean,
  numeric,
  text
) to anon, authenticated;
