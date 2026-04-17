import logging
from datetime import timedelta, timezone as dt_timezone

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import BackupHistory
from .repository import (
    create_backup_history,
    get_backup_snapshot,
    get_or_create_backup_settings,
    list_backup_history,
    list_enabled_backup_settings,
    save_backup_settings,
    update_backup_history,
)
from .services import create_branch_backup


logger = logging.getLogger(__name__)

AUTOMATED_BACKUP_WINDOW = timedelta(minutes=10)


def _to_branch_local_naive(value, timezone_offset_minutes):
    if value is None:
        return None

    if isinstance(value, str):
        value = parse_datetime(value)

    if value is None:
        return None

    if timezone.is_naive(value):
        return value.replace(tzinfo=None)

    utc_naive = value.astimezone(dt_timezone.utc).replace(tzinfo=None)
    return utc_naive - timedelta(minutes=timezone_offset_minutes)


def _resolve_reference_time(reference_time=None, timezone_offset_minutes=0):
    if reference_time is not None:
        return _to_branch_local_naive(reference_time, timezone_offset_minutes)

    return _to_branch_local_naive(timezone.now(), timezone_offset_minutes)


def is_automated_backup_due(settings_row, *, reference_time=None, timezone_offset_minutes=None):
    effective_offset = (
        settings_row.timezone_offset_minutes
        if timezone_offset_minutes is None
        else timezone_offset_minutes
    )
    local_reference_time = _resolve_reference_time(reference_time, effective_offset)
    if local_reference_time is None:
        local_reference_time = _resolve_reference_time(None, effective_offset)

    scheduled_run = local_reference_time.replace(
        hour=settings_row.automated_time.hour,
        minute=settings_row.automated_time.minute,
        second=0,
        microsecond=0,
    )
    last_run_local = _to_branch_local_naive(
        settings_row.last_automated_backup_at,
        effective_offset,
    )
    already_ran_for_current_schedule = (
        last_run_local is not None
        and last_run_local.date() == local_reference_time.date()
        and last_run_local >= scheduled_run
    )

    return (
        settings_row.is_enabled
        and not already_ran_for_current_schedule
        and scheduled_run <= local_reference_time < scheduled_run + AUTOMATED_BACKUP_WINDOW
    )


def _persist_branch_timezone_offset(settings_row, timezone_offset_minutes, actor=None, actor_name=""):
    if (
        timezone_offset_minutes is None
        or timezone_offset_minutes == settings_row.timezone_offset_minutes
    ):
        return settings_row

    return save_backup_settings(
        settings_row.branch,
        {"timezone_offset_minutes": timezone_offset_minutes},
        updated_by=actor,
        updated_by_name=actor_name,
    )


def dispatch_due_automated_backups(
    *,
    branch_id=None,
    reference_time=None,
    timezone_offset_minutes=None,
    created_by=None,
    created_by_name="",
):
    settings_rows = (
        [get_or_create_backup_settings(branch_id)]
        if branch_id
        else list_enabled_backup_settings()
    )
    dispatched_histories = []

    for settings_row in settings_rows:
        settings_row = _persist_branch_timezone_offset(
            settings_row,
            timezone_offset_minutes,
            actor=created_by,
            actor_name=created_by_name,
        )
        effective_offset = settings_row.timezone_offset_minutes

        if not is_automated_backup_due(
            settings_row,
            reference_time=reference_time,
            timezone_offset_minutes=effective_offset,
        ):
            continue

        existing_automated_backup = next(
            (
                item
                for item in list_backup_history(settings_row.branch, include_deleted=True)
                if item.backup_type == BackupHistory.TYPE_AUTOMATED
                and item.status in (BackupHistory.STATUS_PENDING, BackupHistory.STATUS_IN_PROGRESS)
                and item.status != BackupHistory.STATUS_DELETED
            ),
            None,
        )
        if existing_automated_backup:
            continue

        actor = created_by or settings_row.updated_by
        actor_name = created_by_name or settings_row.updated_by_name
        snapshot_row = get_backup_snapshot(settings_row.branch)
        snapshot_data = None
        if snapshot_row:
            snapshot_data = {
                "students": list(snapshot_row.students or []),
                "alumni": list(snapshot_row.alumni or []),
            }

        history = create_backup_history(
            branch=settings_row.branch,
            backup_type=BackupHistory.TYPE_AUTOMATED,
            file_path="",
            sql_file_path="",
            backup_filename="pending.zip",
            created_by=actor,
            created_by_name=actor_name,
            status=BackupHistory.STATUS_PENDING,
            progress=0,
            metadata={
                "snapshot_source": "cached" if snapshot_data is not None else "database",
            },
        )

        try:
            from .tasks import create_branch_backup_task

            task = create_branch_backup_task.delay(
                branch_id=settings_row.branch,
                backup_type=BackupHistory.TYPE_AUTOMATED,
                created_by_id=str(actor.id) if hasattr(actor, "id") else actor,
                history_id=str(history.id),
                snapshot_data=snapshot_data,
            )
            history = update_backup_history(history.id, task_id=task.id) or history
        except Exception as exc:
            logger.warning(
                "Celery dispatch failed for automated backup on %s, running inline: %s",
                settings_row.branch,
                exc,
            )
            history = create_branch_backup(
                branch_id=settings_row.branch,
                backup_type=BackupHistory.TYPE_AUTOMATED,
                created_by=actor,
                history=history,
                snapshot_data=snapshot_data,
            )

        save_backup_settings(
            settings_row.branch,
            {
                "timezone_offset_minutes": effective_offset,
                "last_automated_backup_at": timezone.now(),
            },
            updated_by=actor,
            updated_by_name=actor_name,
        )
        dispatched_histories.append(history)

    return dispatched_histories
