import io
import json
import zipfile
from datetime import datetime, time, timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.admin_panel.automation import is_automated_backup_due
from apps.admin_panel.models import BackupHistory
from apps.admin_panel.repository import BackupSettingsRecord


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

    @patch("apps.admin_panel.services.upload_backup_blob")
    def test_upload_backup_archive_creates_completed_history_entry(self, upload_blob_mock):
        upload_blob_mock.return_value = (
            "local-media",
            "branches/bacoor/uploads/bacoor_backup.zip",
        )

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

    @patch("apps.admin_panel.views.download_backup_blob")
    def test_download_backup_archive_returns_zip_attachment(self, download_blob_mock):
        download_blob_mock.return_value = b"zip-payload"
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
