# Permanent backup storage on Render

Backup history and backup ZIPs are separate. A history entry can exist even when
its ZIP was stored only on another computer or lost after a Render redeploy.
New production backups must use a private Supabase Storage bucket. The backend
marks the backup completed after the ZIP upload succeeds. Storage failures
still mark generated backups failed.

## Configure the existing deployment

1. In the Supabase project used by the backend, create the private bucket by
   applying `supabase/migrations/20261014000300_backup_storage_bucket.sql` in the
   SQL editor. It creates `branch-backups` without making it public.
2. In the Django web service's **Render Environment** settings, configure:

   | Variable | Value |
   | --- | --- |
   | `DEBUG` | `false` |
   | `SUPABASE_URL` | `https://pjsathhedgbgdvpyarpz.supabase.co` for the project selected in this session |
   | `SUPABASE_SERVICE_ROLE_KEY` | That project's backend service-role key, stored as a secret |
   | `SUPABASE_BACKUP_BUCKET` | `branch-backups` |

3. Apply the same storage variables to a separate Celery worker, if used. The
   web service and worker must use the same project and bucket.
4. Keep the existing `USE_SUPABASE_BACKUPS` value. This flag selects where
   history, settings, and snapshots are stored; it does **not** enable ZIP
   storage. Changing it can switch to a different history repository. If it is
   already `true`, the Supabase backup tables must have been provisioned with
   `supabase/backup_operations_schema.sql` and its applicable migrations. If it
   is `false`, the Django database must be persistent (such as Postgres), not
   Render's local SQLite file.
