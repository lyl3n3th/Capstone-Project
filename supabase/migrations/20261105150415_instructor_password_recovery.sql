-- Public recovery uses the same branch/email/mobile checks as staff recovery.
-- Definer access is needed before login; table access stays behind this function.
create or replace function public.reset_instructor_account_password(
  p_branch text,
  p_email text,
  p_contact_number text,
  p_new_password text
)
returns table (branch text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_employee_id text;
  v_match_count bigint;
begin
  if trim(coalesce(p_branch, '')) = ''
    or trim(coalesce(p_email, '')) = ''
    or regexp_replace(coalesce(p_contact_number, ''), '\D', '', 'g') = '' then
    raise exception 'Branch, email, and mobile number are required.';
  end if;

  if char_length(trim(coalesce(p_new_password, ''))) < 8 then
    raise exception 'Password must be at least 8 characters long.';
  end if;

  select resolved.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) resolved;

  select count(*), min(upper(trim(instructor.employee_id)))
  into v_match_count, v_employee_id
  from public.branch_academic_instructors instructor
  where instructor.branch_id = v_branch_id
    and instructor.is_active
    and lower(trim(instructor.email::text)) = lower(trim(p_email))
    and regexp_replace(trim(instructor.contact_number), '\D', '', 'g')
      = regexp_replace(p_contact_number, '\D', '', 'g');

  if v_match_count <> 1 or coalesce(v_employee_id, '') = '' then
    raise exception 'The recovery details do not match a unique active instructor account for this branch.';
  end if;

  insert into public.branch_instructor_passwords (
    branch_id, employee_id, password_hash, password_change_required, updated_at
  ) values (
    v_branch_id, v_employee_id,
    extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
    false, timezone('utc', now())
  )
  on conflict (branch_id, employee_id) do update
  set password_hash = excluded.password_hash,
      password_change_required = false,
      updated_at = excluded.updated_at;

  return query select directory.name
  from public.admission_branches directory where directory.id = v_branch_id;
end;
$$;

revoke all on function public.reset_instructor_account_password(text, text, text, text) from public;
grant execute on function public.reset_instructor_account_password(text, text, text, text) to anon, authenticated;
