import re

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import StaffAccount


class StaffAccountApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def create_staff_account(self, **overrides):
        payload = {
            "first_name": "Neil",
            "last_name": "Velasco",
            "role": "admin",
            "branch": "GMA",
            "email": "neil.velasco@example.com",
            "contact_number": "09123456789",
            "address": "GMA, Cavite",
            "password": "StrongPass123",
            "status": "active",
        }
        payload.update(overrides)
        return self.client.post("/api/staff/", payload, format="json")

    def test_create_staff_account_generates_branch_employee_id(self):
        response = self.create_staff_account(branch="Bacoor")

        self.assertEqual(response.status_code, 201)
        self.assertRegex(
            response.data["employee_id"],
            re.compile(r"^AICS-BACOOR-[A-Z0-9]{6}$"),
        )

    def test_staff_login_uses_employee_id_and_password(self):
        create_response = self.create_staff_account(role="registrar")
        employee_id = create_response.data["employee_id"]

        response = self.client.post(
            "/api/staff/login/",
            {
                "employee_id": employee_id,
                "password": "StrongPass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "registrar")
        self.assertEqual(response.data["employee_id"], employee_id)

    def test_updating_branch_regenerates_employee_id(self):
        create_response = self.create_staff_account(branch="GMA")
        original_employee_id = create_response.data["employee_id"]

        update_payload = {
            "first_name": "Neil",
            "last_name": "Velasco",
            "role": "admin",
            "branch": "Taytay",
            "email": "neil.velasco@example.com",
            "contact_number": "09123456789",
            "address": "Taytay, Rizal",
            "status": "active",
        }
        response = self.client.put(
            f"/api/staff/{original_employee_id}/",
            update_payload,
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data["employee_id"], original_employee_id)
        self.assertTrue(response.data["employee_id"].startswith("AICS-TAYTAY-"))

    def test_trashed_account_cannot_log_in(self):
        create_response = self.create_staff_account()
        employee_id = create_response.data["employee_id"]

        trash_response = self.client.patch(
            f"/api/staff/{employee_id}/trash/",
            {"is_trashed": True},
            format="json",
        )

        login_response = self.client.post(
            "/api/staff/login/",
            {
                "employee_id": employee_id,
                "password": "StrongPass123",
            },
            format="json",
        )

        self.assertEqual(trash_response.status_code, 200)
        self.assertEqual(login_response.status_code, 401)
        self.assertTrue(
            StaffAccount.objects.filter(employee_id=employee_id, is_trashed=True).exists()
        )
