begin;

-- Keep a branch's prefix stable even if its display name changes later.
alter table public.admission_branches
  add column if not exists student_number_prefix text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admission_branches_student_number_prefix_format'
      and conrelid = 'public.admission_branches'::regclass
  ) then
    alter table public.admission_branches
      add constraint admission_branches_student_number_prefix_format
      check (student_number_prefix is null or student_number_prefix ~ '^[A-Z]{3}$');
  end if;
end;
$$;

create or replace function public.derive_branch_student_number_prefix(
  p_branch_name text,
  p_branch_code text
)
returns text
language sql
immutable
set search_path = public
as $$
  select rpad(
    left(
      coalesce(
        nullif(regexp_replace(upper(trim(coalesce(p_branch_name, ''))), '[^A-Z]', '', 'g'), ''),
        nullif(regexp_replace(upper(trim(coalesce(p_branch_code, ''))), '[^A-Z]', '', 'g'), ''),
        'STD'
      ),
      3
    ),
    3,
    'X'
  );
$$;

create or replace function public.allocate_branch_student_number_prefix(
  p_branch_name text,
  p_branch_code text
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_first integer;
  v_second integer;
begin
  v_base := public.derive_branch_student_number_prefix(p_branch_name, p_branch_code);

  if not exists (
    select 1
    from public.admission_branches branch
    where branch.student_number_prefix = v_base
      and branch.code <> lower(trim(coalesce(p_branch_code, '')))
  ) then
    return v_base;
  end if;

  for v_first in 0..25 loop
    v_candidate := left(v_base, 2) || chr(ascii('A') + v_first);

    if not exists (
      select 1
      from public.admission_branches branch
      where branch.student_number_prefix = v_candidate
        and branch.code <> lower(trim(coalesce(p_branch_code, '')))
    ) then
      return v_candidate;
    end if;
  end loop;

  for v_first in 0..25 loop
    for v_second in 0..25 loop
      v_candidate := left(v_base, 1) || chr(ascii('A') + v_first) || chr(ascii('A') + v_second);

      if not exists (
        select 1
        from public.admission_branches branch
        where branch.student_number_prefix = v_candidate
          and branch.code <> lower(trim(coalesce(p_branch_code, '')))
      ) then
        return v_candidate;
      end if;
    end loop;
  end loop;

  raise exception 'No unique 3-letter student-number prefix is available for branch "%".', p_branch_name;
end;
$$;

do $$
declare
  v_branch record;
  v_prefix text;
begin
  for v_branch in
    select branch.id, branch.code, branch.name
    from public.admission_branches branch
    where nullif(trim(coalesce(branch.student_number_prefix, '')), '') is null
    order by
      case lower(branch.code)
        when 'bacoor' then 0
        when 'taytay' then 1
        when 'gma' then 2
        else 3
      end,
      branch.name
  loop
    v_prefix := case lower(v_branch.code)
      when 'bacoor' then 'BAC'
      when 'taytay' then 'TAY'
      when 'gma' then 'GMA'
      else public.allocate_branch_student_number_prefix(v_branch.name, v_branch.code)
    end;

    update public.admission_branches
    set student_number_prefix = v_prefix
    where id = v_branch.id;
  end loop;
end;
$$;

create unique index if not exists admission_branches_student_number_prefix_key
  on public.admission_branches (student_number_prefix)
  where student_number_prefix is not null;

create or replace function public.resolve_student_number_prefix(
  p_branch_id uuid
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(branch.student_number_prefix, ''),
    public.derive_branch_student_number_prefix(branch.name, branch.code)
  )
  from public.admission_branches branch
  where branch.id = p_branch_id
  limit 1;
$$;

create or replace function public.upsert_area_manager_branch(
  p_code text,
  p_name text
)
returns table (code text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text := trim(coalesce(p_name, ''));
  v_student_number_prefix text;
begin
  if v_name = '' then
    raise exception 'Branch name is required.';
  end if;

  v_code := lower(trim(coalesce(nullif(trim(p_code), ''), v_name)));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '_', 'g');
  v_code := regexp_replace(v_code, '^_+|_+$', '', 'g');

  if v_code = '' then
    raise exception 'Branch code could not be generated.';
  end if;

  select branch.student_number_prefix
  into v_student_number_prefix
  from public.admission_branches branch
  where branch.code = v_code;

  if v_student_number_prefix is null then
    v_student_number_prefix := public.allocate_branch_student_number_prefix(
      v_name,
      v_code
    );
  end if;

  insert into public.admission_branches (
    code,
    name,
    student_number_prefix,
    is_active
  )
  values (v_code, v_name, v_student_number_prefix, true)
  on conflict on constraint admission_branches_code_key do update
  set name = excluded.name,
      student_number_prefix = coalesce(
        public.admission_branches.student_number_prefix,
        excluded.student_number_prefix
      ),
      is_active = true;

  return query
  select branch.code, branch.name
  from public.admission_branches branch
  where branch.code = v_code;
end;
$$;

revoke all on function public.derive_branch_student_number_prefix(text, text) from public;
revoke all on function public.allocate_branch_student_number_prefix(text, text) from public;
revoke all on function public.resolve_student_number_prefix(uuid) from public;
revoke all on function public.upsert_area_manager_branch(text, text) from public;
grant execute on function public.upsert_area_manager_branch(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
