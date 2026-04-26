import base64
from dataclasses import asdict, dataclass
from urllib import error, parse, request

from django.conf import settings
from django.core.mail import send_mail

from apps.core.supabase_rest import SupabaseRestClient


class TrackingRecoveryDeliveryError(RuntimeError):
    """Raised when tracking-number delivery fails."""


@dataclass(frozen=True)
class TrackingRecoveryMatch:
    tracking_number: str
    application_status: str
    created_at: str | None

    def to_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class AdmissionTrackingNotificationTarget:
    tracking_number: str
    email: str
    phone_number: str
    first_name: str | None
    last_name: str | None
    application_status: str
    submitted_at: str | None
    created_at: str | None


@dataclass(frozen=True)
class AdmissionDecisionNotificationTarget:
    email: str
    full_name: str | None
    tracking_number: str
    student_number: str
    record_type: str


def build_tracking_notification_target(
    *,
    tracking_number,
    email="",
    phone_number="",
    first_name=None,
    last_name=None,
    application_status="submitted",
    submitted_at=None,
    created_at=None,
):
    return AdmissionTrackingNotificationTarget(
        tracking_number=normalize_tracking_number(tracking_number),
        email=normalize_email(email),
        phone_number=normalize_phone_number(phone_number),
        first_name=first_name.strip() if isinstance(first_name, str) and first_name.strip() else None,
        last_name=last_name.strip() if isinstance(last_name, str) and last_name.strip() else None,
        application_status=(application_status or "submitted").strip().lower(),
        submitted_at=submitted_at,
        created_at=created_at,
    )


def build_decision_notification_target(
    *,
    email="",
    full_name=None,
    tracking_number="",
    student_number="",
    record_type="admission",
):
    return AdmissionDecisionNotificationTarget(
        email=normalize_email(email),
        full_name=full_name.strip() if isinstance(full_name, str) and full_name.strip() else None,
        tracking_number=normalize_tracking_number(tracking_number),
        student_number=student_number.strip() if isinstance(student_number, str) else "",
        record_type=(record_type or "admission").strip().lower(),
    )


def normalize_email(value):
    return value.strip().lower() if isinstance(value, str) else ""


def normalize_phone_number(value):
    if not isinstance(value, str):
        return ""
    return "".join(character for character in value if character.isdigit())


def normalize_tracking_number(value):
    return value.strip().upper() if isinstance(value, str) else ""


def mask_email_address(value):
    normalized = normalize_email(value)
    if "@" not in normalized:
        return normalized

    local_part, domain = normalized.split("@", 1)
    if len(local_part) <= 2:
        masked_local = f"{local_part[:1]}*" if local_part else "*"
    else:
        masked_local = f"{local_part[:2]}{'*' * max(len(local_part) - 2, 2)}"

    return f"{masked_local}@{domain}"


def mask_phone_number(value):
    digits = normalize_phone_number(value)
    if len(digits) <= 4:
        return digits
    if len(digits) <= 7:
        return f"{digits[:2]}{'*' * max(len(digits) - 4, 1)}{digits[-2:]}"
    return f"{digits[:4]}{'*' * max(len(digits) - 7, 1)}{digits[-3:]}"


def format_sms_destination(value):
    stripped_value = value.strip() if isinstance(value, str) else ""
    digits = normalize_phone_number(stripped_value)

    if stripped_value.startswith("+") and digits:
        return f"+{digits}"

    if len(digits) == 11 and digits.startswith("0"):
        return f"+63{digits[1:]}"

    if len(digits) == 12 and digits.startswith("63"):
        return f"+{digits}"

    return f"+{digits}" if digits else ""


def is_email_delivery_configured():
    return bool(
        getattr(settings, "DEFAULT_FROM_EMAIL", "")
        and getattr(settings, "EMAIL_HOST", "")
    )


def is_sms_delivery_configured():
    return bool(
        getattr(settings, "TWILIO_ACCOUNT_SID", "")
        and getattr(settings, "TWILIO_AUTH_TOKEN", "")
        and getattr(settings, "TWILIO_FROM_NUMBER", "")
    )


def send_delivery_email(*, destination_email, subject, message):
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[normalize_email(destination_email)],
            fail_silently=False,
        )
    except Exception as exc:  # pragma: no cover - exercised via mocked tests
        raise TrackingRecoveryDeliveryError(
            "Unable to send the admission email right now."
        ) from exc


