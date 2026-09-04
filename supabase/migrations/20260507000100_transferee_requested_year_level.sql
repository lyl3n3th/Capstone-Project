alter table public.admission_applications
  add column if not exists requested_year_level text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admission_applications_requested_year_level_check'
      and conrelid = 'public.admission_applications'::regclass
  ) then
    alter table public.admission_applications
      add constraint admission_applications_requested_year_level_check
      check (
        requested_year_level is null
        or requested_year_level in (
          'Grade 11',
          'Grade 12',
          '1st Year',
          '2nd Year',
          '3rd Year',
          '4th Year'
        )
      );
  end if;
end;
$$;

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

drop function if exists public.upsert_admission_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  boolean,
  smallint,
  text
);

create or replace function public.upsert_admission_application(
  p_tracking_number text,
  p_branch_code text,
  p_student_status_label text,
  p_program_name text,
  p_track_name text,
  p_requested_year_level text default null,
  p_first_name text default '',
  p_last_name text default '',
  p_middle_name text default null,
  p_sex text default 'Male',
  p_civil_status text default 'Single',
  p_address text default '',
  p_email text default '',
  p_phone_number text default '',
  p_last_school_attended text default '',
  p_year_completion integer default null,
  p_honor_label text default 'No Honor',
  p_apply_scholarship boolean default false,
  p_current_step smallint default 2,
  p_application_status text default 'draft'
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
  v_branch_id uuid;
  v_student_status_id uuid;
  v_program_offering_id uuid;
  v_program_id uuid;
  v_track_id uuid;
  v_honor_id uuid;
  v_duplicate_tracking text;
  v_requested_year_level text;
begin
  v_requested_year_level := nullif(trim(coalesce(p_requested_year_level, '')), '');

  select id
  into v_branch_id
  from public.admission_branches
  where code = lower(trim(p_branch_code))
    and is_active
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch_code;
  end if;

  select id
  into v_student_status_id
  from public.admission_student_statuses
  where label = trim(p_student_status_label)
    and is_active
  limit 1;

  if v_student_status_id is null then
    raise exception 'Student status "%" is not configured in Supabase.', p_student_status_label;
  end if;

  select offering.id, program.id
  into v_program_offering_id, v_program_id
  from public.program_offerings offering
  join public.academic_programs program
    on program.id = offering.program_id
  where offering.branch_id = v_branch_id
    and program.name = trim(p_program_name)
    and offering.is_active
    and program.is_active
  limit 1;

  if v_program_offering_id is null then
    raise exception 'Program "%" is not offered in branch "%".', p_program_name, p_branch_code;
  end if;

  select id
  into v_track_id
  from public.program_tracks
  where program_id = v_program_id
    and name = trim(p_track_name)
    and is_active
  limit 1;

  if v_track_id is null then
    raise exception 'Track "%" is not configured for program "%".', p_track_name, p_program_name;
  end if;

  if coalesce(nullif(trim(p_honor_label), ''), 'No Honor') <> 'No Honor' then
    select id
    into v_honor_id
    from public.admission_honors
    where label = trim(p_honor_label)
      and is_active
    limit 1;

    if v_honor_id is null then
      raise exception 'Honor "%" is not configured in Supabase.', p_honor_label;
    end if;
  else
    v_honor_id := null;
  end if;

  select app.tracking_number
  into v_duplicate_tracking
  from public.admission_applications app
  where app.tracking_number <> coalesce(upper(trim(p_tracking_number)), '')
    and app.application_status <> 'cancelled'
    and (
      app.email = trim(lower(p_email))::citext
      or app.phone_number = regexp_replace(trim(p_phone_number), '\D', '', 'g')
    )
  order by app.updated_at desc
  limit 1;

  if v_duplicate_tracking is not null then
    raise exception using
      message = format(
        'A matching application already exists for this email or phone number. Existing tracking number: %s',
        v_duplicate_tracking
      ),
      errcode = 'P0001';
  end if;

  if p_tracking_number is null or trim(p_tracking_number) = '' then
    v_tracking_number := public.generate_aics_tracking_number();
  else
    v_tracking_number := upper(trim(p_tracking_number));
  end if;

  if v_tracking_number is null or v_tracking_number = '' then
    raise exception 'Tracking number generation failed.';
  end if;

  update public.admission_applications as app
  set branch_id = v_branch_id,
      student_status_id = v_student_status_id,
      program_offering_id = v_program_offering_id,
      track_id = v_track_id,
      honor_id = v_honor_id,
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      middle_name = nullif(trim(p_middle_name), ''),
      sex = trim(p_sex),
      civil_status = trim(p_civil_status),
      address = trim(p_address),
      email = trim(lower(p_email))::citext,
      phone_number = regexp_replace(trim(p_phone_number), '\D', '', 'g'),
      last_school_attended = trim(p_last_school_attended),
      year_completion = p_year_completion,
      requested_year_level = v_requested_year_level,
      applied_for_scholarship = p_apply_scholarship,
      current_step = greatest(app.current_step, p_current_step),
      application_status = p_application_status
  where app.tracking_number = v_tracking_number
  returning app.tracking_number into v_tracking_number;

  if not found then
    insert into public.admission_applications (
      tracking_number,
      branch_id,
      student_status_id,
      program_offering_id,
      track_id,
      honor_id,
      first_name,
      last_name,
      middle_name,
      sex,
      civil_status,
      address,
      email,
      phone_number,
      last_school_attended,
      year_completion,
      requested_year_level,
      applied_for_scholarship,
      current_step,
      application_status
    )
    values (
      coalesce(v_tracking_number, public.generate_aics_tracking_number()),
      v_branch_id,
      v_student_status_id,
      v_program_offering_id,
      v_track_id,
      v_honor_id,
      trim(p_first_name),
      trim(p_last_name),
      nullif(trim(p_middle_name), ''),
      trim(p_sex),
      trim(p_civil_status),
      trim(p_address),
      trim(lower(p_email))::citext,
      regexp_replace(trim(p_phone_number), '\D', '', 'g'),
      trim(p_last_school_attended),
      p_year_completion,
      v_requested_year_level,
      p_apply_scholarship,
      p_current_step,
      p_application_status
    )
    returning public.admission_applications.tracking_number into v_tracking_number;
  end if;

  return query
  select *
  from public.get_admission_progress(v_tracking_number);
end;
$$;

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

drop function if exists public.get_admin_admission_queue(text);

create or replace function public.get_admin_admission_queue(
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
  portal_account_registered boolean
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
    (account.student_id is not null and account.status = 'active') as portal_account_registered
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
  where app.application_status <> 'cancelled'
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
    account.status
  order by coalesce(app.submitted_at, app.updated_at) desc;
$$;

grant execute on function public.get_admission_progress(text) to anon, authenticated;
grant execute on function public.upsert_admission_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  boolean,
  smallint,
  text
) to anon, authenticated;
grant execute on function public.update_admission_progress(
  text,
  smallint,
  text,
  boolean,
  numeric,
  text
) to anon, authenticated;
grant execute on function public.get_admin_admission_queue(text) to anon, authenticated;
