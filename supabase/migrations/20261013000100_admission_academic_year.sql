alter table public.admission_portal_statuses
  add column if not exists academic_year text not null default '';

update public.admission_portal_statuses
set academic_year = case
  when extract(month from current_date)::integer >= 6 then
    format(
      '%s-%s',
      extract(year from current_date)::integer,
      extract(year from current_date)::integer + 1
    )
  else
    format(
      '%s-%s',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer
    )
end
where nullif(trim(academic_year), '') is null;

alter table public.admission_applications
  add column if not exists academic_year text not null default '';

drop function if exists public.list_admission_portal_statuses();
drop function if exists public.upsert_admission_portal_status(text, boolean, text);
drop function if exists public.upsert_admission_portal_status(text, boolean, text, text);

create function public.list_admission_portal_statuses()
returns table (
  branch text,
  is_open boolean,
  close_on_date text,
  academic_year text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    branch.name,
    coalesce(status.is_open, true),
    coalesce(status.close_on_date, ''),
    coalesce(
      nullif(trim(status.academic_year), ''),
      case
        when extract(month from current_date)::integer >= 6 then
          format(
            '%s-%s',
            extract(year from current_date)::integer,
            extract(year from current_date)::integer + 1
          )
        else
          format(
            '%s-%s',
            extract(year from current_date)::integer - 1,
            extract(year from current_date)::integer
          )
      end
    ),
    coalesce(status.updated_at, timezone('utc', now()))
  from public.admission_branches branch
  left join public.admission_portal_statuses status
    on status.branch_id = branch.id
  where branch.is_active
  order by branch.name;
$$;

create function public.upsert_admission_portal_status(
  p_branch text,
  p_is_open boolean,
  p_close_on_date text,
  p_academic_year text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_academic_year text;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_academic_year := nullif(trim(coalesce(p_academic_year, '')), '');

  if v_academic_year is null then
    v_academic_year := case
      when extract(month from current_date)::integer >= 6 then
        format(
          '%s-%s',
          extract(year from current_date)::integer,
          extract(year from current_date)::integer + 1
        )
      else
        format(
          '%s-%s',
          extract(year from current_date)::integer - 1,
          extract(year from current_date)::integer
        )
    end;
  end if;

  if v_academic_year !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Academic year must use the YYYY-YYYY format.';
  end if;

  if split_part(v_academic_year, '-', 2)::integer <>
    split_part(v_academic_year, '-', 1)::integer + 1 then
    raise exception 'Academic year must use the YYYY-YYYY format.';
  end if;

  insert into public.admission_portal_statuses (
    branch_id,
    is_open,
    close_on_date,
    academic_year,
    updated_at
  )
  values (
    v_branch_id,
    p_is_open,
    coalesce(p_close_on_date, ''),
    v_academic_year,
    timezone('utc', now())
  )
  on conflict (branch_id) do update
  set is_open = excluded.is_open,
      close_on_date = excluded.close_on_date,
      academic_year = excluded.academic_year,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.list_admission_portal_statuses() to anon, authenticated;
grant execute on function public.upsert_admission_portal_status(text, boolean, text, text)
  to anon, authenticated;

drop function if exists public.upsert_admission_application(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, integer, text, boolean, smallint, text
);

drop function if exists public.upsert_admission_application(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, integer, text, boolean, smallint, text
);

drop function if exists public.update_admission_progress(
  text, smallint, text, boolean, numeric, text
);

drop function if exists public.get_admission_progress(text);

create function public.get_admission_progress(
  p_tracking_number text
)
returns table (
  application_id uuid,
  tracking_number text,
  branch_code text,
  branch_name text,
  academic_year text,
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
    nullif(trim(app.academic_year), '') as academic_year,
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

create function public.upsert_admission_application(
  p_tracking_number text,
  p_branch_code text,
  p_academic_year text default null,
  p_student_status_label text default '',
  p_program_name text default '',
  p_track_name text default '',
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
  academic_year text,
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
  v_academic_year text;
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

  select nullif(trim(coalesce(status.academic_year, '')), '')
  into v_academic_year
  from public.admission_portal_statuses status
  where status.branch_id = v_branch_id;

  v_academic_year := coalesce(
    v_academic_year,
    nullif(trim(coalesce(p_academic_year, '')), '')
  );

  if v_academic_year is null then
    v_academic_year := case
      when extract(month from current_date)::integer >= 6 then
        format(
          '%s-%s',
          extract(year from current_date)::integer,
          extract(year from current_date)::integer + 1
        )
      else
        format(
          '%s-%s',
          extract(year from current_date)::integer - 1,
          extract(year from current_date)::integer
        )
    end;
  end if;

  if v_academic_year !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Academic year must use the YYYY-YYYY format.';
  end if;

  if split_part(v_academic_year, '-', 2)::integer <>
    split_part(v_academic_year, '-', 1)::integer + 1 then
    raise exception 'Academic year must use the YYYY-YYYY format.';
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
      academic_year = coalesce(nullif(trim(app.academic_year), ''), v_academic_year),
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
      academic_year,
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
      v_academic_year,
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

create function public.update_admission_progress(
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
  academic_year text,
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
grant execute on function public.upsert_admission_application(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, integer, text, boolean, smallint, text
) to anon, authenticated;
grant execute on function public.update_admission_progress(
  text, smallint, text, boolean, numeric, text
) to anon, authenticated;
