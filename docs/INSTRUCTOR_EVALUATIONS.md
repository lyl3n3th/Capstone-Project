Apply `supabase/migrations/20261020000200_branch_instructor_evaluation_period.sql` in Supabase SQL Editor before using the new controls.

In Academic Management → Evaluation, **Open All Evaluations** opens student evaluations for all assigned instructors in the admin's branch. Instructors added or assigned while the period is open follow the same branch setting. Per-instructor opening and closing controls have been removed; questionnaire management and response details remain available.

The closing date and time is optional and uses the device's local time. Leave it blank to keep evaluations open until the admin clicks **Close All Evaluations**. Set a future date to close automatically, including when no admin is online. While open, **Save Closing Time** changes or removes the deadline. Closing early is always available.

Students see the configured deadline. Their page refreshes access every 30 seconds and on focus, and disables evaluations when the deadline arrives. Submissions check the latest period and are only marked submitted after the database accepts them. A database trigger rejects submissions once closed or expired, including forms opened before the deadline.

The migration preserves existing submissions. If any instructor evaluation was previously open in a branch, it initializes that branch's shared period as open without a deadline; otherwise it starts closed.

Run `npm run test:evaluation-period` for period state, deadline boundaries, branch isolation, persistence failures, and local date/time conversion. Run `npm run build` for TypeScript and the production bundle.
