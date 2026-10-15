import io
import json
import zipfile
from datetime import datetime, time, timezone
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.admin_panel.automation import is_automated_backup_due
from apps.admin_panel.models import BackupHistory, BackupSnapshot
from apps.admin_panel.repository import BackupSettingsRecord
from apps.admin_panel.storage import (
    BackupStorageError, download_backup_archive_blob, download_backup_blob,
    upload_backup_blob, verify_backup_archive,
)
from apps.admin_panel.services import create_branch_backup


class BackupAutomationTimingTests(TestCase):
    def test_automated_backup_is_due_for_branch_local_naive_reference_time(self):
        settings_row = BackupSettingsRecord(
            branch="Bacoor",
            automated_time=time(hour=15, minute=16),
            retention_days=30,
            is_enabled=True,
            timezone_offset_minutes=-480,
        )

        self.assertTrue(
            is_automated_backup_due(
                settings_row,
                reference_time="2026-04-17T15:16:11",
                timezone_offset_minutes=-480,
            )
        )

    def test_automated_backup_is_due_for_utc_reference_time_with_offset(self):
        settings_row = BackupSettingsRecord(
            branch="Bacoor",
            automated_time=time(hour=15, minute=16),
            retention_days=30,
            is_enabled=True,
            timezone_offset_minutes=-480,
        )

        self.assertTrue(
            is_automated_backup_due(
                settings_row,
                reference_time="2026-04-17T07:16:11+00:00",
                timezone_offset_minutes=-480,
            )
        )

    def test_automated_backup_is_not_due_after_it_already_ran_today(self):
        settings_row = BackupSettingsRecord(
            branch="Bacoor",
            automated_time=time(hour=15, minute=16),
            retention_days=30,
            is_enabled=True,
            timezone_offset_minutes=-480,
            last_automated_backup_at=datetime(2026, 4, 17, 7, 16, tzinfo=timezone.utc),
        )

        self.assertFalse(
            is_automated_backup_due(
                settings_row,
                reference_time="2026-04-17T15:17:00",
                timezone_offset_minutes=-480,
            )
        )

    def test_automated_backup_is_due_when_last_run_was_before_new_schedule_today(self):
        settings_row = BackupSettingsRecord(
            branch="Bacoor",
            automated_time=time(hour=19, minute=2),
            retention_days=30,
            is_enabled=True,
            timezone_offset_minutes=-480,
            last_automated_backup_at=datetime(2026, 4, 17, 6, 49, tzinfo=timezone.utc),
        )

        self.assertTrue(
            is_automated_backup_due(
                settings_row,
                reference_time="2026-04-17T11:02:10+00:00",
                timezone_offset_minutes=-480,
            )
        )

    def test_automated_backup_is_not_due_when_last_run_was_after_schedule_today(self):
        settings_row = BackupSettingsRecord(
            branch="Bacoor",
            automated_time=time(hour=19, minute=2),
            retention_days=30,
            is_enabled=True,
            timezone_offset_minutes=-480,
            last_automated_backup_at=datetime(2026, 4, 17, 11, 2, 15, tzinfo=timezone.utc),
        )

        self.assertFalse(
            is_automated_backup_due(
                settings_row,
                reference_time="2026-04-17T11:03:00+00:00",
                timezone_offset_minutes=-480,
            )
        )


class BackupAutomatedDispatchApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="backup-admin",
            password="password123",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @patch("apps.admin_panel.views.dispatch_due_automated_backups")
    def test_dispatch_view_preserves_reference_time_string(self, dispatch_mock):
        dispatch_mock.return_value = []

        response = self.client.post(
            "/api/admin/backup/automated/dispatch/",
            {
                "reference_time": "2026-04-17T15:16:11",
                "timezone_offset_minutes": -480,
            },
            format="json",
            HTTP_X_USER_ROLE="admin",
            HTTP_X_USER_BRANCH="Bacoor",
        )

        self.assertEqual(response.status_code, 200)
        dispatch_mock.assert_called_once_with(
            branch_id="Bacoor",
            reference_time="2026-04-17T15:16:11",
            timezone_offset_minutes=-480,
            created_by=self.user,
            created_by_name="",
        )


class BackupArchiveApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="backup-upload-admin",
            password="password123",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _build_snapshot_zip(self, *, branch="Bacoor"):
        archive_buffer = io.BytesIO()
        with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "metadata/manifest.json",
                json.dumps(
                    {
                        "branch": branch,
                        "backup_type": "manual",
                        "snapshot_format": "json",
                        "dataset_counts": {"students": 1, "alumni": 1},
                        "models": [],
                        "model_counts": {},
                    }
                ).encode("utf-8"),
            )
            archive.writestr(
                "data/students.json",
                json.dumps([{"id": "S-1", "branch": branch}]).encode("utf-8"),
            )
            archive.writestr(
                "data/alumni.json",
                json.dumps([{"id": "A-1", "becameAlumniOn": "2026-04-24"}]).encode("utf-8"),
            )

        archive_buffer.seek(0)
        return archive_buffer.getvalue()

    @patch("apps.admin_panel.storage.request.urlopen")
    @patch("apps.admin_panel.storage.get_storage_config")
    def test_download_uses_bucket_recorded_with_backup(self, storage_config_mock, urlopen_mock):
        storage_config_mock.return_value = (
            "https://project.supabase.co",
            "service-role-key",
            "current-backup-bucket",
        )
        urlopen_mock.return_value.__enter__.return_value.read.return_value = b"zip-payload"

        payload = download_backup_blob(
            object_path="branches/bacoor/manual/bacoor_backup.zip",
            storage_bucket="original-backup-bucket",
        )

        self.assertEqual(payload, b"zip-payload")
        download_request = urlopen_mock.call_args.args[0]
        self.assertIn(
            "/storage/v1/object/authenticated/original-backup-bucket/",
            download_request.full_url,
        )

    @patch("apps.admin_panel.storage.download_backup_blob")
    @patch("apps.admin_panel.storage.get_storage_config")
    def test_archive_download_recovers_using_configured_bucket(
        self,
        storage_config_mock,
        download_blob_mock,
    ):
        storage_config_mock.return_value = (
            "https://project.supabase.co",
            "service-role-key",
            "current-backup-bucket",
        )
        download_blob_mock.side_effect = [
            b"not-a-zip",
            self._build_snapshot_zip(),
        ]

        payload, recovered_bucket = download_backup_archive_blob(
            object_path="branches/bacoor/manual/bacoor_backup.zip",
            storage_bucket="old-backup-bucket",
        )

        self.assertEqual(recovered_bucket, "current-backup-bucket")
        self.assertTrue(zipfile.is_zipfile(io.BytesIO(payload)))
        self.assertEqual(
            download_blob_mock.call_args_list[0].kwargs["storage_bucket"],
            "old-backup-bucket",
        )
        self.assertEqual(
            download_blob_mock.call_args_list[1].kwargs["storage_bucket"],
            "current-backup-bucket",
        )

    @patch("apps.admin_panel.services.upload_backup_blob")
    def test_upload_backup_archive_creates_completed_history_entry(self, upload_blob_mock):
        upload_blob_mock.return_value = (
            "local-media",
            "branches/bacoor/uploads/bacoor_backup.zip",
        )

        with patch("apps.admin_panel.services.verify_backup_archive") as verify_mock:
            response = self.client.post(
                "/api/admin/backup/upload/",
                {
                    "archive": SimpleUploadedFile(
                        "bacoor_backup.zip",
                        self._build_snapshot_zip(),
                        content_type="application/zip",
                    )
                },
                format="multipart",
                HTTP_X_USER_ROLE="admin",
                HTTP_X_USER_BRANCH="Bacoor",
            )

        verify_mock.assert_called_once()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "completed")
        self.assertEqual(response.data["backup_type"], "manual")
        self.assertEqual(response.data["backup_filename"], "bacoor_backup.zip")
        self.assertEqual(response.data["metadata"]["snapshot_format"], "json")
        self.assertEqual(response.data["metadata"]["student_count"], 1)
        self.assertEqual(response.data["metadata"]["alumni_count"], 1)
        self.assertEqual(response.data["metadata"]["upload_source"], "uploaded_archive")

        history = BackupHistory.objects.get(pk=response.data["id"])
        self.assertEqual(history.status, BackupHistory.STATUS_COMPLETED)
        self.assertEqual(
            history.file_path,
            "branches/bacoor/uploads/bacoor_backup.zip",
        )

    @patch("apps.admin_panel.views.get_backup_archive_payload")
    def test_download_backup_archive_returns_zip_attachment(self, archive_payload_mock):
        archive_payload_mock.return_value = b"zip-payload"
        history = BackupHistory.objects.create(
            branch="Bacoor",
            backup_type=BackupHistory.TYPE_MANUAL,
            file_path="branches/bacoor/manual/bacoor_backup.zip",
            sql_file_path="",
            backup_filename="bacoor_backup.zip",
            storage_bucket="local-media",
            status=BackupHistory.STATUS_COMPLETED,
            progress=100,
        )

        response = self.client.get(
            f"/api/admin/backup/history/{history.id}/download/",
            HTTP_X_USER_ROLE="admin",
            HTTP_X_USER_BRANCH="Bacoor",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn(
            'attachment; filename="bacoor_backup.zip"',
            response["Content-Disposition"],
        )
        self.assertEqual(response.content, b"zip-payload")
        archive_payload_mock.assert_called_once()
        passed_history = archive_payload_mock.call_args.args[0]
        self.assertEqual(passed_history.file_path, history.file_path)
        self.assertEqual(passed_history.storage_bucket, "local-media")

    @patch("apps.admin_panel.services.get_backup_archive_payload")
    def test_restore_json_backup_completes_inline(self, archive_payload_mock):
        archive_payload_mock.return_value = self._build_snapshot_zip()
        source_history = BackupHistory.objects.create(
            branch="Bacoor",
            backup_type=BackupHistory.TYPE_MANUAL,
            file_path="branches/bacoor/manual/bacoor_backup.zip",
            sql_file_path="",
            backup_filename="bacoor_backup.zip",
            storage_bucket="local-media",
            status=BackupHistory.STATUS_COMPLETED,
            progress=100,
            metadata={"snapshot_format": "json"},
        )

        response = self.client.post(
            "/api/admin/backup/restore/",
            {"backup_history_id": str(source_history.id)},
            format="json",
            HTTP_X_USER_ROLE="admin",
            HTTP_X_USER_BRANCH="Bacoor",
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["backup_type"], BackupHistory.TYPE_RESTORE)
        self.assertEqual(response.data["status"], BackupHistory.STATUS_COMPLETED)
        self.assertEqual(response.data["progress"], 100)
        self.assertEqual(str(response.data["restored_from"]), str(source_history.id))

        restore_history = BackupHistory.objects.get(pk=response.data["id"])
        self.assertEqual(restore_history.status, BackupHistory.STATUS_COMPLETED)
        self.assertEqual(restore_history.progress, 100)
        archive_payload_mock.assert_called_once()
        restored_snapshot = BackupSnapshot.objects.get(branch="Bacoor")
        self.assertEqual(
            restored_snapshot.students,
            [{"id": "S-1", "branch": "Bacoor"}],
        )
        self.assertEqual(
            restored_snapshot.alumni,
            [{"id": "A-1", "becameAlumniOn": "2026-04-24"}],
        )

    @patch("apps.admin_panel.services.verify_backup_archive")
    @patch("apps.admin_panel.services.upload_backup_blob")
    def test_unreadable_uploaded_archive_never_creates_completed_history(self, upload_mock, verify_mock):
        upload_mock.return_value = ("branch-backups", "unreadable.zip")
        verify_mock.side_effect = BackupStorageError("Saved backup could not be verified.")
        response = self.client.post(
            "/api/admin/backup/upload/",
            {"archive": SimpleUploadedFile("backup.zip", self._build_snapshot_zip(), content_type="application/zip")},
            format="multipart", HTTP_X_USER_ROLE="admin", HTTP_X_USER_BRANCH="Bacoor",
        )
        self.assertEqual(response.status_code, 503)
        self.assertFalse(BackupHistory.objects.exists())

    @patch("apps.admin_panel.services.verify_backup_archive")
    @patch("apps.admin_panel.services.upload_backup_blob")
    def test_failed_readback_marks_generated_backup_failed(self, upload_mock, verify_mock):
        upload_mock.return_value = ("branch-backups", "backup.zip")
        verify_mock.side_effect = BackupStorageError("Saved backup failed verification.", status_code=409)
        with self.assertRaises(BackupStorageError):
            create_branch_backup(branch_id="Bacoor", backup_type="manual", snapshot_data={"students": [], "alumni": []})
        history = BackupHistory.objects.get()
        self.assertEqual(history.status, BackupHistory.STATUS_FAILED)
        self.assertIn("verification", history.error_message)

    @patch("apps.admin_panel.views.get_backup_archive_payload")
    def test_download_reports_storage_access_failure_without_calling_it_missing(self, payload_mock):
        history = BackupHistory.objects.create(
            branch="Bacoor", backup_type="manual", file_path="backup.zip",
            status=BackupHistory.STATUS_COMPLETED, storage_bucket="branch-backups",
        )
        payload_mock.side_effect = BackupStorageError("Backup storage access was denied.")
        response = self.client.get(
            f"/api/admin/backup/history/{history.id}/download/",
            HTTP_X_USER_ROLE="admin", HTTP_X_USER_BRANCH="Bacoor",
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Backup storage access was denied.")

    @override_settings(BACKUP_ALLOW_LOCAL_STORAGE=False)
    @patch("apps.admin_panel.tasks.create_branch_backup_task.delay", side_effect=RuntimeError("No worker"))
    @patch("apps.admin_panel.storage.get_storage_config", side_effect=ImproperlyConfigured("Missing credentials"))
    def test_inline_storage_failure_does_not_leave_backup_stuck_or_block_retry(self, _config_mock, _dispatch_mock):
        for _attempt in range(2):
            response = self.client.post(
                "/api/admin/backup/manual/", {"backup_type": "manual", "students": [], "alumni": []},
                format="json", HTTP_X_USER_ROLE="admin", HTTP_X_USER_BRANCH="Bacoor",
            )
            self.assertEqual(response.status_code, 503)
            self.assertIn("Permanent backup storage is not configured", response.data["detail"])
        self.assertEqual(BackupHistory.objects.filter(status="failed").count(), 2)
        self.assertFalse(BackupHistory.objects.filter(status__in=["pending", "in_progress", "completed"]).exists())

    @patch("apps.admin_panel.services.get_backup_archive_payload")
    def test_failed_json_restore_preserves_current_data(self, payload_mock):
        payload_mock.side_effect = BackupStorageError("The backup ZIP is missing from storage.", status_code=404)
        source = BackupHistory.objects.create(
            branch="Bacoor", backup_type="manual", file_path="missing.zip", storage_bucket="local-media",
            status="completed", metadata={"snapshot_format": "json"},
        )
        BackupSnapshot.objects.create(branch="Bacoor", students=[{"id": "CURRENT"}], alumni=[])
        response = self.client.post(
            "/api/admin/backup/restore/", {"backup_history_id": str(source.id)},
            format="json", HTTP_X_USER_ROLE="admin", HTTP_X_USER_BRANCH="Bacoor",
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "failed")
        self.assertIn("ZIP is missing", response.data["error_message"])
        self.assertEqual(BackupSnapshot.objects.get(branch="Bacoor").students, [{"id": "CURRENT"}])

    @override_settings(
        BACKUP_ALLOW_LOCAL_STORAGE=False,
        SUPABASE_URL="https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="test-service-key",
        SUPABASE_BACKUP_BUCKET="branch-backups",
    )
    @patch("apps.admin_panel.tasks.create_branch_backup_task.delay", side_effect=RuntimeError("No worker"))
    @patch("apps.admin_panel.storage.request.urlopen")
    def test_cloud_backup_download_and_restore_without_local_files(self, urlopen_mock, _dispatch_mock):
        objects = {}

        def cloud_storage(http_request, **kwargs):
            object_path = http_request.full_url.split("/storage/v1/object/", 1)[1]
            if http_request.get_method() == "POST":
                objects[object_path] = http_request.data
                return io.BytesIO(b"{}")
            return io.BytesIO(objects[object_path.removeprefix("authenticated/")])

        urlopen_mock.side_effect = cloud_storage
        headers = {"HTTP_X_USER_ROLE": "admin", "HTTP_X_USER_BRANCH": "Bacoor"}
        with TemporaryDirectory() as empty_media, override_settings(MEDIA_ROOT=empty_media):
            response = self.client.post(
                "/api/admin/backup/manual/",
                {"backup_type": "manual", "students": [{"id": "S-1", "branch": "Bacoor"}], "alumni": []},
                format="json", **headers,
            )
            self.assertEqual(response.status_code, 202, response.data)
            self.assertEqual(response.data["status"], "completed")
            self.assertEqual(response.data["storage_bucket"], "branch-backups")
            history_id = response.data["id"]
            download = self.client.get(f"/api/admin/backup/history/{history_id}/download/", **headers)
            self.assertEqual(download.status_code, 200)
            self.assertTrue(zipfile.is_zipfile(io.BytesIO(download.content)))
            restore = self.client.post(
                "/api/admin/backup/restore/", {"backup_history_id": str(history_id)}, format="json", **headers,
            )
            self.assertEqual(restore.status_code, 202, restore.data)
            self.assertEqual(restore.data["status"], "completed")
            self.assertEqual(BackupSnapshot.objects.get(branch="Bacoor").students, [{"id": "S-1", "branch": "Bacoor"}])

    @patch("apps.admin_panel.management.commands.migrate_backup_storage.verify_backup_archive")
    @patch("apps.admin_panel.management.commands.migrate_backup_storage.upload_backup_blob")
    @patch("apps.admin_panel.management.commands.migrate_backup_storage.get_storage_config")
    def test_recovery_preserves_local_files_and_updates_history_only_after_verification(self, config_mock, upload_mock, verify_mock):
        from pathlib import Path
        config_mock.return_value = ("https://project.supabase.co", "test-key", "branch-backups")
        upload_mock.return_value = ("branch-backups", "recovered/backup.zip")
        history = BackupHistory.objects.create(
            branch="Bacoor", backup_type="manual", file_path="old.zip",
            storage_bucket="local-media", status=BackupHistory.STATUS_COMPLETED,
        )
        with TemporaryDirectory() as media_root:
            original = Path(media_root) / "old.zip"
            original.write_bytes(self._build_snapshot_zip())
            output = io.StringIO()
            call_command("migrate_backup_storage", branch="Bacoor", media_root=media_root, stdout=output)
            upload_mock.assert_not_called()
            history.refresh_from_db()
            self.assertEqual(history.storage_bucket, "local-media")
            verify_mock.side_effect = BackupStorageError("Verification failed.")
            with self.assertRaises(BackupStorageError):
                call_command("migrate_backup_storage", branch="Bacoor", media_root=media_root, apply=True, stdout=output)
            history.refresh_from_db()
            self.assertEqual(history.storage_bucket, "local-media")
            verify_mock.side_effect = None
            call_command("migrate_backup_storage", branch="Bacoor", media_root=media_root, apply=True, stdout=output)
            history.refresh_from_db()
            self.assertEqual(history.storage_bucket, "branch-backups")
            self.assertEqual(history.file_path, "recovered/backup.zip")
            self.assertTrue(original.is_file())


class BackupStorageSafetyTests(SimpleTestCase):
    @override_settings(BACKUP_ALLOW_LOCAL_STORAGE=False)
    @patch("apps.admin_panel.storage.default_storage.save")
    @patch("apps.admin_panel.storage.get_storage_config", side_effect=ImproperlyConfigured("Missing credentials"))
    def test_production_never_silently_saves_to_local_disk(self, _config_mock, save_mock):
        with self.assertRaisesMessage(BackupStorageError, "Permanent backup storage is not configured"):
            upload_backup_blob(object_path="backup.zip", payload=b"payload")
        save_mock.assert_not_called()

    @override_settings(BACKUP_ALLOW_LOCAL_STORAGE=True)
    @patch("apps.admin_panel.storage.default_storage.save", return_value="local.zip")
    @patch("apps.admin_panel.storage.get_storage_config", side_effect=ImproperlyConfigured("Missing credentials"))
    def test_development_can_still_save_locally(self, _config_mock, save_mock):
        self.assertEqual(upload_backup_blob(object_path="backup.zip", payload=b"payload"), ("local-media", "local.zip"))
        save_mock.assert_called_once()

    @patch("apps.admin_panel.storage.download_backup_blob")
    @patch("apps.admin_panel.storage.get_storage_config", side_effect=ImproperlyConfigured("Missing credentials"))
    def test_missing_legacy_local_zip_explains_recovery(self, _config_mock, download_mock):
        download_mock.side_effect = FileNotFoundError()
        with self.assertRaises(BackupStorageError) as raised:
            download_backup_archive_blob(object_path="gone.zip", storage_bucket="local-media")
        self.assertEqual(raised.exception.status_code, 404)
        self.assertIn("original computer or server", str(raised.exception))

    @patch("apps.admin_panel.storage.download_backup_blob", return_value=b"different-payload")
    def test_readback_checks_the_exact_bytes_and_bucket(self, download_mock):
        with self.assertRaisesMessage(BackupStorageError, "failed verification"):
            verify_backup_archive(object_path="backup.zip", storage_bucket="branch-backups", expected_payload=b"original")
        download_mock.assert_called_once_with(object_path="backup.zip", storage_bucket="branch-backups")

    @patch("apps.admin_panel.storage.get_storage_config", return_value=("https://project.supabase.co", "secret", "branch-backups"))
    @patch("apps.admin_panel.storage.request.urlopen")
    def test_cloud_errors_are_safe_and_distinguish_access_missing_and_unavailable(self, urlopen_mock, _config_mock):
        for code, body, expected_status, fragment in [
            (403, b'{}', 503, "access was denied"),
            (400, b'{"message":"Object not found"}', 404, "ZIP is missing"),
            (400, b'{"message":"Bucket not found"}', 503, "bucket is missing"),
            (500, b'{}', 503, "could not complete"),
        ]:
            with self.subTest(code=code, body=body):
                urlopen_mock.side_effect = HTTPError("https://project.supabase.co", code, "error", {}, io.BytesIO(body))
                with self.assertRaises(BackupStorageError) as raised:
                    download_backup_blob(object_path="backup.zip", storage_bucket="branch-backups")
                self.assertEqual(raised.exception.status_code, expected_status)
                self.assertIn(fragment, str(raised.exception))
                self.assertNotIn("secret", str(raised.exception))
        urlopen_mock.side_effect = URLError("network unavailable")
        with self.assertRaisesMessage(BackupStorageError, "temporarily unreachable"):
            download_backup_blob(object_path="backup.zip", storage_bucket="branch-backups")
