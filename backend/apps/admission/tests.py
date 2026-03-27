import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from apps.admission.models import AdmissionApplication, AdmissionRequirement


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
