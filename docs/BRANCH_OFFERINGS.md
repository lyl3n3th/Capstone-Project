Branch courses and strands
==========================

Apply `supabase/migrations/20261019000100_branch_track_offerings.sql` to the
Supabase project before using the new controls. Run the entire file in the
Supabase SQL Editor, or apply it with the project's normal migration tooling.
It runs in a transaction and reloads the PostgREST schema cache.

The migration preserves the existing branches' active program offerings and
tracks. Newly created branches have no courses or strands until configured.

In Area Manager, open Staff Accounts > Manage Branches > Courses / Strands.
Select available courses and strands, optionally add a named option under
College or Senior High School, and select Save Availability. Adding a branch
opens this editor automatically. Selecting no options disables new admissions
for the branch.

Course/strand deletion requires
`supabase/migrations/20261019000400_protect_enrolled_branch_tracks.sql` after
the earlier migrations. Each option has a Delete button. Options currently
taken by active students in the selected branch show an enrolled-student
count and cannot be deleted or unchecked. The database enforces the same
rule for deletion and Save Availability, and prevents new enrollment into
a removed offering.

Deleting an option hides it from that branch's catalog across refreshes.
Other branches' offerings and historical student records are preserved.
An explicitly re-added option can be offered again later.

The settings apply to admission branch eligibility, educational levels, and
course/strand selection, plus the subject and section creation controls in
Academic Management. Saving requires an unexpired Area Manager session.
Existing student and admission records are retained when an offering is
disabled. Changing one branch does not change another branch's availability.
