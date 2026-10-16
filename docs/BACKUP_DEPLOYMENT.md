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

Local development without cloud credentials still works when `DEBUG=true`.
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
