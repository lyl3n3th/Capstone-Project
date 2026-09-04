create table if not exists public.instructor_evaluation_statuses (
  branch text not null,
  instructor_id text not null,
  is_open boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (branch, instructor_id)
);

create table if not exists public.evaluation_questionnaire_categories (
  id text primary key,
  branch text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.evaluation_questionnaire_questions (
  id text primary key,
  category_id text not null references public.evaluation_questionnaire_categories(id) on delete cascade,
  branch text not null,
  text text not null,
  question_type text not null default 'rating',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint evaluation_questionnaire_questions_type_check
    check (question_type in ('rating', 'essay'))
);

create table if not exists public.instructor_evaluation_submissions (
  id text primary key,
  branch text not null,
  instructor_id text not null,
  instructor_name text not null,
  student_number text not null,
  student_name text not null,
  year_level text not null,
  section text not null,
  academic_year text not null,
  semester text not null,
  subject_ids text[] not null default '{}',
  subject_codes text[] not null default '{}',
  responses jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default timezone('utc', now())
);

create index if not exists instructor_evaluation_statuses_branch_idx
  on public.instructor_evaluation_statuses(branch);

create index if not exists evaluation_questionnaire_categories_branch_idx
  on public.evaluation_questionnaire_categories(branch, sort_order);

create index if not exists evaluation_questionnaire_questions_category_idx
  on public.evaluation_questionnaire_questions(category_id, sort_order);

create index if not exists instructor_evaluation_submissions_branch_instructor_idx
  on public.instructor_evaluation_submissions(branch, instructor_id);

alter table public.instructor_evaluation_statuses enable row level security;
alter table public.evaluation_questionnaire_categories enable row level security;
alter table public.evaluation_questionnaire_questions enable row level security;
alter table public.instructor_evaluation_submissions enable row level security;

drop policy if exists "Instructor evaluation statuses are available" on public.instructor_evaluation_statuses;
create policy "Instructor evaluation statuses are available"
on public.instructor_evaluation_statuses
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Evaluation questionnaire categories are available" on public.evaluation_questionnaire_categories;
create policy "Evaluation questionnaire categories are available"
on public.evaluation_questionnaire_categories
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Evaluation questionnaire questions are available" on public.evaluation_questionnaire_questions;
create policy "Evaluation questionnaire questions are available"
on public.evaluation_questionnaire_questions
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Instructor evaluation submissions are available" on public.instructor_evaluation_submissions;
create policy "Instructor evaluation submissions are available"
on public.instructor_evaluation_submissions
for all
to anon, authenticated
using (true)
with check (true);

grant all on table public.instructor_evaluation_statuses to anon, authenticated;
grant all on table public.evaluation_questionnaire_categories to anon, authenticated;
grant all on table public.evaluation_questionnaire_questions to anon, authenticated;
grant all on table public.instructor_evaluation_submissions to anon, authenticated;