def send_delivery_sms(*, destination_phone_number, message):
    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "")
    auth_token = getattr(settings, "TWILIO_AUTH_TOKEN", "")
    from_number = getattr(settings, "TWILIO_FROM_NUMBER", "")

    payload = parse.urlencode(
        {
            "To": format_sms_destination(destination_phone_number),
            "From": from_number,
            "Body": message,
        }
    ).encode("utf-8")
    auth_header = base64.b64encode(
        f"{account_sid}:{auth_token}".encode("utf-8")
    ).decode("ascii")
    sms_request = request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with request.urlopen(sms_request, timeout=30) as response:
            response.read()
    except error.HTTPError as exc:  # pragma: no cover - exercised via mocked tests
        raise TrackingRecoveryDeliveryError(
            "Unable to send the tracking number by SMS right now."
        ) from exc
    except error.URLError as exc:  # pragma: no cover - exercised via mocked tests
        raise TrackingRecoveryDeliveryError(
            f"Unable to reach the SMS provider right now: {exc.reason}"
        ) from exc


def deliver_tracking_message(*, email, phone_number, email_subject, email_message, sms_message):
    normalized_email = normalize_email(email)
    normalized_phone_number = normalize_phone_number(phone_number)
    email_delivery = {
        "status": "not_configured",
        "destination": mask_email_address(normalized_email),
    }
    sms_delivery = {
        "status": "not_configured",
        "destination": mask_phone_number(normalized_phone_number),
    }

    if normalized_email and is_email_delivery_configured():
        try:
            send_delivery_email(
                destination_email=normalized_email,
                subject=email_subject,
                message=email_message,
            )
            email_delivery["status"] = "sent"
        except TrackingRecoveryDeliveryError as exc:
            email_delivery["status"] = "failed"
            email_delivery["error"] = str(exc)

    if normalized_phone_number and is_sms_delivery_configured():
        try:
            send_delivery_sms(
                destination_phone_number=normalized_phone_number,
                message=sms_message,
            )
            sms_delivery["status"] = "sent"
        except TrackingRecoveryDeliveryError as exc:
            sms_delivery["status"] = "failed"
            sms_delivery["error"] = str(exc)

    return {
        "email": email_delivery,
        "sms": sms_delivery,
    }


def build_application_status_copy(application_status):
    normalized_status = (application_status or "").strip().lower()

    if normalized_status in {"submitted", "under_review", "accepted"}:
        return "has been submitted successfully"
    if normalized_status == "draft":
        return "has been saved"
    if normalized_status == "rejected":
        return "needs follow-up"

    return "has been updated"


def get_support_email_line():
    support_email = getattr(settings, "ADMISSION_SUPPORT_EMAIL", "")
    return (
        f"For assistance, contact: {support_email}"
        if support_email
        else ""
    )


def get_record_type_copy(record_type):
    normalized_type = (record_type or "").strip().lower()

    if normalized_type == "enrollment":
        return "enrollment request"

    return "admission application"


def build_decision_reference_line(target):
    if target.record_type == "enrollment" and target.student_number:
        return f"Student Number: {target.student_number}"
    if target.tracking_number:
        return f"Tracking Number: {target.tracking_number}"
    if target.student_number:
        return f"Student Number: {target.student_number}"
    return ""


def build_submission_confirmation_email_message(target):
    applicant_name = " ".join(
        part for part in [target.first_name, target.last_name] if part
    ).strip() or "Applicant"
    status_copy = build_application_status_copy(target.application_status)
    support_email_line = get_support_email_line()
    lines = [
        f"Hello {applicant_name},",
        "",
        f"Your AICS admission application {status_copy}.",
        f"Tracking Number: {target.tracking_number}",
        "",
        "Keep this tracking number for status updates and future reference.",
    ]

    if support_email_line:
        lines.extend(["", support_email_line])

    return "\n".join(lines)


def build_decision_notification_email_message(target, *, decision_status, decision_reason):
    recipient_name = target.full_name or "Student"
    record_copy = get_record_type_copy(target.record_type)
    support_email_line = get_support_email_line()
    normalized_status = (decision_status or "").strip().lower()
    reference_line = build_decision_reference_line(target)

    if normalized_status == "accepted":
        decision_copy = (
            f"After reviewing your AICS {record_copy}, we are pleased to let you know "
            "that it has been approved."
        )
    else:
        decision_copy = (
            f"After reviewing your AICS {record_copy}, we regret to inform you "
            "that it has been rejected at this time."
        )

    lines = [
        f"Hello {recipient_name},",
        "",
        decision_copy,
    ]

    if decision_reason:
        lines.extend(["", f"Reason: {decision_reason}"])

    if reference_line:
        lines.extend(["", reference_line])

    lines.extend(
        [
            "",
            "Please coordinate with the admissions or registrar office if you need clarification or the next steps for your record.",
        ]
    )

    if support_email_line:
        lines.extend(["", support_email_line])

    return "\n".join(lines)


