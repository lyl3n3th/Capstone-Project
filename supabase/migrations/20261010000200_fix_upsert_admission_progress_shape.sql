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
