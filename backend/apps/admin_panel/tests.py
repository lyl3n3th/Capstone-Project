from datetime import datetime, time, timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.admin_panel.automation import is_automated_backup_due
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
