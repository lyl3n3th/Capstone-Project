-- One evaluation window per branch, shared by all instructors.
create table if not exists public.instructor_evaluation_periods (
  branch text primary key,
  is_open boolean not null default false,
  closes_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Preserve access when migrating branches that already have open evaluations.
insert into public.instructor_evaluation_periods (branch, is_open)
select branch, bool_or(is_open)
from public.instructor_evaluation_statuses
group by branch
on conflict (branch) do nothing;

alter table public.instructor_evaluation_periods enable row level security;
drop policy if exists "Evaluation periods are available" on public.instructor_evaluation_periods;
create policy "Evaluation periods are available"
on public.instructor_evaluation_periods for all to anon, authenticated
using (true) with check (true);
grant select, insert, update on public.instructor_evaluation_periods to anon, authenticated;

create or replace function public.require_open_instructor_evaluation_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.instructor_evaluation_periods%rowtype;
begin
  select * into v_period
  from public.instructor_evaluation_periods
  where branch = new.branch
  for share;

  if not found or not v_period.is_open
    or (v_period.closes_at is not null and v_period.closes_at <= clock_timestamp()) then
    raise exception 'Instructor evaluations are closed. Your response was not submitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_open_instructor_evaluation_period on public.instructor_evaluation_submissions;
create trigger require_open_instructor_evaluation_period
before insert or update on public.instructor_evaluation_submissions
for each row execute function public.require_open_instructor_evaluation_period();
