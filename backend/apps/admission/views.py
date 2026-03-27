import secrets
import string

from django.core.validators import validate_email
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AdmissionApplication, AdmissionRequirement

REQUIRED_STEP2_FIELDS = (
    "first_name",
    "last_name",
    "sex",
    "civil_status",
    "address",
    "email",
    "contact",
    "last_school_attended",
    "year_completion",
    "program",
    "strand_or_course",
    "branch",
    "student_status",
)


def generate_tracking_number():
    date_part = timezone.localdate().strftime("%Y%m%d")
    alphabet = string.ascii_uppercase + string.digits

    while True:
        random_part = "".join(secrets.choice(alphabet) for _ in range(6))
        tracking_number = f"AICS-{date_part}-{random_part}"
        if not AdmissionApplication.objects.filter(
            tracking_number=tracking_number
        ).exists():
            return tracking_number


def normalize_text(value):
    return value.strip() if isinstance(value, str) else value


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def validate_step2_payload(payload):
    errors = {}
    cleaned = {}

    for field in REQUIRED_STEP2_FIELDS:
        value = normalize_text(payload.get(field, ""))
        if not value:
            errors.setdefault(field, []).append("This field is required.")
        else:
            cleaned[field] = value

    cleaned["middle_name"] = normalize_text(payload.get("middle_name", "")) or ""
    cleaned["honor"] = normalize_text(payload.get("honor", "")) or "No Honor"
    cleaned["apply_scholarship"] = parse_bool(
        payload.get("apply_scholarship", False)
    )

    email = cleaned.get("email")
    if email:
        try:
            validate_email(email)
        except Exception:
            errors.setdefault("email", []).append("Enter a valid email address.")

    year_completion = cleaned.get("year_completion", "")
    if year_completion and (not year_completion.isdigit() or len(year_completion) != 4):
        errors.setdefault("year_completion", []).append(
            "Enter a valid 4-digit year."
        )

    return cleaned, errors


class AdmissionStep2View(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        cleaned, errors = validate_step2_payload(request.data)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        tracking_number = (
            normalize_text(request.data.get("tracking_number", ""))
            or normalize_text(request.data.get("trackingNumber", ""))
            or generate_tracking_number()
        )

        application, created = AdmissionApplication.objects.get_or_create(
            tracking_number=tracking_number,
            defaults=cleaned,
        )

        if not created:
            for field, value in cleaned.items():
                setattr(application, field, value)
            application.save()

        return Response(
            {
                "tracking_number": application.tracking_number,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RequirementsUploadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        tracking_number = (
            normalize_text(request.data.get("tracking_number", ""))
            or normalize_text(request.data.get("trackingNumber", ""))
        )

        if not tracking_number:
            return Response(
                {
                    "errors": {
                        "tracking_number": ["Tracking number is required."]
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            application = AdmissionApplication.objects.get(
                tracking_number=tracking_number
            )
        except AdmissionApplication.DoesNotExist:
            return Response(
                {
                    "errors": {
                        "tracking_number": ["No admission record was found."]
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not request.FILES:
            return Response(
                {"errors": {"files": ["Upload at least one requirement file."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_files = []
        for requirement_name, uploaded_file in request.FILES.items():
            requirement, _ = AdmissionRequirement.objects.update_or_create(
                application=application,
                requirement_name=requirement_name,
                defaults={"file": uploaded_file},
            )
            uploaded_files.append(
                {
                    "requirement_name": requirement.requirement_name,
                    "file_name": uploaded_file.name,
                }
            )

        application.requirements_uploaded_at = timezone.now()
        application.save(update_fields=["requirements_uploaded_at", "updated_at"])

        return Response(
            {
                "tracking_number": application.tracking_number,
                "uploaded": uploaded_files,
            },
            status=status.HTTP_201_CREATED,
        )
