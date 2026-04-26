import secrets
import string

from apps.core.supabase_rest import SupabaseRestError
from django.core.exceptions import ImproperlyConfigured
from django.core.validators import validate_email
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AdmissionApplication, AdmissionRequirement
from .tracking_recovery import (
    build_decision_notification_target,
    build_tracking_notification_target,
    deliver_admission_decision_notification,
    deliver_submission_tracking_notification,
    deliver_tracking_recovery,
    find_matching_admission_applications,
    find_tracking_notification_target,
    normalize_phone_number,
    normalize_tracking_number,
)

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


def validate_tracking_recovery_payload(payload):
    errors = {}
    cleaned = {}

    email = normalize_text(payload.get("email", ""))
    mobile = normalize_text(
        payload.get("mobile", payload.get("phone_number", payload.get("phoneNumber", "")))
    )

    if not email:
        errors.setdefault("email", []).append("Email address is required.")
    else:
        try:
            validate_email(email)
        except Exception:
            errors.setdefault("email", []).append("Enter a valid email address.")
        cleaned["email"] = email

    normalized_mobile = normalize_phone_number(mobile)
    if not normalized_mobile:
        errors.setdefault("mobile", []).append("Mobile number is required.")
    elif len(normalized_mobile) < 10:
        errors.setdefault("mobile", []).append("Enter a valid mobile number.")
    cleaned["mobile"] = normalized_mobile

    return cleaned, errors


def validate_tracking_number_payload(payload):
    errors = {}
    tracking_number = normalize_tracking_number(
        payload.get("tracking_number", payload.get("trackingNumber", ""))
    )

    if not tracking_number:
        errors.setdefault("tracking_number", []).append(
            "Tracking number is required."
        )

    return tracking_number, errors


def validate_submission_notification_payload(payload):
    tracking_number, errors = validate_tracking_number_payload(payload)
    cleaned = {
        "tracking_number": tracking_number,
        "email": normalize_text(payload.get("email", "")) or "",
        "mobile": normalize_text(
            payload.get("mobile", payload.get("phone_number", payload.get("phoneNumber", "")))
        )
        or "",
        "first_name": normalize_text(
            payload.get("first_name", payload.get("firstName", ""))
        )
        or "",
        "last_name": normalize_text(
            payload.get("last_name", payload.get("lastName", ""))
        )
        or "",
        "application_status": normalize_text(
            payload.get("application_status", payload.get("applicationStatus", "submitted"))
        )
        or "submitted",
    }

    if cleaned["email"]:
        try:
            validate_email(cleaned["email"])
        except Exception:
            errors.setdefault("email", []).append("Enter a valid email address.")

    normalized_mobile = normalize_phone_number(cleaned["mobile"])
    if cleaned["mobile"] and len(normalized_mobile) < 10:
        errors.setdefault("mobile", []).append("Enter a valid mobile number.")
    cleaned["mobile"] = normalized_mobile

    return cleaned, errors


def validate_decision_notification_payload(payload):
    errors = {}
    cleaned = {
        "tracking_number": normalize_tracking_number(
            payload.get("tracking_number", payload.get("trackingNumber", ""))
        ),
        "student_number": normalize_text(
            payload.get("student_number", payload.get("studentNumber", ""))
        )
        or "",
        "email": normalize_text(payload.get("email", "")) or "",
        "full_name": normalize_text(
            payload.get("full_name", payload.get("fullName", ""))
        )
        or "",
        "decision_status": (
            normalize_text(
                payload.get(
                    "decision_status",
                    payload.get("decisionStatus", "rejected"),
                )
            )
            or "rejected"
        ).lower(),
        "decision_reason": normalize_text(
            payload.get("decision_reason", payload.get("decisionReason", ""))
        )
        or "",
        "record_type": (
            normalize_text(
                payload.get("record_type", payload.get("recordType", "admission"))
            )
            or "admission"
        ).lower(),
    }

    if not cleaned["decision_reason"]:
        errors.setdefault("decision_reason", []).append(
            "Decision reason is required."
        )

    if cleaned["email"]:
        try:
            validate_email(cleaned["email"])
        except Exception:
            errors.setdefault("email", []).append("Enter a valid email address.")

    if not cleaned["email"] and not cleaned["tracking_number"]:
        errors.setdefault("email", []).append(
            "Email address is required when no tracking number is provided."
        )

    if cleaned["decision_status"] not in {"accepted", "rejected"}:
        errors.setdefault("decision_status", []).append(
            "Decision status must be accepted or rejected."
        )

    if cleaned["record_type"] not in {"admission", "enrollment"}:
        errors.setdefault("record_type", []).append(
            "Record type must be admission or enrollment."
        )

    return cleaned, errors


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


class AdmissionTrackingRecoveryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        cleaned, errors = validate_tracking_recovery_payload(request.data)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            matches = find_matching_admission_applications(
                email=cleaned["email"],
                phone_number=cleaned["mobile"],
            )
        except (ImproperlyConfigured, SupabaseRestError) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not matches:
            return Response(
                {
                    "detail": "No active admission record matched the provided email and mobile number."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        deliveries = deliver_tracking_recovery(
            email=cleaned["email"],
            phone_number=cleaned["mobile"],
            matches=matches,
        )

        any_delivery_sent = any(
            delivery.get("status") == "sent" for delivery in deliveries.values()
        )
        message = (
            "Tracking number recovered and sent to your registered contact details."
            if any_delivery_sent
            else "Tracking number recovered. Messaging is not configured, so the matching record is shown below."
        )

        return Response(
            {
                "message": message,
                "tracking_numbers": [match.to_dict() for match in matches],
                "deliveries": deliveries,
            },
            status=status.HTTP_200_OK,
        )


class AdmissionSubmissionNotificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        cleaned, errors = validate_submission_notification_payload(request.data)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        notification_target = None

        if cleaned["email"] or cleaned["mobile"]:
            notification_target = build_tracking_notification_target(
                tracking_number=cleaned["tracking_number"],
                email=cleaned["email"],
                phone_number=cleaned["mobile"],
                first_name=cleaned["first_name"],
                last_name=cleaned["last_name"],
                application_status=cleaned["application_status"],
            )

        if notification_target is None:
            try:
                notification_target = find_tracking_notification_target(
                    cleaned["tracking_number"],
                )
            except (ImproperlyConfigured, SupabaseRestError) as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

        if not notification_target:
            return Response(
                {"detail": "No admission record matched this tracking number."},
                status=status.HTTP_404_NOT_FOUND,
            )

        deliveries = deliver_submission_tracking_notification(
            notification_target,
        )
        any_delivery_sent = any(
            delivery.get("status") == "sent" for delivery in deliveries.values()
        )
        message = (
            "Tracking number confirmation sent to the registered contact details."
            if any_delivery_sent
            else "Tracking number confirmation prepared, but messaging is not configured."
        )

        return Response(
            {
                "message": message,
                "tracking_number": notification_target.tracking_number,
                "deliveries": deliveries,
            },
            status=status.HTTP_200_OK,
        )


class AdmissionDecisionNotificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        cleaned, errors = validate_decision_notification_payload(request.data)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        notification_target = None

        if cleaned["email"]:
            notification_target = build_decision_notification_target(
                email=cleaned["email"],
                full_name=cleaned["full_name"],
                tracking_number=cleaned["tracking_number"],
                student_number=cleaned["student_number"],
                record_type=cleaned["record_type"],
            )
        else:
            try:
                tracking_target = find_tracking_notification_target(
                    cleaned["tracking_number"],
                )
            except (ImproperlyConfigured, SupabaseRestError) as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            if not tracking_target:
                return Response(
                    {"detail": "No admission record matched this tracking number."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            notification_target = build_decision_notification_target(
                email=tracking_target.email,
                full_name=" ".join(
                    part
                    for part in [
                        tracking_target.first_name,
                        tracking_target.last_name,
                    ]
                    if part
                ),
                tracking_number=tracking_target.tracking_number,
                student_number=cleaned["student_number"],
                record_type=cleaned["record_type"],
            )

        deliveries = deliver_admission_decision_notification(
            notification_target,
            decision_status=cleaned["decision_status"],
            decision_reason=cleaned["decision_reason"],
        )
        email_sent = deliveries["email"].get("status") == "sent"
        message = (
            "Decision email sent to the applicant."
            if email_sent
            else "Decision email prepared, but delivery is not configured."
        )

        return Response(
            {
                "message": message,
                "tracking_number": notification_target.tracking_number,
                "deliveries": deliveries,
            },
            status=status.HTTP_200_OK,
        )
