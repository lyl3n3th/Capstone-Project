import json
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from apps.admission.models import AdmissionApplication, AdmissionRequirement
from apps.admission.tracking_recovery import (
    AdmissionDecisionNotificationTarget,
    AdmissionTrackingNotificationTarget,
    TrackingRecoveryMatch,
    build_decision_notification_email_message,
)


class AdmissionApiTests(TestCase):
    def test_step2_creates_admission_application(self):
        payload = {
            "tracking_number": "AICS-20260327-ABC123",
            "first_name": "Jane",
            "last_name": "Doe",
            "middle_name": "Q",
            "sex": "Female",
            "civil_status": "Single",
            "address": "123 Sample Street",
            "email": "jane@example.com",
            "contact": "0912 345 6789",
            "last_school_attended": "AICS High School",
            "year_completion": "2025",
            "program": "College",
            "strand_or_course": "BSIT - Bachelor of Science in Information Technology",
            "branch": "bacoor",
            "student_status": "Senior High Graduate",
            "honor": "With Honor (50%)",
            "apply_scholarship": True,
        }

        response = self.client.post(
            "/api/admissions/step2/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["tracking_number"], payload["tracking_number"])
        self.assertTrue(
            AdmissionApplication.objects.filter(
                tracking_number=payload["tracking_number"]
            ).exists()
        )

    def test_requirements_upload_saves_files(self):
        application = AdmissionApplication.objects.create(
            tracking_number="AICS-20260327-UPLOAD1",
            first_name="John",
            last_name="Doe",
            middle_name="",
            sex="Male",
            civil_status="Single",
            address="456 Example Avenue",
            email="john@example.com",
            contact="0912 555 6789",
            last_school_attended="AICS High School",
            year_completion="2024",
            program="Senior High School",
            strand_or_course="STEM - Science, Technology, Engineering, and Mathematics",
            branch="taytay",
            student_status="Junior High Completer",
            honor="No Honor",
            apply_scholarship=False,
        )

        upload = SimpleUploadedFile(
            "form137.pdf",
            b"fake-pdf-content",
            content_type="application/pdf",
        )

        response = self.client.post(
            "/api/admissions/requirements/",
            data={
                "trackingNumber": application.tracking_number,
                "Form 137": upload,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            AdmissionRequirement.objects.filter(application=application).count(), 1
        )


class AdmissionTrackingRecoveryApiTests(TestCase):
    def test_tracking_recovery_requires_registered_contacts(self):
        response = self.client.post(
            "/api/admissions/tracking-recovery/",
            data=json.dumps({"email": "", "mobile": ""}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("errors", response.json())

    @patch("apps.admission.views.deliver_tracking_recovery")
    @patch("apps.admission.views.find_matching_admission_applications")
    def test_tracking_recovery_returns_tracking_numbers(
        self,
        mock_find_matching_admission_applications,
        mock_deliver_tracking_recovery,
    ):
        mock_find_matching_admission_applications.return_value = [
            TrackingRecoveryMatch(
                tracking_number="AICS-20260422-REC123",
                application_status="submitted",
                created_at="2026-04-22T12:00:00+00:00",
            )
        ]
        mock_deliver_tracking_recovery.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            },
            "sms": {
                "status": "not_configured",
                "destination": "0912****789",
            },
        }

        response = self.client.post(
            "/api/admissions/tracking-recovery/",
            data=json.dumps(
                {
                    "email": "jane@example.com",
                    "mobile": "0912 345 6789",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["tracking_numbers"][0]["tracking_number"], "AICS-20260422-REC123")
        self.assertEqual(body["deliveries"]["email"]["status"], "sent")
        self.assertEqual(body["deliveries"]["sms"]["status"], "not_configured")

    @patch("apps.admission.views.find_matching_admission_applications")
    def test_tracking_recovery_returns_not_found_when_record_is_missing(
        self,
        mock_find_matching_admission_applications,
    ):
        mock_find_matching_admission_applications.return_value = []

        response = self.client.post(
            "/api/admissions/tracking-recovery/",
            data=json.dumps(
                {
                    "email": "missing@example.com",
                    "mobile": "09123456789",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.json())


class AdmissionSubmissionNotificationApiTests(TestCase):
    def test_submission_notification_requires_tracking_number(self):
        response = self.client.post(
            "/api/admissions/submission-notification/",
            data=json.dumps({}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("errors", response.json())

    @patch("apps.admission.views.deliver_submission_tracking_notification")
    @patch("apps.admission.views.find_tracking_notification_target")
    def test_submission_notification_sends_tracking_number(
        self,
        mock_find_tracking_notification_target,
        mock_deliver_submission_tracking_notification,
    ):
        mock_find_tracking_notification_target.return_value = (
            AdmissionTrackingNotificationTarget(
                tracking_number="AICS-20260422-SUB123",
                email="jane@example.com",
                phone_number="09123456789",
                first_name="Jane",
                last_name="Doe",
                application_status="submitted",
                submitted_at="2026-04-22T12:00:00+00:00",
                created_at="2026-04-22T10:00:00+00:00",
            )
        )
        mock_deliver_submission_tracking_notification.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            },
            "sms": {
                "status": "sent",
                "destination": "0912****789",
            },
        }

        response = self.client.post(
            "/api/admissions/submission-notification/",
            data=json.dumps({"trackingNumber": "AICS-20260422-SUB123"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["tracking_number"], "AICS-20260422-SUB123")
        self.assertEqual(body["deliveries"]["email"]["status"], "sent")
        self.assertEqual(body["deliveries"]["sms"]["status"], "sent")

    @patch("apps.admission.views.find_tracking_notification_target")
    @patch("apps.admission.views.deliver_submission_tracking_notification")
    def test_submission_notification_can_use_request_contact_details(
        self,
        mock_deliver_submission_tracking_notification,
        mock_find_tracking_notification_target,
    ):
        mock_deliver_submission_tracking_notification.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            },
            "sms": {
                "status": "not_configured",
                "destination": "0912****789",
            },
        }

        response = self.client.post(
            "/api/admissions/submission-notification/",
            data=json.dumps(
                {
                    "trackingNumber": "AICS-20260422-SUB124",
                    "email": "jane@example.com",
                    "mobile": "0912 345 6789",
                    "firstName": "Jane",
                    "lastName": "Doe",
                    "applicationStatus": "submitted",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        mock_find_tracking_notification_target.assert_not_called()
        delivered_target = mock_deliver_submission_tracking_notification.call_args.args[0]
        self.assertEqual(delivered_target.tracking_number, "AICS-20260422-SUB124")
        self.assertEqual(delivered_target.email, "jane@example.com")
        self.assertEqual(delivered_target.phone_number, "09123456789")

    @patch("apps.admission.views.find_tracking_notification_target")
    def test_submission_notification_returns_not_found_when_missing(
        self,
        mock_find_tracking_notification_target,
    ):
        mock_find_tracking_notification_target.return_value = None

        response = self.client.post(
            "/api/admissions/submission-notification/",
            data=json.dumps({"trackingNumber": "AICS-20260422-MISSING"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.json())


class AdmissionDecisionNotificationApiTests(TestCase):
    def test_decision_notification_requires_reason(self):
        response = self.client.post(
            "/api/admissions/decision-notification/",
            data=json.dumps({"email": "jane@example.com"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("errors", response.json())

    @patch("apps.admission.views.deliver_admission_decision_notification")
    def test_decision_notification_uses_supplied_email(self, mock_deliver):
        mock_deliver.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            }
        }

        response = self.client.post(
            "/api/admissions/decision-notification/",
            data=json.dumps(
                {
                    "email": "jane@example.com",
                    "fullName": "Jane Doe",
                    "trackingNumber": "AICS-20260425-DEC123",
                    "recordType": "admission",
                    "decisionStatus": "rejected",
                    "decisionReason": "Incomplete admission requirements",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        delivered_target = mock_deliver.call_args.args[0]
        self.assertIsInstance(delivered_target, AdmissionDecisionNotificationTarget)
        self.assertEqual(delivered_target.email, "jane@example.com")
        self.assertEqual(delivered_target.full_name, "Jane Doe")
        self.assertEqual(delivered_target.tracking_number, "AICS-20260425-DEC123")

    @patch("apps.admission.views.deliver_admission_decision_notification")
    def test_accepted_decision_notification_allows_missing_reason_and_portal_link(
        self,
        mock_deliver,
    ):
        mock_deliver.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            }
        }

        response = self.client.post(
            "/api/admissions/decision-notification/",
            data=json.dumps(
                {
                    "email": "jane@example.com",
                    "fullName": "Jane Doe",
                    "trackingNumber": "AICS-20260425-DEC200",
                    "studentNumber": "BAC-261001",
                    "recordType": "admission",
                    "decisionStatus": "accepted",
                    "portalLink": "http://localhost:5173/student/login?branch=Bacoor&studentNumber=BAC-261001",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        delivered_target = mock_deliver.call_args.args[0]
        self.assertEqual(delivered_target.student_number, "BAC-261001")
        self.assertEqual(
            delivered_target.portal_link,
            "http://localhost:5173/student/login?branch=Bacoor&studentNumber=BAC-261001",
        )

    @patch("apps.admission.views.deliver_admission_decision_notification")
    @patch("apps.admission.views.find_tracking_notification_target")
    def test_decision_notification_can_lookup_tracking_number(
        self,
        mock_find_tracking_notification_target,
        mock_deliver_admission_decision_notification,
    ):
        mock_find_tracking_notification_target.return_value = (
            AdmissionTrackingNotificationTarget(
                tracking_number="AICS-20260425-DEC124",
                email="jane@example.com",
                phone_number="09123456789",
                first_name="Jane",
                last_name="Doe",
                application_status="submitted",
                submitted_at="2026-04-25T08:00:00+00:00",
                created_at="2026-04-25T07:00:00+00:00",
            )
        )
        mock_deliver_admission_decision_notification.return_value = {
            "email": {
                "status": "sent",
                "destination": "ja***@example.com",
            }
        }

        response = self.client.post(
            "/api/admissions/decision-notification/",
            data=json.dumps(
                {
                    "trackingNumber": "AICS-20260425-DEC124",
                    "decisionStatus": "rejected",
                    "decisionReason": "Submitted documents are invalid or unreadable",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        delivered_target = mock_deliver_admission_decision_notification.call_args.args[0]
        self.assertEqual(delivered_target.email, "jane@example.com")
        self.assertEqual(delivered_target.full_name, "Jane Doe")

    @patch("apps.admission.views.find_tracking_notification_target")
    def test_decision_notification_returns_not_found_when_missing(
        self,
        mock_find_tracking_notification_target,
    ):
        mock_find_tracking_notification_target.return_value = None

        response = self.client.post(
            "/api/admissions/decision-notification/",
            data=json.dumps(
                {
                    "trackingNumber": "AICS-20260425-MISSING",
                    "decisionStatus": "rejected",
                    "decisionReason": "Incomplete admission requirements",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.json())

    def test_accepted_decision_email_includes_registration_note_before_sign_in(self):
        message = build_decision_notification_email_message(
            AdmissionDecisionNotificationTarget(
                email="jane@example.com",
                full_name="Jane Doe",
                tracking_number="AICS-20260425-DEC200",
                student_number="BAC-261001",
                record_type="admission",
                portal_link="http://localhost:5173/student/login?branch=Bacoor&studentNumber=BAC-261001",
            ),
            decision_status="accepted",
            decision_reason="",
        )

        self.assertIn(
            "You must register your student portal account first before signing in or accessing the student portal.",
            message,
        )
        self.assertIn(
            "Use the assigned student number above, together with your approved email address and mobile number, during portal registration.",
            message,
        )
