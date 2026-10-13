-- Persist the own-schedule request made during admission so it is visible to
-- Registrar/Admin in every browser, rather than only in the applicant's local
-- browser storage.

alter table public.admission_applications
  add column if not exists requested_own_schedule boolean not null default false,
  add column if not exists own_schedule_request_status text,
  add column if not exists own_schedule_request_submitted_at timestamptz,
  add column if not exists own_schedule_request_decided_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admission_applications_own_schedule_request_status_check'
      and conrelid = 'public.admission_applications'::regclass
  ) then
    alter table public.admission_applications
      add constraint admission_applications_own_schedule_request_status_check
      check (
        own_schedule_request_status is null
        or own_schedule_request_status in ('Pending', 'Approved', 'Rejected')
      );
  end if;
end;
$$;

create or replace function public.get_admission_own_schedule_request(
  p_tracking_number text
)
returns table (
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_request_submitted_at timestamptz,
  own_schedule_request_decided_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    app.requested_own_schedule,
    app.own_schedule_request_status,
    app.own_schedule_request_submitted_at,
    app.own_schedule_request_decided_at
  from public.admission_applications app
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;
$$;

create or replace function public.set_admission_own_schedule_request(
  p_tracking_number text,
  p_requested boolean
)
returns table (
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_request_submitted_at timestamptz,
  own_schedule_request_decided_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id uuid;
  v_program_level text;
begin
  select app.id, program.level
  into v_application_id, v_program_level
  from public.admission_applications app
  join public.program_offerings offering
    on offering.id = app.program_offering_id
  join public.academic_programs program
    on program.id = offering.program_id
  where app.tracking_number = upper(trim(p_tracking_number))
  limit 1;

  if v_application_id is null then
    raise exception 'Tracking number "%" was not found.', p_tracking_number;
  end if;

  if coalesce(p_requested, false) and v_program_level <> 'college' then
    raise exception 'Own schedule requests are available only for college admissions.';
  end if;

  update public.admission_applications app
  set requested_own_schedule = coalesce(p_requested, false),
      own_schedule_request_status = case
        when coalesce(p_requested, false) then 'Pending'
        else null
      end,
      own_schedule_request_submitted_at = case
        when coalesce(p_requested, false) then coalesce(
          app.own_schedule_request_submitted_at,
          timezone('utc', now())
        )
        else null
      end,
      own_schedule_request_decided_at = null
  where app.id = v_application_id;

  return query
  select *
  from public.get_admission_own_schedule_request(p_tracking_number);
end;
$$;

create or replace function public.review_admission_own_schedule_request(
  p_tracking_number text,
  p_status text
)
returns table (
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_request_submitted_at timestamptz,
  own_schedule_request_decided_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id uuid;
  v_status text;
begin
  v_status := initcap(lower(trim(coalesce(p_status, ''))));

  if v_status not in ('Approved', 'Rejected') then
    raise exception 'Own schedule request status must be Approved or Rejected.';
  end if;

  select app.id
  into v_application_id
  from public.admission_applications app
  where app.tracking_number = upper(trim(p_tracking_number))
    and app.requested_own_schedule
  limit 1;

  if v_application_id is null then
    raise exception 'No own schedule request was found for tracking number "%".', p_tracking_number;
  end if;

  update public.admission_applications app
  set own_schedule_request_status = v_status,
      own_schedule_request_decided_at = timezone('utc', now())
  where app.id = v_application_id;

  return query
  select *
  from public.get_admission_own_schedule_request(p_tracking_number);
end;
$$;

drop function if exists public.get_admin_admission_queue(text);

create function public.get_admin_admission_queue(
  p_branch_code text default null
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
  year_completion integer,
  applied_for_scholarship boolean,
  scholarship_exam_score numeric,
  effective_discount_percentage numeric,
  effective_discount_source text,
  requirements_uploaded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  requirement_files jsonb,
  student_number text,
  portal_account_registered boolean,
  requested_own_schedule boolean,
  own_schedule_request_status text,
  own_schedule_request_submitted_at timestamptz,
  own_schedule_request_decided_at timestamptz
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
    app.year_completion,
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
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirement_code', requirement.code,
          'requirement_name', requirement.name,
          'file_name', file.original_file_name,
          'storage_bucket', file.storage_bucket,
          'storage_path', file.storage_path,
          'mime_type', file.mime_type,
          'uploaded_at', file.uploaded_at
        )
        order by requirement.sort_order
      ) filter (where file.id is not null),
      '[]'::jsonb
    ) as requirement_files,
    student.student_number,
    (account.student_id is not null and account.status = 'active') as portal_account_registered,
    app.requested_own_schedule,
    app.own_schedule_request_status,
    app.own_schedule_request_submitted_at,
    app.own_schedule_request_decided_at
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
  left join public.admission_application_requirement_files file
    on file.application_id = app.id
  left join public.admission_requirement_types requirement
    on requirement.id = file.requirement_type_id
  left join public.student_profiles student
    on student.admission_application_id = app.id
  left join public.student_portal_accounts account
    on account.student_id = student.id
  where app.application_status not in ('draft', 'cancelled')
    and (
      p_branch_code is null
      or branch.code = lower(trim(p_branch_code))
    )
  group by
    app.id,
    app.tracking_number,
    app.requested_year_level,
    branch.code,
    branch.name,
    status.label,
    program.name,
    program.level,
    track.name,
    honor.label,
    honor.tuition_discount_percent,
    app.application_status,
    app.rejection_reason,
    app.current_step,
    app.first_name,
    app.last_name,
    app.middle_name,
    app.sex,
    app.civil_status,
    app.address,
    app.email,
    app.phone_number,
    app.year_completion,
    app.applied_for_scholarship,
    app.scholarship_exam_score,
    app.requirements_uploaded_at,
    app.submitted_at,
    app.created_at,
    app.updated_at,
    student.student_number,
    account.student_id,
    account.status,
    app.requested_own_schedule,
    app.own_schedule_request_status,
    app.own_schedule_request_submitted_at,
    app.own_schedule_request_decided_at
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

grant execute on function public.get_admission_own_schedule_request(text)
  to anon, authenticated;
grant execute on function public.set_admission_own_schedule_request(text, boolean)
  to anon, authenticated;
grant execute on function public.review_admission_own_schedule_request(text, text)
  to anon, authenticated;
grant execute on function public.get_admin_admission_queue(text)
  to anon, authenticated;
