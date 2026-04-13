from django.contrib import admin

from .models import BackupHistory, BackupSettings


@admin.register(BackupSettings)
class BackupSettingsAdmin(admin.ModelAdmin):
    list_display = ("branch", "automated_time", "retention_days", "is_enabled", "updated_at")
    list_filter = ("is_enabled", "branch")
    search_fields = ("branch",)


@admin.register(BackupHistory)
class BackupHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "backup_filename",
        "branch",
        "backup_type",
        "status",
        "progress",
        "creation_date",
    )
    list_filter = ("branch", "backup_type", "status", "storage_bucket")
    search_fields = ("backup_filename", "file_path", "sql_file_path", "task_id")
    readonly_fields = ("creation_date", "restore_started_at", "restore_finished_at")
