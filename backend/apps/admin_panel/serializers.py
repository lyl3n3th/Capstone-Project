from rest_framework import serializers

from .models import BackupHistory


class BackupSettingsSerializer(serializers.Serializer):
    branch = serializers.CharField(read_only=True)
    automated_time = serializers.TimeField(read_only=True)
    retention_days = serializers.IntegerField(read_only=True)
    is_enabled = serializers.BooleanField(read_only=True)
    last_automated_backup_at = serializers.DateTimeField(read_only=True, allow_null=True)
    updated_at = serializers.DateTimeField(read_only=True, allow_null=True)


class BackupSettingsUpdateSerializer(serializers.Serializer):
    automated_time = serializers.TimeField(required=False)
    retention_days = serializers.IntegerField(required=False, min_value=1)
    is_enabled = serializers.BooleanField(required=False)


class BackupHistorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    branch = serializers.CharField(read_only=True)
    backup_type = serializers.CharField(read_only=True)
    backup_filename = serializers.CharField(read_only=True)
    file_path = serializers.CharField(read_only=True)
    sql_file_path = serializers.CharField(read_only=True)
    storage_bucket = serializers.CharField(read_only=True, allow_blank=True)
    status = serializers.CharField(read_only=True)
    progress = serializers.IntegerField(read_only=True)
    error_message = serializers.CharField(read_only=True, allow_blank=True)
    task_id = serializers.CharField(read_only=True, allow_blank=True)
    creation_date = serializers.DateTimeField(read_only=True)
    created_by = serializers.CharField(read_only=True, allow_null=True)
    created_by_name = serializers.CharField(read_only=True)
    metadata = serializers.JSONField(read_only=True)
    restored_from = serializers.UUIDField(read_only=True, allow_null=True)
    restore_started_at = serializers.DateTimeField(read_only=True, allow_null=True)
    restore_finished_at = serializers.DateTimeField(read_only=True, allow_null=True)


class BackupRestoreStartSerializer(serializers.Serializer):
    backup_history_id = serializers.UUIDField()


class BackupSnapshotCreateSerializer(serializers.Serializer):
    backup_type = serializers.ChoiceField(
        choices=(BackupHistory.TYPE_MANUAL, BackupHistory.TYPE_AUTOMATED),
        default=BackupHistory.TYPE_MANUAL,
    )
    students = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    alumni = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
