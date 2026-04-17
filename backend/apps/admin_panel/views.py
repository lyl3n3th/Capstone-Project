import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.manager.permissions import IsBranchAdmin, get_request_branch, resolve_staff_account_from_request

from .automation import dispatch_due_automated_backups
from .models import BackupHistory
from .repository import (
    create_backup_history,
    get_backup_history,
    get_or_create_backup_settings,
    list_backup_history,
    save_backup_snapshot,
    save_backup_settings,
    update_backup_history,
)
from .serializers import (
    BackupAutomatedDispatchSerializer,
    BackupHistorySerializer,
    BackupRestoreStartSerializer,
    BackupSettingsSerializer,
    BackupSettingsUpdateSerializer,
    BackupSnapshotCreateSerializer,
    BackupSnapshotSyncSerializer,
)
from .services import create_branch_backup, delete_backup_artifacts, read_backup_snapshot, restore_branch_backup


logger = logging.getLogger(__name__)


def get_request_branch_context(request):
    staff_account = resolve_staff_account_from_request(request)
    if staff_account and staff_account.role == "admin" and not staff_account.is_trashed:
        return staff_account.branch, staff_account.user

    branch_id = get_request_branch(request)
    if branch_id:
        return branch_id, request.user if getattr(request.user, "is_authenticated", False) else None

    return "", None


class BackupSettingsView(APIView):
    permission_classes = [IsBranchAdmin]

    def get(self, request):
        branch_id, _user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        settings_row = get_or_create_backup_settings(branch_id)
        return Response(BackupSettingsSerializer(settings_row).data)

    def put(self, request):
        branch_id, user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BackupSettingsUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings_row = save_backup_settings(
            branch_id,
            serializer.validated_data,
            updated_by=user,
            updated_by_name=request.headers.get("X-User-Name", "").strip(),
        )
        dispatch_due_automated_backups(
            branch_id=branch_id,
            timezone_offset_minutes=settings_row.timezone_offset_minutes,
            created_by=user,
            created_by_name=request.headers.get("X-User-Name", "").strip(),
        )
        return Response(BackupSettingsSerializer(settings_row).data)


class BackupHistoryListView(APIView):
    permission_classes = [IsBranchAdmin]

    def get(self, request):
        branch_id, _user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        history = list_backup_history(branch_id)
        return Response(BackupHistorySerializer(history, many=True).data)


class BackupSnapshotSyncView(APIView):
    permission_classes = [IsBranchAdmin]

    def post(self, request):
        branch_id, user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BackupSnapshotSyncSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        timezone_offset_minutes = serializer.validated_data.get("timezone_offset_minutes")
        if timezone_offset_minutes is not None:
            save_backup_settings(
                branch_id,
                {"timezone_offset_minutes": timezone_offset_minutes},
                updated_by=user,
                updated_by_name=request.headers.get("X-User-Name", "").strip(),
            )

        snapshot = save_backup_snapshot(
            branch_id,
            serializer.validated_data.get("students", []),
            serializer.validated_data.get("alumni", []),
            updated_by=user,
            updated_by_name=request.headers.get("X-User-Name", "").strip(),
        )
        return Response(
            {
                "branch": snapshot.branch,
                "record_count": snapshot.record_count,
                "updated_at": snapshot.updated_at,
                "updated_by_name": snapshot.updated_by_name,
            }
        )


class BackupAutomatedDispatchView(APIView):
    permission_classes = [IsBranchAdmin]

    def post(self, request):
        branch_id, user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BackupAutomatedDispatchSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        histories = dispatch_due_automated_backups(
            branch_id=branch_id,
            reference_time=serializer.validated_data.get("reference_time"),
            timezone_offset_minutes=serializer.validated_data.get("timezone_offset_minutes"),
            created_by=user,
            created_by_name=request.headers.get("X-User-Name", "").strip(),
        )
        return Response(
            BackupHistorySerializer(histories, many=True).data,
            status=status.HTTP_202_ACCEPTED if histories else status.HTTP_200_OK,
        )


