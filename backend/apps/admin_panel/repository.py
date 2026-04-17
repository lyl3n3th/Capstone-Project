from dataclasses import dataclass, field

from django.utils.dateparse import parse_datetime, parse_time

from apps.core.supabase_rest import SupabaseRestClient, is_supabase_feature_enabled

from .models import BackupHistory, BackupSettings, BackupSnapshot


@dataclass
class BackupSettingsRecord:
    branch: str
    automated_time: object
    retention_days: int
    is_enabled: bool
    timezone_offset_minutes: int = 0
    last_automated_backup_at: object = None
    updated_at: object = None
    updated_by: str | None = None
    updated_by_name: str = ""


@dataclass
class BackupHistoryRecord:
    id: str
    branch: str
    backup_type: str
    backup_filename: str
    file_path: str = ""
    sql_file_path: str = ""
    storage_bucket: str = ""
    status: str = BackupHistory.STATUS_PENDING
    progress: int = 0
    error_message: str = ""
    task_id: str = ""
    creation_date: object = None
    created_by: str | None = None
    created_by_name: str = "System"
    metadata: dict = field(default_factory=dict)
    restored_from: str | None = None
    restore_started_at: object = None
    restore_finished_at: object = None


@dataclass
class BackupSnapshotRecord:
    branch: str
    students: list = field(default_factory=list)
    alumni: list = field(default_factory=list)
    record_count: int = 0
    updated_at: object = None
    updated_by: str | None = None
    updated_by_name: str = ""


def use_supabase_backups():
    return is_supabase_feature_enabled("USE_SUPABASE_BACKUPS")


def _client():
    return SupabaseRestClient.from_settings()


def _normalize_datetime(value):
    if value is None or hasattr(value, "tzinfo"):
        return value
    return parse_datetime(str(value))


def _normalize_time(value):
    if value is None or hasattr(value, "hour"):
        return value
    return parse_time(str(value))


def _resolve_actor(actor=None, actor_name=""):
    resolved_name = (actor_name or "").strip()
    if actor is None:
        return None, resolved_name

    if hasattr(actor, "pk"):
        actor_id = str(actor.pk)
        if not resolved_name:
            resolved_name = actor.get_full_name().strip() or actor.username
        return actor_id, resolved_name

    actor_text = str(actor).strip()
    if not actor_text:
        return None, resolved_name
    return actor_text, resolved_name or actor_text


def _settings_from_model(settings_row):
    updated_by_name = ""
    if settings_row.updated_by:
        updated_by_name = settings_row.updated_by.get_full_name().strip() or settings_row.updated_by.username

    return BackupSettingsRecord(
        branch=settings_row.branch,
        automated_time=settings_row.automated_time,
        retention_days=settings_row.retention_days,
        is_enabled=settings_row.is_enabled,
        timezone_offset_minutes=settings_row.timezone_offset_minutes,
        last_automated_backup_at=settings_row.last_automated_backup_at,
        updated_at=settings_row.updated_at,
        updated_by=settings_row.updated_by,
        updated_by_name=updated_by_name,
    )


def _history_from_model(history):
    created_by_name = "System"
    if history.created_by:
        created_by_name = history.created_by.get_full_name().strip() or history.created_by.username

    return BackupHistoryRecord(
        id=str(history.id),
        branch=history.branch,
        backup_type=history.backup_type,
        backup_filename=history.backup_filename,
        file_path=history.file_path,
        sql_file_path=history.sql_file_path,
        storage_bucket=history.storage_bucket,
        status=history.status,
        progress=history.progress,
        error_message=history.error_message,
        task_id=history.task_id,
        creation_date=history.creation_date,
        created_by=str(history.created_by_id) if history.created_by_id else None,
        created_by_name=created_by_name,
        metadata=history.metadata or {},
        restored_from=str(history.restored_from_id) if history.restored_from_id else None,
        restore_started_at=history.restore_started_at,
        restore_finished_at=history.restore_finished_at,
    )


def _settings_from_row(row):
    return BackupSettingsRecord(
        branch=row.get("branch") or "",
        automated_time=_normalize_time(row.get("automated_time")),
        retention_days=int(row.get("retention_days") or 30),
        is_enabled=bool(row.get("is_enabled", True)),
        timezone_offset_minutes=int(row.get("timezone_offset_minutes") or 0),
        last_automated_backup_at=_normalize_datetime(row.get("last_automated_backup_at")),
        updated_at=_normalize_datetime(row.get("updated_at")),
        updated_by=row.get("updated_by"),
        updated_by_name=row.get("updated_by_name") or "",
    )


