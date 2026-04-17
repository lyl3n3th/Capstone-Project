import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .automation import dispatch_due_automated_backups
from .models import BackupHistory
from .repository import (
    get_backup_history,
    list_all_backup_settings,
    list_backup_history,
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
    dispatch_due_automated_backups()


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
