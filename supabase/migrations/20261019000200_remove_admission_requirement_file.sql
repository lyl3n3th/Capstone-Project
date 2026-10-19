begin;

create or replace function public.remove_admission_requirement_file(
  p_branch text,
  p_tracking_number text,
  p_requirement_code text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_application_id uuid;
  v_requirement_type_id uuid;
begin
  if trim(coalesce(p_branch, '')) = ''
    or trim(coalesce(p_tracking_number, '')) = ''
    or trim(coalesce(p_requirement_code, '')) = '' then
    raise exception 'Branch, tracking number, and credential code are required.';
  end if;

  select app.id into v_application_id
  from public.admission_applications app
  join public.program_offerings offering on offering.id = app.program_offering_id
  join public.admission_branches branch on branch.id = offering.branch_id
  where app.tracking_number = upper(trim(p_tracking_number))
    and (lower(branch.code) = lower(trim(p_branch)) or lower(branch.name) = lower(trim(p_branch)))
  for update of app;

  if v_application_id is null then
    raise exception 'The admission record was not found in this branch.';
  end if;

  select requirement.id into v_requirement_type_id
  from public.admission_requirement_types requirement
  where requirement.code = trim(p_requirement_code);
  if v_requirement_type_id is null then
    raise exception 'The credential type was not found.';
  end if;

  -- Removing the reference also removes it from progress and admission queue results.
  -- Repeating the request is safe if another staff member already removed it.
  delete from public.admission_application_requirement_files
  where application_id = v_application_id and requirement_type_id = v_requirement_type_id;

  update public.admission_applications app
  set requirements_uploaded_at = (
    select max(file.uploaded_at)
    from public.admission_application_requirement_files file
    where file.application_id = v_application_id
  )
  where app.id = v_application_id;
end;
$$;

revoke all on function public.remove_admission_requirement_file(text, text, text) from public;
grant execute on function public.remove_admission_requirement_file(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