def build_submission_confirmation_sms_message(target):
    status_copy = build_application_status_copy(target.application_status)
    return (
        f"AICS admission update: Your application {status_copy}. "
        f"Tracking no: {target.tracking_number}. Keep this for reference."
    )


def build_tracking_recovery_message(matches):
    lines = [
        "Asian Institute of Computer Studies",
        "Admission Tracking Number Recovery",
        "",
        "We found the following admission tracking number(s) for your registered contact details:",
        "",
    ]

    for match in matches:
        lines.append(
            f"- {match.tracking_number} ({match.application_status.replace('_', ' ').title()})"
        )

    lines.extend(
        [
            "",
            "You can use any of the tracking number(s) above on the admission portal to continue your application or check its status.",
        ]
    )

    support_email_line = get_support_email_line()
    if support_email_line:
        lines.extend(["", support_email_line])

    return "\n".join(lines)


def build_tracking_recovery_sms_message(matches):
    return "AICS tracking number recovery: " + ", ".join(
        match.tracking_number for match in matches
    )


def find_matching_admission_applications(*, email, phone_number):
    client = SupabaseRestClient.from_settings()
    normalized_email = normalize_email(email)
    normalized_phone_number = normalize_phone_number(phone_number)
    rows = client.select(
        "admission_applications",
        filters={
            "email": f"eq.{normalized_email}",
            "phone_number": f"eq.{normalized_phone_number}",
            "application_status": "neq.cancelled",
        },
        select="tracking_number,application_status,created_at",
        order="created_at.desc",
        limit=5,
    )

    return [
        TrackingRecoveryMatch(
            tracking_number=row["tracking_number"],
            application_status=row.get("application_status") or "draft",
            created_at=row.get("created_at"),
        )
        for row in (rows or [])
        if row.get("tracking_number")
    ]


def find_tracking_notification_target(tracking_number):
    client = SupabaseRestClient.from_settings()
    rows = client.select(
        "admission_applications",
        filters={
            "tracking_number": f"eq.{normalize_tracking_number(tracking_number)}",
            "application_status": "neq.cancelled",
        },
        select=(
            "tracking_number,email,phone_number,first_name,last_name,"
            "application_status,submitted_at,created_at"
        ),
        limit=1,
    )

    if not rows:
        return None

    row = rows[0]
    return build_tracking_notification_target(
        tracking_number=row["tracking_number"],
        email=row.get("email") or "",
        phone_number=row.get("phone_number") or "",
        first_name=row.get("first_name"),
        last_name=row.get("last_name"),
        application_status=row.get("application_status") or "submitted",
        submitted_at=row.get("submitted_at"),
        created_at=row.get("created_at"),
    )


def deliver_tracking_recovery(*, email, phone_number, matches):
    return deliver_tracking_message(
        email=email,
        phone_number=phone_number,
        email_subject="AICS admission tracking number recovery",
        email_message=build_tracking_recovery_message(matches),
        sms_message=build_tracking_recovery_sms_message(matches),
    )


def deliver_submission_tracking_notification(target):
    return deliver_tracking_message(
        email=target.email,
        phone_number=target.phone_number,
        email_subject="AICS admission tracking number confirmation",
        email_message=build_submission_confirmation_email_message(target),
        sms_message=build_submission_confirmation_sms_message(target),
    )


def deliver_admission_decision_notification(
    target,
    *,
    decision_status,
    decision_reason,
):
    normalized_email = normalize_email(target.email)
    email_delivery = {
        "status": "not_configured",
        "destination": mask_email_address(normalized_email),
    }

    if normalized_email and is_email_delivery_configured():
        try:
            send_delivery_email(
                destination_email=normalized_email,
                subject=(
                    f"AICS {get_record_type_copy(target.record_type)} "
                    f"{(decision_status or 'updated').strip().lower()}"
                ),
                message=build_decision_notification_email_message(
                    target,
                    decision_status=decision_status,
                    decision_reason=decision_reason,
                ),
            )
            email_delivery["status"] = "sent"
        except TrackingRecoveryDeliveryError as exc:
            email_delivery["status"] = "failed"
            email_delivery["error"] = str(exc)

    return {
        "email": email_delivery,
    }
