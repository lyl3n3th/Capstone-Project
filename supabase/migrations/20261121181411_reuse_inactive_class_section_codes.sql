-- Deleted sections are hidden from the app but retain their rows for history.
-- Their codes should not block a new active section in the same branch.
alter table public.branch_class_sections
  drop constraint if exists branch_class_sections_branch_id_code_key;

create unique index if not exists branch_class_sections_active_branch_code_key
  on public.branch_class_sections (branch_id, code)
  where is_active;
