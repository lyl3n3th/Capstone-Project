-- Keep each receipt attached to the academic period it pays for.
-- Existing receipts remain unassigned because their original term cannot be
-- recovered safely from the stored payment data.
alter table public.student_payments
  add column academic_year text,
  add column semester text;

alter table public.student_payments
  add constraint student_payments_academic_term_check
  check (
    (academic_year is null and semester is null)
    or (
      academic_year is not null
      and semester is not null
      and academic_year ~ '^[0-9]{4}-[0-9]{4}$'
      and semester in ('1st Semester', '2nd Semester', 'Summer')
    )
  );

create index student_payments_academic_term_idx
  on public.student_payments (branch_id, student_number, academic_year, semester, paid_at desc);

drop function public.list_student_payments(text);

create function public.list_student_payments(p_branch text)
returns table (
  id uuid,
  branch text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  amount numeric,
  receipt_number text,
  paid_at timestamptz,
  encoded_by text,
  encoded_role text,
  notes text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    payment.id,
    branch.name,
    payment.student_number,
    payment.tracking_number,
    payment.academic_year,
    payment.semester,
    payment.amount,
    payment.receipt_number,
    payment.paid_at,
    payment.encoded_by,
    payment.encoded_role,
    payment.notes,
    payment.created_at
  from public.student_payments payment
  join public.resolve_staff_branch(p_branch) resolved
    on resolved.branch_id = payment.branch_id
  join public.admission_branches branch on branch.id = payment.branch_id
  order by payment.paid_at desc, payment.created_at desc;
$$;

drop function public.create_student_payment(text, text, text, numeric, timestamptz, text, text, text);

create function public.create_student_payment(
  p_branch text,
  p_student_number text,
  p_tracking_number text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_encoded_by text,
  p_academic_year text default null,
  p_semester text default null,
  p_encoded_role text default null,
  p_notes text default null
)
returns table (
  id uuid,
  branch text,
  student_number text,
  tracking_number text,
  academic_year text,
  semester text,
  amount numeric,
  receipt_number text,
  paid_at timestamptz,
  encoded_by text,
  encoded_role text,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_receipt_number text;
  v_payment public.student_payments%rowtype;
begin
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if trim(coalesce(p_student_number, '')) = '' then
    raise exception 'Student number is required.';
  end if;

  if trim(coalesce(p_encoded_by, '')) = '' then
    raise exception 'Payment encoder is required.';
  end if;

  if (nullif(trim(coalesce(p_academic_year, '')), '') is null)
    <> (nullif(trim(coalesce(p_semester, '')), '') is null) then
    raise exception 'Academic year and semester must both be provided.';
  end if;

  if nullif(trim(coalesce(p_academic_year, '')), '') is not null then
    if trim(p_academic_year) !~ '^[0-9]{4}-[0-9]{4}$' then
      raise exception 'Academic year must use the YYYY-YYYY format.';
    end if;

    if split_part(trim(p_academic_year), '-', 2)::integer <>
      split_part(trim(p_academic_year), '-', 1)::integer + 1 then
      raise exception 'Academic year must use consecutive years.';
    end if;

    if trim(coalesce(p_semester, '')) not in ('1st Semester', '2nd Semester', 'Summer') then
      raise exception 'Choose a valid semester.';
    end if;
  end if;

  select resolved.branch_id, branch.name
  into v_branch_id, v_branch_name
  from public.resolve_staff_branch(p_branch) resolved
  join public.admission_branches branch on branch.id = resolved.branch_id
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  if not exists (
    select 1
    from public.student_profiles student
    where student.branch_id = v_branch_id
      and upper(student.student_number) = upper(trim(p_student_number))
  ) then
    raise exception 'No student record was found for student number "%".', p_student_number;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_branch_id::text));
  v_receipt_number := public.next_student_payment_receipt_number(v_branch_name);

  insert into public.student_payments (
    branch_id,
    student_number,
    tracking_number,
    academic_year,
    semester,
    amount,
    receipt_number,
    paid_at,
    encoded_by,
    encoded_role,
    notes
  )
  values (
    v_branch_id,
    upper(trim(p_student_number)),
    nullif(trim(coalesce(p_tracking_number, '')), ''),
    nullif(trim(coalesce(p_academic_year, '')), ''),
    nullif(trim(coalesce(p_semester, '')), ''),
    round(p_amount, 2),
    v_receipt_number,
    coalesce(p_paid_at, timezone('utc', now())),
    trim(p_encoded_by),
    nullif(trim(coalesce(p_encoded_role, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_payment;

  return query
  select
    v_payment.id,
    v_branch_name,
    v_payment.student_number,
    v_payment.tracking_number,
    v_payment.academic_year,
    v_payment.semester,
    v_payment.amount,
    v_payment.receipt_number,
    v_payment.paid_at,
    v_payment.encoded_by,
    v_payment.encoded_role,
    v_payment.notes,
    v_payment.created_at;
end;
$$;

grant execute on function public.list_student_payments(text) to anon, authenticated;
grant execute on function public.create_student_payment(text, text, text, numeric, timestamptz, text, text, text, text, text) to anon, authenticated;

create function public.set_student_payment_term(
  p_branch text,
  p_payment_id uuid,
  p_academic_year text,
  p_semester text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  if trim(coalesce(p_academic_year, '')) !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Academic year must use the YYYY-YYYY format.';
  end if;

  if split_part(trim(p_academic_year), '-', 2)::integer <>
    split_part(trim(p_academic_year), '-', 1)::integer + 1 then
    raise exception 'Academic year must use consecutive years.';
  end if;

  if trim(coalesce(p_semester, '')) not in ('1st Semester', '2nd Semester', 'Summer') then
    raise exception 'Choose a valid semester.';
  end if;

  select resolved.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) resolved
  limit 1;

  update public.student_payments payment
  set academic_year = trim(p_academic_year),
      semester = trim(p_semester)
  where payment.id = p_payment_id
    and payment.branch_id = v_branch_id;

  if not found then
    raise exception 'Payment receipt was not found.';
  end if;
end;
$$;

grant execute on function public.set_student_payment_term(text, uuid, text, text) to anon, authenticated;
