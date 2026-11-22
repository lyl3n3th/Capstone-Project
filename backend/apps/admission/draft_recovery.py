import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.supabase_rest import SupabaseRestClient

from .models import AdmissionDraftRecoveryChallenge
from .tracking_recovery import (
    TrackingRecoveryDeliveryError,
    is_email_delivery_configured,
    normalize_email,
    send_delivery_email,
)

logger = logging.getLogger(__name__)

CHALLENGE_LIFETIME = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(minutes=1)
CHALLENGE_ATTEMPT_LIMIT = 5
HOURLY_CHALLENGE_LIMIT = 5


def find_unsubmitted_draft(*, email, first_name, last_name):
    """Find a draft only when its saved email and both names match exactly."""
    client = SupabaseRestClient.from_settings()
    rows = client.select(
        "admission_applications",
        filters={
            "email": f"eq.{normalize_email(email)}",
            "application_status": "eq.draft",
            "submitted_at": "is.null",
        },
        select="id,tracking_number,first_name,last_name",
        order="updated_at.desc",
        limit=100,
    )

    normalized_first_name = first_name.strip().casefold()
    normalized_last_name = last_name.strip().casefold()
    for row in rows or []:
        if (
            str(row.get("first_name") or "").strip().casefold()
            != normalized_first_name
            or str(row.get("last_name") or "").strip().casefold()
            != normalized_last_name
            or not row.get("tracking_number")
            or not row.get("id")
        ):
            continue

        linked_students = client.select(
            "student_profiles",
            filters={"admission_application_id": f"eq.{row['id']}"},
            select="id",
            limit=1,
        )
        if not linked_students:
            return row

    return None


def _challenge_digest(challenge_id, code):
    message = f"{challenge_id}:{code}".encode("utf-8")
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256
    ).hexdigest()


def request_admission_draft_recovery(*, email, first_name, last_name):
    """Send a one-time code when strict draft matching finds an eligible record."""
    normalized_email = normalize_email(email)
    normalized_first_name = first_name.strip().casefold()
    normalized_last_name = last_name.strip().casefold()
    now = timezone.now()

    recent_challenges = AdmissionDraftRecoveryChallenge.objects.filter(
        email=normalized_email,
        first_name=normalized_first_name,
        last_name=normalized_last_name,
        created_at__gte=now - timedelta(hours=1),
    ).order_by("-created_at")
    recent_challenge = recent_challenges.first()
    if recent_challenges.count() >= HOURLY_CHALLENGE_LIMIT or (
        recent_challenge and recent_challenge.created_at >= now - RESEND_COOLDOWN
    ):
        return

    draft = find_unsubmitted_draft(
        email=normalized_email,
        first_name=normalized_first_name,
        last_name=normalized_last_name,
    )
    if not draft:
        return

    if not is_email_delivery_configured():
        logger.warning("Admission draft recovery email delivery is not configured.")
        return

    AdmissionDraftRecoveryChallenge.objects.filter(
        email=normalized_email,
        first_name=normalized_first_name,
        last_name=normalized_last_name,
        consumed_at__isnull=True,
    ).update(consumed_at=now)

    code = f"{secrets.randbelow(100_000_000):08d}"
    challenge = AdmissionDraftRecoveryChallenge.objects.create(
        email=normalized_email,
        first_name=normalized_first_name,
        last_name=normalized_last_name,
        tracking_number=draft["tracking_number"],
        code_digest="",
        expires_at=now + CHALLENGE_LIFETIME,
    )
    challenge.code_digest = _challenge_digest(challenge.pk, code)
    challenge.save(update_fields=["code_digest"])

    try:
        send_delivery_email(
            destination_email=normalized_email,
            subject="AICS admission draft verification code",
            message=(
                f"Your AICS admission draft verification code is {code}.\n\n"
                "Enter this code in the admission form to resume your unfinished "
                "application. The code expires in 10 minutes and can be used once. "
                "If you did not request this code, you can ignore this email."
            ),
        )
    except TrackingRecoveryDeliveryError:
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["consumed_at"])
        logger.exception("Unable to deliver an admission draft recovery code.")


def verify_admission_draft_recovery(*, email, first_name, last_name, code):
    """Consume a valid code and return its associated tracking number once."""
    normalized_email = normalize_email(email)
    normalized_first_name = first_name.strip().casefold()
    normalized_last_name = last_name.strip().casefold()
    now = timezone.now()
    current_draft = find_unsubmitted_draft(
        email=normalized_email,
        first_name=normalized_first_name,
        last_name=normalized_last_name,
    )
    if not current_draft:
        return None

    with transaction.atomic():
        challenge = (
            AdmissionDraftRecoveryChallenge.objects.select_for_update()
            .filter(
                email=normalized_email,
                first_name=normalized_first_name,
                last_name=normalized_last_name,
                consumed_at__isnull=True,
                expires_at__gt=now,
                attempts__lt=CHALLENGE_ATTEMPT_LIMIT,
            )
            .order_by("-created_at")
            .first()
        )
        if not challenge or challenge.tracking_number != current_draft["tracking_number"]:
            return None

        submitted_digest = _challenge_digest(challenge.pk, code)
        if not hmac.compare_digest(challenge.code_digest, submitted_digest):
            challenge.attempts += 1
            if challenge.attempts >= CHALLENGE_ATTEMPT_LIMIT:
                challenge.consumed_at = now
            challenge.save(update_fields=["attempts", "consumed_at"])
            return None

        challenge.consumed_at = now
        challenge.save(update_fields=["consumed_at"])
        return challenge.tracking_number
