import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import BackupHistory
from .repository import (
    create_backup_history,
    get_backup_history,
    list_all_backup_settings,
    list_enabled_backup_settings,
    list_backup_history,
    save_backup_settings,
    update_backup_history,
)
from .services import create_branch_backup, delete_backup_artifacts, restore_branch_backup

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def create_branch_backup_task(
    self,
    branch_id,
    backup_type="manual",
    created_by_id=None,
    history_id=None,
    snapshot_data=None,
):
    history = None

    if history_id:
        history = get_backup_history(history_id)
        if history:
            history = update_backup_history(history.id, task_id=self.request.id) or history

    try:
        history = create_branch_backup(
            branch_id=branch_id,
            backup_type=backup_type,
            created_by=created_by_id,
            history=history,
            snapshot_data=snapshot_data,
        )
        return str(history.id)
    except Exception as exc:
        logger.exception("Backup creation failed for branch %s", branch_id)
        if history:
            update_backup_history(
                history.id,
                status=BackupHistory.STATUS_FAILED,
                progress=100,
                error_message=str(exc),
            )
        raise


@shared_task
def dispatch_scheduled_backups():
    now = timezone.localtime()
    current_time = now.time().replace(second=0, microsecond=0)

    for settings_row in list_enabled_backup_settings():
        last_run = timezone.localtime(settings_row.last_automated_backup_at) if settings_row.last_automated_backup_at else None
        already_ran_today = last_run and last_run.date() == now.date()
        scheduled_time = settings_row.automated_time.replace(second=0, microsecond=0)

        if already_ran_today or current_time < scheduled_time:
            continue

        history = create_backup_history(
            branch=settings_row.branch,
            backup_type=BackupHistory.TYPE_AUTOMATED,
            file_path="",
            sql_file_path="",
            backup_filename="pending.zip",
            created_by=settings_row.updated_by,
            created_by_name=settings_row.updated_by_name,
            status=BackupHistory.STATUS_PENDING,
            progress=0,
        )
        task = create_branch_backup_task.delay(
            branch_id=settings_row.branch,
            backup_type=BackupHistory.TYPE_AUTOMATED,
            created_by_id=(
                str(settings_row.updated_by.pk)
                if hasattr(settings_row.updated_by, "pk")
                else settings_row.updated_by
            ),
            history_id=str(history.id),
        )
        update_backup_history(history.id, task_id=task.id)
        # Preserve any existing settings fields while updating the last run timestamp.
        save_backup_settings(
            settings_row.branch,
            {
                "automated_time": settings_row.automated_time,
                "retention_days": settings_row.retention_days,
                "is_enabled": settings_row.is_enabled,
                "last_automated_backup_at": now,
            },
            updated_by=settings_row.updated_by,
            updated_by_name=settings_row.updated_by_name,
        )


@shared_task
def cleanup_expired_backups():
    now = timezone.now()
    for settings_row in list_all_backup_settings():
        cutoff = now - timedelta(days=settings_row.retention_days)
        expired = [
            history
            for history in list_backup_history(settings_row.branch, include_deleted=True)
            if history.backup_type in (BackupHistory.TYPE_MANUAL, BackupHistory.TYPE_AUTOMATED)
            and history.status in (BackupHistory.STATUS_COMPLETED, BackupHistory.STATUS_FAILED)
            and history.creation_date
            and history.creation_date < cutoff
        ]
        for history in expired:
            delete_backup_artifacts(history)


@shared_task(bind=True)
def restore_branch_backup_task(self, restore_history_id):
    history = get_backup_history(restore_history_id)
    if not history:
        raise ValueError(f"Backup history '{restore_history_id}' was not found.")

    history = update_backup_history(history.id, task_id=self.request.id) or history

    try:
        restore_branch_backup(history)
        return str(history.id)
    except Exception as exc:
        logger.exception("Backup restore failed for history %s", history.id)
        update_backup_history(
            history.id,
            status=BackupHistory.STATUS_FAILED,
            progress=100,
            error_message=str(exc),
            restore_finished_at=timezone.now(),
        )
        raise
