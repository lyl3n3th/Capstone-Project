drop function if exists public.update_admission_progress(
  text,
  smallint,
  text,
  boolean,
  numeric,
  text
);

drop function if exists public.get_admission_progress(text);

create or replace function public.get_admission_progress(
  p_tracking_number text
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
  middle_name text,
  sex text,
  civil_status text,
  address text,
  email text,
  phone_number text,
  last_school_attended text,
  year_completion integer,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    app.id as application_id,
    app.tracking_number,
    branch.code as branch_code,
    branch.name as branch_name,
    status.label as student_status_label,
    program.name as program_name,
    program.level as program_level,
    track.name as track_name,
    app.requested_year_level,
    honor.label as honor_label,
    coalesce(honor.tuition_discount_percent, 0)::numeric(5, 2) as honor_discount_percentage,
    app.applied_for_scholarship,
    app.scholarship_exam_score,
    public.calculate_admission_discount_percentage(
      honor.tuition_discount_percent,
      app.applied_for_scholarship,
      app.scholarship_exam_score
    ) as effective_discount_percentage,
    case
      when coalesce(app.applied_for_scholarship, false)
        and app.scholarship_exam_score is not null
        and app.scholarship_exam_score > coalesce(honor.tuition_discount_percent, 0)
        then 'scholarship_exam'
      when coalesce(honor.tuition_discount_percent, 0) > 0
        then 'honor'
      when coalesce(app.applied_for_scholarship, false)
        and app.scholarship_exam_score is not null
        and app.scholarship_exam_score > 0
        then 'scholarship_exam'
      else 'none'
    end as effective_discount_source,
    app.application_status,
    app.rejection_reason,
    app.current_step,
    app.first_name,
    app.last_name,
    app.middle_name,
    app.sex,
    app.civil_status,
    app.address,
    app.email::text as email,
    app.phone_number,
    app.last_school_attended,
    app.year_completion,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at
  from public.admission_applications app
  join public.admission_branches branch
    on branch.id = app.branch_id
  join public.admission_student_statuses status
    on status.id = app.student_status_id
  join public.program_offerings offering
    on offering.id = app.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  join public.program_tracks track
    on track.id = app.track_id
  left join public.admission_honors honor
    on honor.id = app.honor_id
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;
$$;

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
  middle_name text,
  sex text,
  civil_status text,
  address text,
  email text,
  phone_number text,
  last_school_attended text,
  year_completion integer,
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

grant execute on function public.get_admission_progress(text) to anon, authenticated;
grant execute on function public.update_admission_progress(
  text,
  smallint,
  text,
  boolean,
  numeric,
  text
) to anon, authenticated;
