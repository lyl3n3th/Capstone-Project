## Supabase Schema Setup

Cloning this repository copies the SQL files and migrations, but it does not automatically create or update your Supabase database.

For a fresh database, apply the schema in this order:

1. `supabase/migrations/20260426000100_admissions_schema.sql`
2. `supabase/migrations/20260426000200_staff_accounts_schema.sql`
3. `supabase/migrations/20260426000300_student_portal_schema.sql`
4. `supabase/migrations/20260426000400_academic_operations_schema.sql`
5. `supabase/migrations/20260426000500_report_operations_schema.sql`
6. `supabase/migrations/20260426000600_backup_operations_schema.sql`

Notes:

- `academic_operations_schema.sql`, `staff_accounts_schema.sql`, and `student_portal_schema.sql` depend on admissions tables already existing.
- Commit and push both the source schema files and the `supabase/migrations` copies so other devices receive the same database changes.
- If you update a schema file, update the matching migration strategy too before applying it to another environment.