def _history_from_row(row):
    return BackupHistoryRecord(
        id=str(row["id"]),
        branch=row.get("branch") or "",
        backup_type=row.get("backup_type") or BackupHistory.TYPE_MANUAL,
        backup_filename=row.get("backup_filename") or "",
        file_path=row.get("file_path") or "",
        sql_file_path=row.get("sql_file_path") or "",
        storage_bucket=row.get("storage_bucket") or "",
        status=row.get("status") or BackupHistory.STATUS_PENDING,
        progress=int(row.get("progress") or 0),
        error_message=row.get("error_message") or "",
        task_id=row.get("task_id") or "",
        creation_date=_normalize_datetime(row.get("creation_date")),
        created_by=row.get("created_by"),
        created_by_name=row.get("created_by_name") or "System",
        metadata=row.get("metadata") or {},
        restored_from=str(row["restored_from"]) if row.get("restored_from") else None,
        restore_started_at=_normalize_datetime(row.get("restore_started_at")),
        restore_finished_at=_normalize_datetime(row.get("restore_finished_at")),
    )


def _serialize_time_value(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value if len(value.split(":")) == 3 else f"{value}:00"
    return value.isoformat()


def _snapshot_from_model(snapshot_row):
    updated_by_name = ""
    if snapshot_row.updated_by:
        updated_by_name = snapshot_row.updated_by.get_full_name().strip() or snapshot_row.updated_by.username

    return BackupSnapshotRecord(
        branch=snapshot_row.branch,
        students=list(snapshot_row.students or []),
        alumni=list(snapshot_row.alumni or []),
        record_count=snapshot_row.record_count,
        updated_at=snapshot_row.updated_at,
        updated_by=snapshot_row.updated_by,
        updated_by_name=updated_by_name,
    )


def _snapshot_from_row(row):
    return BackupSnapshotRecord(
        branch=row.get("branch") or "",
        students=list(row.get("students") or []),
        alumni=list(row.get("alumni") or []),
        record_count=int(row.get("record_count") or 0),
        updated_at=_normalize_datetime(row.get("updated_at")),
        updated_by=row.get("updated_by"),
        updated_by_name=row.get("updated_by_name") or "",
    )


def get_or_create_backup_settings(branch):
    if use_supabase_backups():
        rows = _client().select(
            "branch_backup_settings",
            filters={"branch": f"eq.{branch}"},
            limit=1,
        )
        if rows:
            return _settings_from_row(rows[0])

        rows = _client().insert("branch_backup_settings", {"branch": branch})
        return _settings_from_row(rows[0])

    settings_row, _created = BackupSettings.objects.get_or_create(branch=branch)
    return _settings_from_model(settings_row)


def save_backup_settings(branch, data, *, updated_by=None, updated_by_name=""):
    updated_by_id, resolved_name = _resolve_actor(updated_by, updated_by_name)

    if use_supabase_backups():
        payload = {
            "branch": branch,
            "updated_by": updated_by_id,
            "updated_by_name": resolved_name or None,
        }
        if "automated_time" in data:
            payload["automated_time"] = _serialize_time_value(data["automated_time"])
        if "retention_days" in data:
            payload["retention_days"] = data["retention_days"]
        if "is_enabled" in data:
            payload["is_enabled"] = data["is_enabled"]
        if "timezone_offset_minutes" in data:
            payload["timezone_offset_minutes"] = data["timezone_offset_minutes"]
        if "last_automated_backup_at" in data:
            payload["last_automated_backup_at"] = (
                data["last_automated_backup_at"].isoformat()
                if data["last_automated_backup_at"] is not None
                else None
            )

        rows = _client().insert(
            "branch_backup_settings",
            payload,
            upsert=True,
            on_conflict="branch",
        )
        return _settings_from_row(rows[0])

    settings_row, _created = BackupSettings.objects.get_or_create(branch=branch)
    for key, value in data.items():
        setattr(settings_row, key, value)
    settings_row.updated_by = updated_by if hasattr(updated_by, "pk") else None
    settings_row.save()
    return _settings_from_model(settings_row)


def list_backup_history(branch, *, include_deleted=False):
    if use_supabase_backups():
        filters = {"branch": f"eq.{branch}"}
        if not include_deleted:
            filters["status"] = f"neq.{BackupHistory.STATUS_DELETED}"
        rows = _client().select(
            "branch_backup_history",
            filters=filters,
            order="creation_date.desc",
        )
        return [_history_from_row(row) for row in rows or []]

    queryset = BackupHistory.objects.filter(branch=branch)
    if not include_deleted:
        queryset = queryset.exclude(status=BackupHistory.STATUS_DELETED)
    queryset = queryset.select_related("created_by", "restored_from")
    return [_history_from_model(history) for history in queryset]


def get_backup_history(history_id, *, branch=None):
    if use_supabase_backups():
        filters = {"id": f"eq.{history_id}"}
        if branch:
            filters["branch"] = f"eq.{branch}"
        rows = _client().select("branch_backup_history", filters=filters, limit=1)
        if not rows:
            return None
        return _history_from_row(rows[0])

    queryset = BackupHistory.objects.select_related("created_by", "restored_from").filter(pk=history_id)
    if branch:
        queryset = queryset.filter(branch=branch)
    history = queryset.first()
    if not history:
        return None
    return _history_from_model(history)


def create_backup_history(
    *,
    branch,
    backup_type,
    file_path="",
    sql_file_path="",
    backup_filename,
    storage_bucket="",
    created_by=None,
    created_by_name="",
    status=BackupHistory.STATUS_PENDING,
    progress=0,
    task_id="",
    error_message="",
    metadata=None,
    restored_from=None,
    restore_started_at=None,
    restore_finished_at=None,
):
    created_by_id, resolved_name = _resolve_actor(created_by, created_by_name)
    metadata = metadata or {}

    if use_supabase_backups():
        payload = {
            "branch": branch,
            "backup_type": backup_type,
            "file_path": file_path,
            "sql_file_path": sql_file_path,
            "backup_filename": backup_filename,
            "storage_bucket": storage_bucket,
            "created_by": created_by_id,
            "created_by_name": resolved_name or None,
            "status": status,
            "progress": progress,
            "task_id": task_id,
            "error_message": error_message,
            "metadata": metadata,
            "restored_from": restored_from,
            "restore_started_at": restore_started_at.isoformat() if restore_started_at else None,
            "restore_finished_at": restore_finished_at.isoformat() if restore_finished_at else None,
        }
        rows = _client().insert("branch_backup_history", payload)
        return _history_from_row(rows[0])

    history = BackupHistory.objects.create(
        branch=branch,
        backup_type=backup_type,
        file_path=file_path,
        sql_file_path=sql_file_path,
        backup_filename=backup_filename,
        storage_bucket=storage_bucket,
        created_by=created_by if hasattr(created_by, "pk") else None,
        status=status,
        progress=progress,
        task_id=task_id,
        error_message=error_message,
        metadata=metadata,
        restored_from_id=restored_from,
        restore_started_at=restore_started_at,
        restore_finished_at=restore_finished_at,
    )
    return _history_from_model(history)


def update_backup_history(history_id, **updates):
    if use_supabase_backups():
        payload = {}
        for key, value in updates.items():
            if key in {"restore_started_at", "restore_finished_at"} and value is not None:
                payload[key] = value.isoformat()
            else:
                payload[key] = value
        rows = _client().update(
            "branch_backup_history",
            payload,
            filters={"id": f"eq.{history_id}"},
        )
        if not rows:
            return None
        return _history_from_row(rows[0])

    history = BackupHistory.objects.filter(pk=history_id).first()
    if not history:
        return None
    for key, value in updates.items():
        setattr(history, key, value)
    history.save(update_fields=list(updates.keys()))
    return _history_from_model(history)


def list_enabled_backup_settings():
    if use_supabase_backups():
        rows = _client().select(
            "branch_backup_settings",
            filters={"is_enabled": "eq.true"},
            order="branch.asc",
        )
        return [_settings_from_row(row) for row in rows or []]

    return [_settings_from_model(row) for row in BackupSettings.objects.filter(is_enabled=True)]


def list_all_backup_settings():
    if use_supabase_backups():
        rows = _client().select("branch_backup_settings", order="branch.asc")
        return [_settings_from_row(row) for row in rows or []]

    return [_settings_from_model(row) for row in BackupSettings.objects.all()]


def get_backup_snapshot(branch):
    if use_supabase_backups():
        rows = _client().select(
            "branch_backup_snapshots",
            filters={"branch": f"eq.{branch}"},
            limit=1,
        )
        if not rows:
            return None
        return _snapshot_from_row(rows[0])

    snapshot = BackupSnapshot.objects.filter(branch=branch).select_related("updated_by").first()
    if not snapshot:
        return None
    return _snapshot_from_model(snapshot)


def save_backup_snapshot(branch, students, alumni, *, updated_by=None, updated_by_name=""):
    updated_by_id, resolved_name = _resolve_actor(updated_by, updated_by_name)
    students = list(students or [])
    alumni = list(alumni or [])
    record_count = len(students) + len(alumni)

    if use_supabase_backups():
        rows = _client().insert(
            "branch_backup_snapshots",
            {
                "branch": branch,
                "students": students,
                "alumni": alumni,
                "record_count": record_count,
                "updated_by": updated_by_id,
                "updated_by_name": resolved_name or None,
            },
            upsert=True,
            on_conflict="branch",
        )
        return _snapshot_from_row(rows[0])

    snapshot, _created = BackupSnapshot.objects.get_or_create(branch=branch)
    snapshot.students = students
    snapshot.alumni = alumni
    snapshot.record_count = record_count
    snapshot.updated_by = updated_by if hasattr(updated_by, "pk") else None
    snapshot.updated_by_name = resolved_name
    snapshot.save()
    return _snapshot_from_model(snapshot)
