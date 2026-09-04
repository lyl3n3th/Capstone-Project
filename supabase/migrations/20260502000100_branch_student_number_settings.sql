create table if not exists public.branch_student_number_settings (
  branch_id uuid primary key references public.admission_branches(id) on delete cascade,
  next_sequence bigint not null default 261001,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_student_number_settings_next_sequence_check
    check (next_sequence between 0 and 1000000)
);

create or replace function public.get_default_branch_student_number_sequence(
  p_branch_id uuid
)
returns bigint
language sql
stable
set search_path = public
as $$
  select least(
    1000000,
    greatest(
      coalesce(
        max(public.extract_student_number_sequence(student.student_number)),
        261000
      ),
      261000
    ) + 1
  )
  from public.student_profiles student
  where p_branch_id is null
    or student.branch_id = p_branch_id;
$$;

create or replace function public.ensure_branch_student_number_setting(
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_student_number_settings (
    branch_id,
    next_sequence,
    updated_at
  )
  values (
    p_branch_id,
    public.get_default_branch_student_number_sequence(p_branch_id),
    timezone('utc', now())
  )
  on conflict (branch_id) do nothing;
end;
$$;

create or replace function public.peek_branch_student_number(
  p_branch_id uuid,
  p_start_sequence bigint default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_sequence bigint;
  v_branch_prefix text;
  v_student_number text;
begin
  perform public.ensure_branch_student_number_setting(p_branch_id);

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

  if p_start_sequence is null then
    select setting.next_sequence
    into v_candidate_sequence
    from public.branch_student_number_settings setting
    where setting.branch_id = p_branch_id;
  else
    v_candidate_sequence := p_start_sequence;
  end if;

  loop
    if v_candidate_sequence > 999999 then
      return '';
    end if;

    if coalesce(v_branch_prefix, '') = '' then
      v_student_number := lpad(v_candidate_sequence::text, 6, '0');
    else
      v_student_number := format(
        '%s-%s',
        v_branch_prefix,
        lpad(v_candidate_sequence::text, 6, '0')
      );
    end if;

    if not exists (
      select 1
      from public.student_profiles student
      where student.branch_id = p_branch_id
        and upper(student.student_number) = upper(v_student_number)
    ) then
      return v_student_number;
    end if;

    v_candidate_sequence := v_candidate_sequence + 1;
  end loop;
end;
$$;

create or replace function public.get_branch_student_number_setting(
  p_branch text
)
returns table (
  branch text,
  prefix text,
  next_sequence bigint,
  next_digits text,
  next_student_number text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_prefix text;
begin
  select resolved.branch_id, resolved.branch_name
  into v_branch_id, v_branch_name
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  perform public.ensure_branch_student_number_setting(v_branch_id);

  v_prefix := public.resolve_student_number_prefix(v_branch_id);

  return query
  select
    v_branch_name,
    coalesce(v_prefix, ''),
    setting.next_sequence,
    case
      when setting.next_sequence > 999999 then ''
      else lpad(setting.next_sequence::text, 6, '0')
    end,
    public.peek_branch_student_number(v_branch_id, setting.next_sequence),
    setting.updated_at
  from public.branch_student_number_settings setting
  where setting.branch_id = v_branch_id;
end;
$$;

create or replace function public.set_branch_student_number_setting(
  p_branch text,
  p_next_digits text
)
returns table (
  branch text,
  prefix text,
  next_sequence bigint,
  next_digits text,
  next_student_number text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_next_digits text;
  v_next_sequence bigint;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_next_digits := regexp_replace(trim(coalesce(p_next_digits, '')), '\D', '', 'g');

  if v_next_digits !~ '^[0-9]{6}$' then
    raise exception 'Student number start must be exactly 6 digits.';
  end if;

  v_next_sequence := v_next_digits::bigint;

  insert into public.branch_student_number_settings (
    branch_id,
    next_sequence,
    updated_at
  )
  values (
    v_branch_id,
    v_next_sequence,
    timezone('utc', now())
  )
  on conflict (branch_id) do update
  set next_sequence = excluded.next_sequence,
      updated_at = excluded.updated_at;

  return query
  select *
  from public.get_branch_student_number_setting(p_branch);
end;
$$;

create or replace function public.generate_student_number(
  p_branch_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_sequence bigint;
  v_branch_prefix text;
  v_student_number text;
begin
  perform pg_advisory_xact_lock(2610, coalesce(hashtext(p_branch_id::text), 0));
  perform public.ensure_branch_student_number_setting(p_branch_id);

  v_branch_prefix := public.resolve_student_number_prefix(p_branch_id);

  select setting.next_sequence
  into v_candidate_sequence
  from public.branch_student_number_settings setting
  where setting.branch_id = p_branch_id
  for update;

  loop
    if v_candidate_sequence > 999999 then
      raise exception 'No student numbers are available for this branch. Please set a new 6-digit start value.';
    end if;

    if coalesce(v_branch_prefix, '') = '' then
      v_student_number := lpad(v_candidate_sequence::text, 6, '0');
    else
      v_student_number := format(
        '%s-%s',
        v_branch_prefix,
        lpad(v_candidate_sequence::text, 6, '0')
      );
    end if;

    exit when not exists (
      select 1
      from public.student_profiles student
      where student.branch_id = p_branch_id
        and upper(student.student_number) = upper(v_student_number)
    );

    v_candidate_sequence := v_candidate_sequence + 1;
  end loop;

  update public.branch_student_number_settings setting
  set next_sequence = v_candidate_sequence + 1,
      updated_at = timezone('utc', now())
  where setting.branch_id = p_branch_id;

  return v_student_number;
end;
$$;

create or replace function public.get_next_admin_student_number(
  p_branch text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_student_number text;
begin
  select resolved.branch_id
  into v_branch_id
  from public.resolve_student_branch(p_branch) as resolved;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  v_student_number := public.peek_branch_student_number(v_branch_id);

  if trim(coalesce(v_student_number, '')) = '' then
    raise exception 'No student numbers are available for this branch. Please set a new 6-digit start value.';
  end if;

  return v_student_number;
end;
$$;

grant execute on function public.get_default_branch_student_number_sequence(uuid) to anon, authenticated;
grant execute on function public.ensure_branch_student_number_setting(uuid) to anon, authenticated;
grant execute on function public.peek_branch_student_number(uuid, bigint) to anon, authenticated;
grant execute on function public.get_branch_student_number_setting(text) to anon, authenticated;
grant execute on function public.set_branch_student_number_setting(text, text) to anon, authenticated;
grant execute on function public.generate_student_number(uuid) to anon, authenticated;
grant execute on function public.get_next_admin_student_number(text) to anon, authenticated;

notify pgrst, 'reload schema';
