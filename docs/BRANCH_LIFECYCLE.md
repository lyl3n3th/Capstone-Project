Branch deletion and staff reassignment
====================================

Apply `supabase/migrations/20261019000300_branch_staff_retirement.sql` after the
earlier migrations, including the branch offerings migration.

Deleting a branch requires a valid Area Manager session and is rejected when
the branch has active students. The database operation is transactional:

- Staff accounts become inactive and their branch assignments are cleared.
- Subjects and instructors are permanently deleted. Existing subject foreign
  keys also remove their prerequisites and class assignments. Instructor
  password records and academic catalog caches are removed.
- The branch, its offerings, and its admission portal become inactive.
- Historical student, admission, report, and financial records remain.

The migration also performs this cleanup for previously inactive branches
that have no active students. It does not clean up branches with active students.

Affected staff appear in Disabled Accounts as Unassigned / Branch inactive.
Restore & Assign opens the staff form with no branch selected. The manager
must choose an active branch before enabling the account. Existing active
accounts for the same branch and role prevent restoration to that role.
The password is retained unless the manager explicitly enters a new one.
The employee ID is regenerated for the new branch, as with other reassignments.

The dashboard reads the active branch list and never creates or reactivates
branches from employee records, historical reports, or browser caches.