class BackupManualCreateView(APIView):
    permission_classes = [IsBranchAdmin]

    def post(self, request):
        branch_id, user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        request_serializer = BackupSnapshotCreateSerializer(data=request.data or {})
        request_serializer.is_valid(raise_exception=True)
        backup_type = request_serializer.validated_data["backup_type"]

        existing_manual_backup = next(
            (
                item
                for item in list_backup_history(branch_id, include_deleted=True)
                if item.backup_type == backup_type
                and item.status in (BackupHistory.STATUS_PENDING, BackupHistory.STATUS_IN_PROGRESS)
                and item.status != BackupHistory.STATUS_DELETED
            ),
            None,
        )
        if existing_manual_backup:
            return Response(
                {
                    "detail": (
                        f"A {backup_type} backup is already in progress for this branch. "
                        "Wait for it to complete or delete it first."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        history = create_backup_history(
            branch=branch_id,
            backup_type=backup_type,
            file_path="",
            sql_file_path="",
            backup_filename="pending.zip",
            created_by=user,
            created_by_name=request.headers.get("X-User-Name", "").strip(),
            status=BackupHistory.STATUS_PENDING,
            progress=0,
        )
        snapshot_data = {
            "students": request_serializer.validated_data.get("students", []),
            "alumni": request_serializer.validated_data.get("alumni", []),
        }
        try:
            from .tasks import create_branch_backup_task

            task = create_branch_backup_task.delay(
                branch_id=branch_id,
                backup_type=backup_type,
                created_by_id=str(user.id) if user else None,
                history_id=str(history.id),
                snapshot_data=snapshot_data,
            )
            history = update_backup_history(history.id, task_id=task.id) or history
        except Exception as exc:
            logger.warning("Celery dispatch failed for %s backup, running inline: %s", backup_type, exc)
            history = create_branch_backup(
                branch_id=branch_id,
                backup_type=backup_type,
                created_by=user,
                history=history,
                snapshot_data=snapshot_data,
            )

        if backup_type == BackupHistory.TYPE_AUTOMATED:
            settings_row = get_or_create_backup_settings(branch_id)
            save_backup_settings(
                branch_id,
                {
                    "automated_time": settings_row.automated_time,
                    "retention_days": settings_row.retention_days,
                    "is_enabled": settings_row.is_enabled,
                    "timezone_offset_minutes": settings_row.timezone_offset_minutes,
                    "last_automated_backup_at": timezone.now(),
                },
                updated_by=user,
                updated_by_name=request.headers.get("X-User-Name", "").strip(),
            )

        return Response(BackupHistorySerializer(history).data, status=status.HTTP_202_ACCEPTED)


class BackupRestoreStartView(APIView):
    permission_classes = [IsBranchAdmin]

    def post(self, request):
        branch_id, user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BackupRestoreStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        source_history = get_backup_history(
            serializer.validated_data["backup_history_id"],
            branch=branch_id,
        )
        if (
            not source_history
            or source_history.backup_type not in (BackupHistory.TYPE_MANUAL, BackupHistory.TYPE_AUTOMATED)
            or source_history.status != BackupHistory.STATUS_COMPLETED
        ):
            return Response({"detail": "Backup file not found for this branch."}, status=status.HTTP_404_NOT_FOUND)

        restore_history = create_backup_history(
            branch=branch_id,
            backup_type=BackupHistory.TYPE_RESTORE,
            file_path=source_history.file_path,
            sql_file_path=source_history.sql_file_path,
            backup_filename=source_history.backup_filename,
            storage_bucket=source_history.storage_bucket,
            created_by=user,
            created_by_name=request.headers.get("X-User-Name", "").strip(),
            status=BackupHistory.STATUS_PENDING,
            progress=0,
            restored_from=source_history.id,
            metadata={"source_backup_id": str(source_history.id)},
        )
        try:
            from .tasks import restore_branch_backup_task

            task = restore_branch_backup_task.delay(str(restore_history.id))
            restore_history = update_backup_history(restore_history.id, task_id=task.id) or restore_history
        except Exception as exc:
            logger.warning("Celery dispatch failed for restore, running inline: %s", exc)
            restore_history = restore_branch_backup(restore_history)

        return Response(BackupHistorySerializer(restore_history).data, status=status.HTTP_202_ACCEPTED)


class BackupHistoryDeleteView(APIView):
    permission_classes = [IsBranchAdmin]

    def delete(self, request, backup_history_id):
        branch_id, _user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        history = get_backup_history(backup_history_id, branch=branch_id)
        if not history:
            return Response({"detail": "Backup history not found for this branch."}, status=status.HTTP_404_NOT_FOUND)

        delete_backup_artifacts(history)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BackupRestoreStatusView(APIView):
    permission_classes = [IsBranchAdmin]

    def get(self, request, backup_history_id):
        branch_id, _user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        history = get_backup_history(backup_history_id, branch=branch_id)
        if not history:
            return Response({"detail": "Backup history not found for this branch."}, status=status.HTTP_404_NOT_FOUND)

        return Response(BackupHistorySerializer(history).data)


class BackupSnapshotView(APIView):
    permission_classes = [IsBranchAdmin]

    def get(self, request, backup_history_id):
        branch_id, _user = get_request_branch_context(request)
        if not branch_id:
            return Response({"detail": "Branch context is required."}, status=status.HTTP_400_BAD_REQUEST)

        history = get_backup_history(backup_history_id, branch=branch_id)
        if not history:
            return Response({"detail": "Backup history not found for this branch."}, status=status.HTTP_404_NOT_FOUND)

        return Response(read_backup_snapshot(history))
