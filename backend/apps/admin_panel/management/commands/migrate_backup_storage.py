from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify

from apps.admin_panel.repository import list_backup_history, update_backup_history
from apps.admin_panel.services import inspect_uploaded_backup_archive
from apps.admin_panel.storage import (
    LOCAL_BACKUP_STORAGE_BUCKET,
    get_storage_config,
    upload_backup_blob,
    verify_backup_archive,
)


class Command(BaseCommand):
    help = "Recover local backup archives into Supabase Storage. Defaults to a dry run; never deletes local files."

    def add_arguments(self, parser):
        parser.add_argument("--branch", required=True)
        parser.add_argument("--media-root", help="Directory containing the surviving backend/media files.")
        parser.add_argument("--apply", action="store_true", help="Upload verified files and update matching history entries.")

    def handle(self, *args, **options):
        branch = options["branch"]
        media_root = Path(options["media_root"] or settings.MEDIA_ROOT).resolve()
        if not media_root.is_dir():
            raise CommandError("The local media directory does not exist.")
        if options["apply"]:
            try:
                get_storage_config()
            except Exception as exc:
                raise CommandError("Configure Supabase backend storage credentials before applying recovery.") from exc

        # The configured history repository must be the one used by the deployment.
        histories = list_backup_history(branch)
        recovered = {}
        missing = 0
        eligible = 0
        for history in histories:
            if history.storage_bucket not in (LOCAL_BACKUP_STORAGE_BUCKET, "") or not history.file_path:
                continue
            archive_path = self._safe_path(media_root, history.file_path)
            if not archive_path.is_file():
                missing += 1
                self.stdout.write(self.style.WARNING(f"Missing local ZIP for history {history.id}; unchanged."))
                continue

            payload = archive_path.read_bytes()
            try:
                inspect_uploaded_backup_archive(payload=payload, branch_id=branch)
            except ValueError as exc:
                raise CommandError(f"Invalid ZIP for history {history.id}: {exc}") from exc
            eligible += 1
            if not options["apply"]:
                self.stdout.write(f"Would recover history {history.id} ({len(payload)} bytes).")
                continue

            if history.file_path not in recovered:
                prefix = f"branches/{slugify(branch) or 'branch'}/recovered/{uuid4().hex}"
                bucket, stored_path = upload_backup_blob(
                    object_path=f"{prefix}/{archive_path.name}",
                    payload=payload,
                    content_type="application/zip",
                )
                verify_backup_archive(object_path=stored_path, storage_bucket=bucket, expected_payload=payload)
                stored_sql_path = ""
                if history.sql_file_path:
                    sql_path = self._safe_path(media_root, history.sql_file_path)
                    if sql_path.is_file():
                        _bucket, stored_sql_path = upload_backup_blob(
                            object_path=f"{prefix}/{sql_path.name}",
                            payload=sql_path.read_bytes(),
                            content_type="application/sql",
                        )
                    else:
                        self.stdout.write(self.style.WARNING("Separate SQL file is missing; SQL inside the verified ZIP remains available."))
                recovered[history.file_path] = (bucket, stored_path, stored_sql_path)

            bucket, stored_path, stored_sql_path = recovered[history.file_path]
            updated = update_backup_history(
                history.id, storage_bucket=bucket, file_path=stored_path, sql_file_path=stored_sql_path,
            )
            if not updated:
                raise CommandError(f"Could not update history {history.id}; original local files were preserved.")
            self.stdout.write(self.style.SUCCESS(f"Recovered history {history.id}."))

        mode = "Applied" if options["apply"] else "Dry run"
        self.stdout.write(f"{mode}: {eligible} recoverable entries; {missing} missing local copies. Local files were preserved.")

    @staticmethod
    def _safe_path(media_root, storage_path):
        candidate = (media_root / storage_path).resolve()
        if not candidate.is_relative_to(media_root):
            raise CommandError("A history entry refers to a file outside the selected media directory.")
        return candidate
