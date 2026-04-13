create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.branch_backup_settings (
  branch text primary key,
  automated_time time not null default '23:00',
  retention_days integer not null default 30,
  is_enabled boolean not null default true,
  last_automated_backup_at timestamptz,
  updated_by text,
  updated_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branch_backup_settings_retention_days_check
    check (retention_days > 0)
);

drop trigger if exists branch_backup_settings_set_updated_at on public.branch_backup_settings;
create trigger branch_backup_settings_set_updated_at
before update on public.branch_backup_settings
for each row
execute function public.set_updated_at();

create table if not exists public.branch_backup_history (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  backup_type text not null,
  file_path text not null default '',
  sql_file_path text not null default '',
  backup_filename text not null,
  storage_bucket text not null default '',
  created_by text,
  created_by_name text,
  creation_date timestamptz not null default timezone('utc', now()),
  status text not null default 'pending',
  progress smallint not null default 0,
  task_id text not null default '',
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  restored_from uuid references public.branch_backup_history(id) on delete set null,
  restore_started_at timestamptz,
  restore_finished_at timestamptz,
  constraint branch_backup_history_type_check
    check (backup_type in ('manual', 'automated', 'restore')),
  constraint branch_backup_history_status_check
    check (status in ('pending', 'in_progress', 'completed', 'failed', 'deleted')),
  constraint branch_backup_history_progress_check
    check (progress between 0 and 100)
);

create index if not exists branch_backup_history_branch_created_idx
  on public.branch_backup_history (branch, creation_date desc);

create index if not exists branch_backup_history_status_idx
  on public.branch_backup_history (status, backup_type);
