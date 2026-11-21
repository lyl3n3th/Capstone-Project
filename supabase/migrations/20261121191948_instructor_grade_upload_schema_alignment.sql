-- Keep the instructor upload workflow's persisted fields aligned with the app.
alter table public.instructor_grade_submissions
  add column if not exists file_mime_type text,
  add column if not exists file_data_base64 text,
  add column if not exists error_rows jsonb not null default '[]'::jsonb;

alter table public.instructor_grade_submissions
  drop constraint if exists instructor_grade_submissions_status_check;

alter table public.instructor_grade_submissions
  add constraint instructor_grade_submissions_status_check
  check (status in ('Pending', 'Approved', 'Rejected', 'Error'));

-- PostgreSQL does not allow changing a table-returning function's row shape
-- with CREATE OR REPLACE, so recreate this RPC with the additional columns.
drop function if exists public.list_instructor_grade_submissions(text);

create function public.list_instructor_grade_submissions(p_branch text)
returns table (
  id text,
  branch text,
  instructor_id text,
  instructor_name text,
  employee_id text,
  file_name text,
  submitted_at timestamptz,
  status text,
  records jsonb,
  errors jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  error_rows jsonb,
  file_mime_type text,
  file_data_base64 text
)
language sql
security definer
set search_path = public
as $$
  select
    submission.id,
    branch.branch_name as branch,
    submission.instructor_id,
    submission.instructor_name,
    submission.employee_id,
    submission.file_name,
    submission.submitted_at,
    submission.status,
    submission.records,
    submission.errors,
    submission.reviewed_at,
    submission.reviewed_by,
    submission.error_rows,
    submission.file_mime_type,
    submission.file_data_base64
  from public.instructor_grade_submissions submission
  join public.resolve_staff_branch(p_branch) branch
    on branch.branch_id = submission.branch_id
  order by submission.submitted_at desc;
$$;

create or replace function public.upsert_instructor_grade_submission(
  p_branch text,
  p_submission jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  select branch.branch_id into v_branch_id
  from public.resolve_staff_branch(p_branch) branch
  limit 1;

  if v_branch_id is null then
    raise exception 'Branch "%" is not configured in Supabase.', p_branch;
  end if;

  insert into public.instructor_grade_submissions (
    id,
    branch_id,
    instructor_id,
    instructor_name,
    employee_id,
    file_name,
    file_mime_type,
    file_data_base64,
    submitted_at,
    status,
    records,
    errors,
    error_rows,
    reviewed_at,
    reviewed_by,
    updated_at
  )
  values (
    p_submission->>'id',
    v_branch_id,
    p_submission->>'instructorId',
    p_submission->>'instructorName',
    p_submission->>'employeeId',
    p_submission->>'fileName',
    nullif(p_submission->>'fileMimeType', ''),
    nullif(p_submission->>'fileDataBase64', ''),
    coalesce((p_submission->>'submittedAt')::timestamptz, timezone('utc', now())),
    coalesce(p_submission->>'status', 'Pending'),
    coalesce(p_submission->'records', '[]'::jsonb),
    coalesce(p_submission->'errors', '[]'::jsonb),
    coalesce(p_submission->'errorRows', '[]'::jsonb),
    nullif(p_submission->>'reviewedAt', '')::timestamptz,
    nullif(p_submission->>'reviewedBy', ''),
    timezone('utc', now())
  )
  on conflict (id) do update
  set instructor_id = excluded.instructor_id,
      instructor_name = excluded.instructor_name,
      employee_id = excluded.employee_id,
      file_name = excluded.file_name,
      file_mime_type = excluded.file_mime_type,
      file_data_base64 = excluded.file_data_base64,
      submitted_at = excluded.submitted_at,
      status = excluded.status,
      records = excluded.records,
      errors = excluded.errors,
      error_rows = excluded.error_rows,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      updated_at = excluded.updated_at;
end;
$$;
