-- Persistent storage for Admin Backup ZIP and SQL archive files.
-- The Django backend accesses this bucket with the Supabase service-role key;
-- no browser-facing storage policies are required.

insert into storage.buckets (id, name, public)
values ('branch-backups', 'branch-backups', false)
on conflict (id) do update
set name = excluded.name,
    public = false;
