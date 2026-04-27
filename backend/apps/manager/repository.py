from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify

from apps.core.models import BRANCH_CHOICES
from apps.core.supabase_rest import SupabaseRestClient, is_supabase_feature_enabled

from .models import Branch, Report


User = get_user_model()
VALID_BRANCHES = {value for value, _label in BRANCH_CHOICES}


@dataclass
class ReportRecord:
    id: str
    sender: str | None
    sender_name: str
    branch: str
    branch_name: str
    subject: str
    message: str
    attachment_url: str
    is_deleted: bool
    is_reviewed: bool
    reviewed_at: object
    created_at: object


def use_supabase_reports():
    return is_supabase_feature_enabled("USE_SUPABASE_REPORTS")


def _client():
    return SupabaseRestClient.from_settings()


def _normalize_datetime(value):
    if value is None or hasattr(value, "tzinfo"):
        return value
    return parse_datetime(str(value))


def _report_from_model(report):
    full_name = report.sender.get_full_name().strip()
    return ReportRecord(
        id=str(report.id),
        sender=str(report.sender_id),
        sender_name=full_name or report.sender.username,
        branch=report.branch.branch_name,
        branch_name=report.branch.branch_name,
        subject=report.subject,
        message=report.message,
        attachment_url=report.attachment_url or "",
        is_deleted=report.is_deleted,
        is_reviewed=report.is_reviewed,
        reviewed_at=report.reviewed_at,
        created_at=report.created_at,
    )


def _report_from_row(row):
    return ReportRecord(
        id=str(row["id"]),
        sender=str(row["sender"]) if row.get("sender") is not None else None,
        sender_name=row.get("sender_name") or "Unknown Sender",
        branch=row.get("branch") or "",
        branch_name=row.get("branch") or "",
        subject=row.get("subject") or "",
        message=row.get("message") or "",
        attachment_url=row.get("attachment_url") or "",
        is_deleted=bool(row.get("is_deleted")),
        is_reviewed=bool(row.get("is_reviewed")),
        reviewed_at=_normalize_datetime(row.get("reviewed_at")),
        created_at=_normalize_datetime(row.get("created_at")),
    )


def _ensure_sender_user(sender_user, sender_identifier, sender_name, branch_name):
    if sender_user is not None:
        return sender_user

    username = sender_identifier or f"report-admin-{slugify(sender_name) or slugify(branch_name)}"
    defaults = {}

    if sender_name:
        name_parts = sender_name.split()
        defaults["first_name"] = name_parts[0]
        defaults["last_name"] = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    user, created = User.objects.get_or_create(username=username, defaults=defaults)
    if not created and sender_name:
        name_parts = sender_name.split()
        first_name = name_parts[0]
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        if user.first_name != first_name or user.last_name != last_name:
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])

    return user


def create_report(
    *,
    sender_user=None,
    sender_identifier=None,
    sender_name,
    branch_name,
    subject,
    message,
    attachment_url="",
):
    if branch_name not in VALID_BRANCHES:
        raise ValueError("Unsupported branch.")

    if use_supabase_reports():
        rows = _client().insert(
            "branch_reports",
            {
                "sender": sender_identifier,
                "sender_name": sender_name,
                "branch": branch_name,
                "subject": subject,
                "message": message,
                "attachment_url": attachment_url or "",
            },
        )
        return _report_from_row(rows[0])

    branch, _ = Branch.objects.get_or_create(branch_name=branch_name)
    sender = _ensure_sender_user(sender_user, sender_identifier, sender_name, branch_name)
    report = Report.objects.create(
        sender=sender,
        branch=branch,
        subject=subject,
        message=message,
        attachment_url=attachment_url or "",
    )
    return _report_from_model(report)


def list_reports(*, is_deleted, branch_name=None):
    if use_supabase_reports():
        filters = {"is_deleted": f"eq.{str(is_deleted).lower()}"}
        if branch_name:
            filters["branch"] = f"eq.{branch_name}"
        rows = _client().select(
            "branch_reports",
            filters=filters,
            order="created_at.desc",
        )
        return [_report_from_row(row) for row in rows or []]

    reports = Report.objects.select_related("sender", "branch").filter(
        is_deleted=is_deleted
    )
    if branch_name:
        reports = reports.filter(branch__branch_name=branch_name)
    return [_report_from_model(report) for report in reports]


def get_report(report_id):
    if use_supabase_reports():
        rows = _client().select(
            "branch_reports",
            filters={"id": f"eq.{report_id}"},
            limit=1,
        )
        if not rows:
            return None
        return _report_from_row(rows[0])

    try:
        report = Report.objects.select_related("sender", "branch").get(pk=report_id)
    except Report.DoesNotExist:
        return None
    return _report_from_model(report)


def set_report_deleted(report_id, *, is_deleted):
    if use_supabase_reports():
        rows = _client().update(
            "branch_reports",
            {"is_deleted": is_deleted},
            filters={"id": f"eq.{report_id}"},
        )
        if not rows:
            return None
        return _report_from_row(rows[0])

    try:
        report = Report.objects.select_related("sender", "branch").get(pk=report_id)
    except Report.DoesNotExist:
        return None

    report.is_deleted = is_deleted
    report.save(update_fields=["is_deleted"])
    return _report_from_model(report)


def set_report_reviewed(report_id, *, is_reviewed):
    reviewed_at = timezone.now() if is_reviewed else None

    if use_supabase_reports():
        rows = _client().update(
            "branch_reports",
            {
                "is_reviewed": is_reviewed,
                "reviewed_at": reviewed_at.isoformat() if reviewed_at else None,
            },
            filters={"id": f"eq.{report_id}"},
        )
        if not rows:
            return None
        return _report_from_row(rows[0])

    try:
        report = Report.objects.select_related("sender", "branch").get(pk=report_id)
    except Report.DoesNotExist:
        return None

    report.is_reviewed = is_reviewed
    report.reviewed_at = reviewed_at
    report.save(update_fields=["is_reviewed", "reviewed_at"])
    return _report_from_model(report)


def delete_report(report_id):
    if use_supabase_reports():
        rows = _client().delete("branch_reports", filters={"id": f"eq.{report_id}"})
        return bool(rows)

    deleted_count, _details = Report.objects.filter(pk=report_id).delete()
    return deleted_count > 0
