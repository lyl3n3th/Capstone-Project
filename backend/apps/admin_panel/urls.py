from django.urls import path

from .views import (
    BackupArchiveUploadView,
    BackupAutomatedDispatchView,
    BackupHistoryDownloadView,
    BackupHistoryDeleteView,
    BackupHistoryListView,
    BackupManualCreateView,
    BackupRestoreStartView,
    BackupRestoreStatusView,
    BackupSnapshotView,
    BackupSnapshotSyncView,
    BackupSettingsView,
)


urlpatterns = [
    path("backup/settings/", BackupSettingsView.as_view(), name="backup-settings"),
    path("backup/history/", BackupHistoryListView.as_view(), name="backup-history"),
    path("backup/snapshot-sync/", BackupSnapshotSyncView.as_view(), name="backup-snapshot-sync"),
    path("backup/automated/dispatch/", BackupAutomatedDispatchView.as_view(), name="backup-automated-dispatch"),
    path("backup/manual/", BackupManualCreateView.as_view(), name="backup-manual-create"),
    path("backup/upload/", BackupArchiveUploadView.as_view(), name="backup-upload"),
    path("backup/restore/", BackupRestoreStartView.as_view(), name="backup-restore-start"),
    path(
        "backup/history/<uuid:backup_history_id>/download/",
        BackupHistoryDownloadView.as_view(),
        name="backup-history-download",
    ),
    path(
        "backup/history/<uuid:backup_history_id>/status/",
        BackupRestoreStatusView.as_view(),
        name="backup-restore-status",
    ),
    path(
        "backup/history/<uuid:backup_history_id>/snapshot/",
        BackupSnapshotView.as_view(),
        name="backup-history-snapshot",
    ),
    path(
        "backup/history/<uuid:backup_history_id>/",
        BackupHistoryDeleteView.as_view(),
        name="backup-history-delete",
    ),
]
