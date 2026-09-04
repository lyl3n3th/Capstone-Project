create extension if not exists pgcrypto;

create table if not exists public.student_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.admission_branches(id) on delete restrict,
  student_number text not null,
  tracking_number text,
  amount numeric(12, 2) not null check (amount > 0),
  receipt_number text not null,
  paid_at timestamptz not null,
  encoded_by text not null,
  encoded_role text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (branch_id, receipt_number)
);

create index if not exists student_payments_student_idx
  on public.student_payments (branch_id, student_number, paid_at desc);

alter table public.student_payments enable row level security;
revoke all on public.student_payments from anon, authenticated;

insert into public.student_payments (
  branch_id,
  student_number,
  tracking_number,
  amount,
  receipt_number,
  paid_at,
  encoded_by,
  encoded_role,
  notes,
  created_at
)
select
  record.branch_id,
  upper(trim(payment->>'studentNumber')),
  nullif(trim(coalesce(payment->>'trackingNumber', '')), ''),
  (payment->>'amount')::numeric,
  trim(payment->>'receiptNumber'),
  (payment->>'paidAt')::timestamptz,
  trim(payment->>'encodedBy'),
  nullif(trim(coalesce(payment->>'encodedRole', '')), ''),
  nullif(trim(coalesce(payment->>'notes', '')), ''),
  coalesce(
    nullif(trim(coalesce(payment->>'createdAt', '')), '')::timestamptz,
    timezone('utc', now())
  )
from public.branch_local_storage_records record
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(record.payload) = 'array' then record.payload
    else '[]'::jsonb
  end
) payment
where record.scope = 'student-payments'
  and jsonb_typeof(record.payload) = 'array'
  and trim(coalesce(payment->>'studentNumber', '')) <> ''
  and trim(coalesce(payment->>'receiptNumber', '')) <> ''
  and trim(coalesce(payment->>'encodedBy', '')) <> ''
  and coalesce(payment->>'amount', '') ~ '^\\d+(\\.\\d+)?$'
  and (payment->>'amount')::numeric > 0
on conflict (branch_id, receipt_number) do nothing;

create or replace function public.list_student_payments(p_branch text)
returns table (
  id uuid,
  branch text,
  student_number text,
  tracking_number text,
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

create or replace function public.next_student_payment_receipt_number(p_branch text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_prefix text;
  v_next_number integer := 1;
begin
  select resolved.branch_id, upper(left(branch.code, 3))
  into v_branch_id, v_prefix
  from public.resolve_staff_branch(p_branch) resolved
  join public.admission_branches branch on branch.id = resolved.branch_id
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  select candidate into v_next_number
  from generate_series(1, 99999) candidate
  where not exists (
    select 1
    from public.student_payments payment
    where payment.branch_id = v_branch_id
      and payment.receipt_number = v_prefix || '-OR-' || lpad(candidate::text, 5, '0')
  )
  order by candidate
  limit 1;

  if v_next_number is null then
    raise exception 'No receipt numbers are available for this branch.';
  end if;

  return v_prefix || '-OR-' || lpad(v_next_number::text, 5, '0');
end;
$$;

create or replace function public.create_student_payment(
  p_branch text,
  p_student_number text,
  p_tracking_number text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_encoded_by text,
  p_encoded_role text default null,
  p_notes text default null
)
returns table (
  id uuid,
  branch text,
  student_number text,
  tracking_number text,
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
    v_payment.amount,
    v_payment.receipt_number,
    v_payment.paid_at,
    v_payment.encoded_by,
    v_payment.encoded_role,
    v_payment.notes,
    v_payment.created_at;
end;
$$;

create or replace function public.delete_student_payment(
  p_branch text,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select resolved.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) resolved
  limit 1;

  delete from public.student_payments payment
  where payment.id = p_payment_id
    and payment.branch_id = v_branch_id;

  if not found then
    raise exception 'Payment receipt was not found.';
  end if;
end;
$$;

grant execute on function public.list_student_payments(text) to anon, authenticated;
grant execute on function public.next_student_payment_receipt_number(text) to anon, authenticated;
grant execute on function public.create_student_payment(text, text, text, numeric, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.delete_student_payment(text, uuid) to anon, authenticated;
