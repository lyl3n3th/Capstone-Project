import logging
import threading
from datetime import timedelta

from celery import shared_task
from django.db import close_old_connections
from django.utils import timezone

from aicsync.celery import app as celery_app
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
_BACKGROUND_BACKUP_LOCK = threading.Lock()


def backup_worker_available():
    """Avoid queueing a backup when the broker has no consuming worker."""
    try:
        inspector = celery_app.control.inspect(timeout=1.0)
        if inspector and inspector.ping():
            return True
        logger.info("No Celery backup worker responded; the web service will run the job in a background thread.")
        return False
    except Exception:
        logger.info("No Celery backup worker responded; the web service will run the job in a background thread.")
        return False


def _run_background_backup(*, branch_id, backup_type, created_by_id, history_id, snapshot_data):
    try:
        close_old_connections()
        history = get_backup_history(history_id, branch=branch_id)
        if not history or history.status == BackupHistory.STATUS_DELETED:
            return
        create_branch_backup(
            branch_id=branch_id,
            backup_type=backup_type,
            created_by=created_by_id,
            history=history,
            snapshot_data=snapshot_data,
        )
    except Exception as exc:
        logger.exception("Background backup failed for history %s", history_id)
        try:
            update_backup_history(
                history_id,
                status=BackupHistory.STATUS_FAILED,
                progress=100,
                error_message=str(exc),
            )
        except Exception:
            logger.exception("Could not record the background backup failure for %s", history_id)
    finally:
        try:
            close_old_connections()
        except Exception:
            logger.exception("Could not close database connections after backup %s", history_id)
        finally:
            _BACKGROUND_BACKUP_LOCK.release()


def dispatch_backup_job(*, branch_id, backup_type, created_by_id, history, snapshot_data):
    """Use Celery when available; otherwise run off-request in this web process."""
    if backup_worker_available():
        try:
            task = create_branch_backup_task.delay(
                branch_id=branch_id,
                backup_type=backup_type,
                created_by_id=created_by_id,
                history_id=str(history.id),
                snapshot_data=snapshot_data,
            )
        except Exception:
            logger.exception("Could not enqueue %s backup for %s", backup_type, branch_id)
        else:
            try:
                return update_backup_history(history.id, task_id=task.id) or history
            except Exception:
                # The job is already queued; do not start a duplicate local copy.
                logger.exception("Could not save the Celery task id for backup %s", history.id)
                return history

    if not _BACKGROUND_BACKUP_LOCK.acquire(blocking=False):
        raise RuntimeError("Another backup is running on this service. Wait for it to finish, then retry.")

    thread = threading.Thread(
        target=_run_background_backup,
        kwargs={
            "branch_id": branch_id,
            "backup_type": backup_type,
            "created_by_id": created_by_id,
            "history_id": str(history.id),
            "snapshot_data": snapshot_data,
        },
        name="backup-job",
        daemon=True,
    )
    try:
        thread.start()
    except Exception:
        _BACKGROUND_BACKUP_LOCK.release()
        raise
    return history


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