5. Deploy the updated backend. Render-provided environment values now take
   precedence over `.env` files. No Vercel secret or frontend code change is
   required for backup storage. Vercel's `VITE_API_BASE_URL` must continue to
   point to this Render service.

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_*` variable or commit it.
No public storage policy is needed; ZIP downloads go through the backend.

Local ZIP storage can be used with `DEBUG=true`, but complete student backups
still require real backend Supabase credentials to read the main database.
Render always disallows local fallback, including when DEBUG was left enabled.
If storage credentials are absent, new production backups now fail explicitly
instead of creating temporary files that appear safe.

## Recover existing local backup history

Keep the surviving `backend/media` directory from the original computer. The
recovery command never deletes those files or restores student records.

Run the command against the **same history database used by the deployment**.
If production history uses Supabase REST, set `USE_SUPABASE_BACKUPS=true` in the
command's environment. If production uses Django Postgres, use that database's
connection settings. Merely updating the local development SQLite database
does not repair an unrelated production database.

Use a directory containing the surviving `backend/media` files; the ZIP paths
under it must match each history entry's relative `file_path`. Run once for each
branch, using its exact name:

```powershell
cd backend
python manage.py migrate_backup_storage --branch "Bacoor" --media-root "C:\path\to\surviving\media"
```

The default is a dry run: it validates local archives and lists recoverable or
missing entries without uploading or changing history. Once the inventory and
selected database are correct, apply it:

```powershell
python manage.py migrate_backup_storage --branch "Bacoor" --media-root "C:\path\to\surviving\media" --apply
```

Apply uploads each ZIP to a new unique cloud path, then updates matching
history entries. Separate SQL files are copied
when present; when absent, the SQL export inside the ZIP remains available.
Original local files are preserved, including on errors. Missing archives are
reported and their history entries are left unchanged.

If a ZIP was lost from Render and no other copy survives, its contents cannot
be reconstructed from history metadata. Create a new backup for current data.

## Verify after deployment

1. In a test branch, create a backup and wait for completed status. Its history
   `storage_bucket` should be `branch-backups`, not `local-media`.
2. Download it and confirm it opens as a ZIP with `metadata/manifest.json` and
   the expected data files.
3. Redeploy or restart the backend, then download the same history entry again.
4. Test restore in that test branch and verify its expected records. Restore
   changes branch data, so do not use unrelated production data for this check.

The admin receives distinct messages for missing ZIPs (404), invalid or changed
archives (409), missing storage configuration, denied access, and temporary
storage failures (503). Detailed exception causes remain in backend logs.

Reference: [Render filesystem persistence](https://render.com/docs/disks) and
[Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads).


## Complete branch recovery archives (version 2)

Apply `supabase/migrations/20261101050332_complete_branch_backups.sql` to the
same Supabase project used by the frontend. This adds an exporter and an atomic
restore function, both executable only by `service_role`. Deploy both backend
and frontend changes together. The backend must have real `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` values; frontend publishable keys cannot call these
functions. Placeholder credentials deliberately fail instead of producing a
partial backup. `USE_SUPABASE_BACKUPS` still selects only the history backend.

New manual and automatic backups contain `data/database.json`, a signed
`metadata/manifest.json`, and deduplicated `attachments/*` entries. They include
branch student profiles (including imported students), admissions and requirement
files, contact/import details, student portal accounts, payments, grades and
submissions, subjects/prerequisites, instructors and saved password hashes,
sections, assignments and slots, subject plans, enrollment/schedule requests,
evaluations, branch settings and synchronized branch JSON records. Referenced
Supabase Storage files must all download successfully. Missing files fail the
backup. The current alumni display cache is supplemental signed data; it never
replaces student profiles. Data existing only in an unsynchronized browser is
not a database record and must be saved/synchronized before backup.

The archive builder downloads and packages one referenced attachment at a time.
It rolls ZIPs larger than 8 MiB onto temporary service storage, and reports
progress while it exports the database and packages attachments. The default
database export timeout is 180 seconds; set `BACKUP_EXPORT_TIMEOUT_SECONDS` on
the Django service only if the branch needs a different limit. The exported
records and attachments are unchanged, including student credentials and
academic records.

An additional Render worker is optional. Without one, the existing admin page
can trigger automatic backups while it is open in a signed-in administrator's
browser. The backend checks for a responding Celery worker; when none responds,
it runs the backup on the existing web service instead of leaving a queued job
pending. A Celery broker and worker remain optional. A
server-only schedule that runs while no admin browser is open requires a
scheduler/worker somewhere, but it does not have to be a Render service.

The configured retention period is applied after each successful backup, so
expired archives are removed from the private bucket even when Celery Beat is
not running. Pending or in-progress runs without a progress update for 45
minutes are marked failed when the admin page next checks history or attempts a
backup, allowing a retry instead of leaving that branch locked indefinitely.

This is branch recovery within the same project, not a full Supabase project
backup. Shared staff accounts, area manager accounts, Supabase Auth users,
reports, storage policies, and backup history are not replaced. Shared program
and requirement catalogs are included to restore missing references; existing
catalog entries are preserved. Schema/branch mismatches fail. Maintain separate
provider-level database/Auth and Storage recovery for project-wide disasters.

Configure a private, stable `BACKUP_SIGNING_KEY` on the backend to keep archives
restorable across service-key rotations. When omitted, the backend service role
key signs them. Preserve whichever key signed the archives; signatures reject
modified ZIPs and archives signed by another installation. Never expose this
key or the service role key through `VITE_*` variables. Archives include personal
records and credential/password hashes, so keep the backup bucket private.

Restore validates the signature, checksums, branch, table/column set, and file
coverage before uploading anything. Files upload to unique new names, then a
single database transaction replaces only the target branch's records. All
foreign keys and business validation triggers remain enabled. Invalid rows or
cross-branch references roll the database transaction back. Other branches are
checked for unintended cascading changes. The UI requires a confirmation before
replacement and re-fetches the committed database records afterward.

A storage or database HTTP timeout can have an uncertain outcome. Staged files
are intentionally retained on errors so a transaction that committed before a
lost response cannot leave broken credentials. Reconcile job status and actual
records before retrying; remove unreferenced `backup-restores/*` objects only
after confirming they are unused. Original storage objects are never overwritten
or removed by restore. This allows safe failure but may leave unused files.

Legacy JSON/SQL archives remain downloadable and uploadable for manual recovery.
They cannot perform a complete database restore, and are rejected rather than
marked successful after updating browser data. Old ZIPs cannot recover grades,
payments or files they never contained; create new version-2 backups after this
update. Restore buttons for legacy history entries are disabled.

Verification: `npm run test:complete-backup-db` runs the migration in isolated,
in-memory PostgreSQL against a schema fixture, including FK/check constraints
and the actual admission/student business triggers. It tests full recovery,
inactive historical offerings, other-branch preservation, rollback and RPC
permissions. Django's `apps.admin_panel.tests.CompleteBackupTests` tests archive
integrity, missing files, file staging, authoritative RPC calls and failure status.
No deployed student data is changed by these tests.
