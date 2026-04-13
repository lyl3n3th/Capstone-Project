from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import StaffAccount
from apps.manager.models import Branch, ManagerProfile, Report

User = get_user_model()


class ReportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.branch = Branch.objects.get(branch_name="Bacoor")

        self.branch_admin_user = User.objects.create_user(
            username="branch-admin",
            password="StrongPass123",
            first_name="Branch",
            last_name="Admin",
        )
        self.branch_admin_account = StaffAccount.objects.create(
            user=self.branch_admin_user,
            employee_id="AICS-BACOOR-ADMIN1",
            role="admin",
            branch="Bacoor",
            email="branch.admin@example.com",
            contact_number="09123456789",
            address="Bacoor, Cavite",
            status="active",
        )

        self.registrar_user = User.objects.create_user(
            username="registrar",
            password="StrongPass123",
            first_name="Reg",
            last_name="User",
        )
        StaffAccount.objects.create(
            user=self.registrar_user,
            employee_id="AICS-BACOOR-REG001",
            role="registrar",
            branch="Bacoor",
            email="registrar@example.com",
            contact_number="09123456788",
            address="Bacoor, Cavite",
            status="active",
        )

        self.manager_user = User.objects.create_user(
            username="area-manager",
            password="StrongPass123",
            first_name="Area",
            last_name="Manager",
        )
        ManagerProfile.objects.create(user=self.manager_user, full_name="Area Manager")

        self.report = Report.objects.create(
            sender=self.branch_admin_user,
            branch=self.branch,
            subject="Weekly Enrollment",
            message="Enrollment increased by 12%.",
        )

    @patch("apps.manager.views.upload_report_attachment")
    def test_branch_admin_can_create_report_with_attachment(self, mock_upload):
        mock_upload.return_value = "https://example.supabase.co/storage/v1/object/public/reports/file.pdf"
        self.client.force_authenticate(user=self.branch_admin_user)

        upload = SimpleUploadedFile(
            "report.pdf",
            b"pdf-content",
            content_type="application/pdf",
        )

        response = self.client.post(
            "/api/manager/reports/",
            {
                "branch": "Bacoor",
                "subject": "Monthly Report",
                "message": "Attached is the monthly report.",
                "attachment": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sender_name"], "Branch Admin")
        self.assertEqual(response.data["branch_name"], "Bacoor")
        self.assertEqual(
            response.data["attachment_url"],
            "https://example.supabase.co/storage/v1/object/public/reports/file.pdf",
        )

    def test_branch_admin_can_create_report_from_frontend_headers(self):
        response = self.client.post(
            "/api/manager/reports/",
            {
                "branch": "Bacoor",
                "subject": "Header Based Report",
                "message": "Created from frontend session headers.",
            },
            format="multipart",
            HTTP_X_EMPLOYEE_ID="SUPABASE-ADMIN-001",
            HTTP_X_USER_ROLE="admin",
            HTTP_X_USER_BRANCH="Bacoor",
            HTTP_X_USER_NAME="Supabase Admin",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sender_name"], "Supabase Admin")
        self.assertEqual(response.data["branch_name"], "Bacoor")

    def test_non_branch_admin_cannot_create_report(self):
        self.client.force_authenticate(user=self.registrar_user)

        response = self.client.post(
            "/api/manager/reports/",
            {
                "branch": "Bacoor",
                "subject": "Monthly Report",
                "message": "Attached is the monthly report.",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 403)

    def test_area_manager_can_view_inbox_and_trash(self):
        self.report.is_deleted = True
        self.report.save(update_fields=["is_deleted"])
        self.client.force_authenticate(user=self.manager_user)

        inbox_response = self.client.get("/api/manager/reports/inbox/")
        trash_response = self.client.get("/api/manager/reports/trash/")

        self.assertEqual(inbox_response.status_code, 200)
        self.assertEqual(trash_response.status_code, 200)
        self.assertEqual(len(inbox_response.data), 0)
        self.assertEqual(len(trash_response.data), 1)

    def test_area_manager_can_soft_delete_restore_and_permanently_delete_report(self):
        self.client.force_authenticate(user=self.manager_user)

        soft_delete_response = self.client.patch(
            f"/api/manager/reports/{self.report.id}/soft-delete/",
            {},
            format="json",
        )
        self.assertEqual(soft_delete_response.status_code, 200)
        self.report.refresh_from_db()
        self.assertTrue(self.report.is_deleted)

        restore_response = self.client.patch(
            f"/api/manager/reports/{self.report.id}/restore/",
            {},
            format="json",
        )
        self.assertEqual(restore_response.status_code, 200)
        self.report.refresh_from_db()
        self.assertFalse(self.report.is_deleted)

        delete_response = self.client.delete(f"/api/manager/reports/{self.report.id}/")
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Report.objects.filter(pk=self.report.id).exists())

    def test_branch_admin_cannot_access_trash_or_delete_actions(self):
        self.client.force_authenticate(user=self.branch_admin_user)

        trash_response = self.client.get("/api/manager/reports/trash/")
        delete_response = self.client.delete(f"/api/manager/reports/{self.report.id}/")

        self.assertEqual(trash_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
