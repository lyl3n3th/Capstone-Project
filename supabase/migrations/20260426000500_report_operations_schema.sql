create extension if not exists pgcrypto;

create table if not exists public.branch_reports (
  id uuid primary key default gen_random_uuid(),
  sender text,
  sender_name text not null,
  branch text not null,
  subject text not null,
  message text not null,
  attachment_url text not null default '',
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists branch_reports_deleted_created_idx
  on public.branch_reports (is_deleted, created_at desc);

create index if not exists branch_reports_branch_created_idx
  on public.branch_reports (branch, created_at desc);
