import uuid

from django.conf import settings
from django.db import models

from apps.core.models import BRANCH_CHOICES


class BackupSettings(models.Model):
    branch = models.CharField(max_length=20, choices=BRANCH_CHOICES, unique=True)
    automated_time = models.TimeField(default="23:00")
    retention_days = models.PositiveIntegerField(default=30)
    is_enabled = models.BooleanField(default=True)
    last_automated_backup_at = models.DateTimeField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_backup_settings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("branch",)
        verbose_name_plural = "Backup settings"

    def __str__(self):
        return f"{self.branch} backup settings"


class BackupHistory(models.Model):
    TYPE_MANUAL = "manual"
    TYPE_AUTOMATED = "automated"
    TYPE_RESTORE = "restore"
    BACKUP_TYPE_CHOICES = (
        (TYPE_MANUAL, "Manual"),
        (TYPE_AUTOMATED, "Automated"),
        (TYPE_RESTORE, "Restore"),
    )

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_DELETED = "deleted"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
        (STATUS_DELETED, "Deleted"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.CharField(max_length=20, choices=BRANCH_CHOICES, db_index=True)
    backup_type = models.CharField(max_length=20, choices=BACKUP_TYPE_CHOICES)
    file_path = models.CharField(max_length=512)
    sql_file_path = models.CharField(max_length=512, blank=True)
    backup_filename = models.CharField(max_length=255)
    storage_bucket = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_backups",
    )
    creation_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    progress = models.PositiveSmallIntegerField(default=0)
    task_id = models.CharField(max_length=255, blank=True)
    error_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    restored_from = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="restore_runs",
    )
    restore_started_at = models.DateTimeField(null=True, blank=True)
    restore_finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-creation_date",)

    def __str__(self):
        return f"{self.branch} {self.backup_type} {self.creation_date:%Y-%m-%d %H:%M:%S}"
