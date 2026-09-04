import io
import json
import zipfile
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.core.files.storage import default_storage
from django.db import connection, models, transaction
from django.utils import timezone
from django.utils.text import slugify
import sqlparse

from .models import BackupHistory
from .repository import (
    create_backup_history,
    get_backup_history,
    save_backup_snapshot,
    update_backup_history,
)
from .storage import (
    delete_backup_blob,
    download_backup_blob,
    guess_content_type,
    upload_backup_blob,
    upload_media_blob,
)


BACKUP_APP_LABELS = ("admission", "student", "registrar")
BRANCH_FIELD_NAMES = ("branch", "branch_name")
RESTORE_PROGRESS_STEPS = {
    "started": 5,
    "downloaded": 20,
    "purged": 45,
    "sql_restored": 75,
    "media_restored": 95,
    "finished": 100,
}


def set_history_progress(history, *, status=None, progress=None, error_message=None, metadata=None):
    update_fields = []
    if status and history.status != status:
        update_fields.append(("status", status))
    if progress is not None and history.progress != progress:
        update_fields.append(("progress", progress))
    if error_message is not None and history.error_message != error_message:
        update_fields.append(("error_message", error_message))
    if metadata is not None:
        update_fields.append(("metadata", metadata))
    if update_fields:
        history = update_backup_history(history.id, **dict(update_fields)) or history
    return history

def _iter_candidate_models():
    for app_label in BACKUP_APP_LABELS:
        app_config = apps.get_app_config(app_label)
        for model in app_config.get_models():
            if model._meta.proxy:
                continue
            yield model


def _find_branch_lookup(model, max_depth=3):
    queue = deque([("", model, 0)])
    visited = set()

    while queue:
        prefix, current_model, depth = queue.popleft()
        state = (current_model._meta.label, prefix)
        if state in visited:
            continue
        visited.add(state)

        for field_name in BRANCH_FIELD_NAMES:
            try:
                current_model._meta.get_field(field_name)
            except FieldDoesNotExist:
                continue
            return f"{prefix}{field_name}" if prefix else field_name

        if depth >= max_depth:
            continue

        for field in current_model._meta.get_fields():
            if not field.is_relation or not getattr(field, "concrete", False):
                continue
            if field.auto_created or field.many_to_many or field.one_to_many:
                continue
            next_prefix = f"{prefix}{field.name}__" if prefix else f"{field.name}__"
            queue.append((next_prefix, field.related_model, depth + 1))

    return None


def _get_branch_scoped_models():
    scoped = []
    for model in _iter_candidate_models():
        branch_lookup = _find_branch_lookup(model)
        if branch_lookup:
            scoped.append((model, branch_lookup))
    return scoped


def _sort_models_for_insert(scoped_models):
    dependencies = defaultdict(set)
    model_set = {model for model, _lookup in scoped_models}

    for model in model_set:
        for field in model._meta.fields:
            if field.is_relation and field.related_model in model_set:
                dependencies[model].add(field.related_model)

    sorted_models = []
    remaining = set(model_set)

    while remaining:
        ready = sorted(
            [model for model in remaining if dependencies[model].issubset(set(sorted_models))],
            key=lambda current: current._meta.label,
        )
        if not ready:
            ready = sorted(remaining, key=lambda current: current._meta.label)
        for model in ready:
            sorted_models.append(model)
            remaining.discard(model)

    lookup_map = {model: lookup for model, lookup in scoped_models}
    return [(model, lookup_map[model]) for model in sorted_models]


def _sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value.isoformat()}'"
    text_value = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{text_value}'"


def _serialize_model_rows(model, instances):
    fields = [field for field in model._meta.concrete_fields]
    table_name = connection.ops.quote_name(model._meta.db_table)
    column_names = ", ".join(connection.ops.quote_name(field.column) for field in fields)
    statements = []

    for instance in instances:
        values = []
        for field in fields:
            value = getattr(instance, field.attname)
            values.append(_sql_literal(value))
        statements.append(f"INSERT INTO {table_name} ({column_names}) VALUES ({', '.join(values)});")

    return statements


def _build_delete_statement(model, branch_lookup, branch_id):
    table_name = connection.ops.quote_name(model._meta.db_table)
    pk_column = connection.ops.quote_name(model._meta.pk.column)

    if "__" not in branch_lookup:
        field = model._meta.get_field(branch_lookup)
        column = connection.ops.quote_name(field.column)
        return f"DELETE FROM {table_name} WHERE {column} = {_sql_literal(branch_id)};"

    fk_name, nested_lookup = branch_lookup.split("__", 1)
    relation = model._meta.get_field(fk_name)
    related_model = relation.related_model
    subquery = _build_select_ids_statement(related_model, nested_lookup, branch_id)
    local_column = connection.ops.quote_name(relation.column)
    related_pk = connection.ops.quote_name(related_model._meta.pk.column)
    return (
        f"DELETE FROM {table_name} "
        f"WHERE {local_column} IN (SELECT {related_pk} FROM ({subquery}) AS branch_source);"
    )


def _build_select_ids_statement(model, branch_lookup, branch_id):
    table_name = connection.ops.quote_name(model._meta.db_table)
    pk_column = connection.ops.quote_name(model._meta.pk.column)

    if "__" not in branch_lookup:
        field = model._meta.get_field(branch_lookup)
        column = connection.ops.quote_name(field.column)
        return f"SELECT {pk_column} FROM {table_name} WHERE {column} = {_sql_literal(branch_id)}"

    fk_name, nested_lookup = branch_lookup.split("__", 1)
    relation = model._meta.get_field(fk_name)
    related_model = relation.related_model
    local_column = connection.ops.quote_name(relation.column)
    related_pk = connection.ops.quote_name(related_model._meta.pk.column)
    nested_query = _build_select_ids_statement(related_model, nested_lookup, branch_id)
    return (
        f"SELECT {pk_column} FROM {table_name} "
        f"WHERE {local_column} IN (SELECT {related_pk} FROM ({nested_query}) AS nested_branch_source)"
    )


def _collect_media_entries(instance, media_entries):
    for field in instance._meta.concrete_fields:
        if not isinstance(field, models.FileField):
            continue
        file_name = getattr(instance, field.attname)
        if not file_name:
            continue
        media_entries.append(
            {
                "model": instance._meta.label,
                "pk": str(instance.pk),
                "field": field.name,
                "storage_path": str(file_name),
            }
        )


def _build_branch_backup_sql(branch_id):
    scoped_models = _sort_models_for_insert(_get_branch_scoped_models())
    delete_statements = []
    insert_statements = []
    media_entries = []
    exported_models = []
    exported_model_counts = {}
    dataset_counts = {
        "students": 0,
        "alumni": 0,
    }

    for model, branch_lookup in reversed(scoped_models):
        delete_statements.append(_build_delete_statement(model, branch_lookup, branch_id))

    for model, branch_lookup in scoped_models:
        queryset = model.objects.filter(**{branch_lookup: branch_id}).order_by(model._meta.pk.name)
        instances = list(queryset)
        if not instances:
            continue
        exported_models.append(model._meta.label)
        exported_model_counts[model._meta.label] = len(instances)
        model_name = model._meta.model_name.lower()
        label_lower = model._meta.label_lower
        if "student" in model_name or ".student" in label_lower:
            dataset_counts["students"] += len(instances)
        if "alumni" in model_name or ".alumni" in label_lower:
            dataset_counts["alumni"] += len(instances)
        for instance in instances:
            _collect_media_entries(instance, media_entries)
        insert_statements.extend(_serialize_model_rows(model, instances))

    sql_sections = [
        "-- Branch-scoped backup generated by AICSync",
        "BEGIN;",
        *delete_statements,
        *insert_statements,
        "COMMIT;",
    ]
    return (
        "\n".join(sql_sections) + "\n",
        media_entries,
        exported_models,
        exported_model_counts,
        dataset_counts,
    )


def _read_media_bytes(storage_path):
    if not storage_path:
        return None
    if not default_storage.exists(storage_path):
        return None
    with default_storage.open(storage_path, "rb") as file_handle:
        return file_handle.read()


def _execute_sql_script(sql_script):
    statements = [statement.strip() for statement in sqlparse.split(sql_script) if statement.strip()]
    with connection.cursor() as cursor:
        for statement in statements:
            normalized = statement.rstrip(";").strip().upper()
            if normalized in {"BEGIN", "COMMIT"}:
                continue
            cursor.execute(statement)


def _build_snapshot_manifest(branch_id, backup_type, snapshot_data):
    students = list(snapshot_data.get("students") or [])
    alumni = list(snapshot_data.get("alumni") or [])
    dataset_counts = {
        "students": len(students),
        "alumni": len(alumni),
    }
    manifest = {
        "branch": branch_id,
        "generated_at": timezone.now().isoformat(),
        "backup_type": backup_type,
        "models": [],
        "model_counts": {},
        "dataset_counts": dataset_counts,
        "snapshot_format": "json",
    }
    return manifest, students, alumni, dataset_counts


def _read_archive_manifest(archive):
    try:
        manifest_payload = archive.read("metadata/manifest.json").decode("utf-8")
    except KeyError as exc:
        raise ValueError("Backup ZIP must include metadata/manifest.json.") from exc

    try:
        manifest = json.loads(manifest_payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Backup ZIP contains an invalid manifest file.") from exc

    if not isinstance(manifest, dict):
        raise ValueError("Backup ZIP manifest must be a JSON object.")

    return manifest


def _read_archive_json_member(archive, member_name, *, required=False):
    try:
        payload = archive.read(member_name).decode("utf-8")
    except KeyError:
        if required:
            raise ValueError(f"Backup ZIP is missing {member_name}.") from None
        return []

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Backup ZIP contains invalid JSON in {member_name}.") from exc

    if not isinstance(parsed, list):
        raise ValueError(f"Backup ZIP member {member_name} must contain a JSON array.")

    return parsed


def inspect_uploaded_backup_archive(*, payload, branch_id):
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload), "r")
    except zipfile.BadZipFile as exc:
        raise ValueError("Upload a valid ZIP backup file.") from exc

    with archive:
        manifest = _read_archive_manifest(archive)
        manifest_branch = str(manifest.get("branch") or "").strip()
        if manifest_branch and manifest_branch != branch_id:
            raise ValueError(
                f'This backup belongs to branch "{manifest_branch}", not "{branch_id}".',
            )

        snapshot_format = str(manifest.get("snapshot_format") or "sql").strip().lower()
        if snapshot_format not in {"json", "sql"}:
            raise ValueError("Backup ZIP manifest has an unsupported snapshot format.")

        backup_type = str(manifest.get("backup_type") or BackupHistory.TYPE_MANUAL).strip().lower()
        if backup_type not in {BackupHistory.TYPE_MANUAL, BackupHistory.TYPE_AUTOMATED}:
            backup_type = BackupHistory.TYPE_MANUAL

        students = []
        alumni = []
        if snapshot_format == "json":
            students = _read_archive_json_member(
                archive,
                "data/students.json",
                required=True,
            )
            alumni = _read_archive_json_member(
                archive,
                "data/alumni.json",
                required=True,
            )
        else:
            sql_members = [
                member_name
                for member_name in archive.namelist()
                if member_name.startswith("sql/") and member_name.endswith(".sql")
            ]
            if not sql_members:
                raise ValueError("Backup ZIP must include at least one SQL export.")

        dataset_counts = manifest.get("dataset_counts") or {}
        student_count = (
            int(dataset_counts.get("students", 0))
            if isinstance(dataset_counts, dict)
            else 0
        )
        alumni_count = (
            int(dataset_counts.get("alumni", 0))
            if isinstance(dataset_counts, dict)
            else 0
        )

        if snapshot_format == "json":
            student_count = student_count or len(students)
            alumni_count = alumni_count or len(alumni)

        model_counts = manifest.get("model_counts") or {}
        if isinstance(model_counts, dict):
            record_count = student_count + alumni_count
            if record_count == 0:
                record_count = sum(
                    int(count)
                    for count in model_counts.values()
                    if isinstance(count, (int, float))
                )
        else:
            model_counts = {}
            record_count = student_count + alumni_count

        media_entries = manifest.get("media_entries") or []
        media_count = len(media_entries) if isinstance(media_entries, list) else 0
        models = manifest.get("models") or []

    return {
        "branch": manifest_branch or branch_id,
        "backup_type": backup_type,
        "snapshot_format": snapshot_format,
        "student_count": student_count,
        "alumni_count": alumni_count,
        "record_count": record_count,
        "media_count": media_count,
        "models": models if isinstance(models, list) else [],
        "model_counts": model_counts,
        "manifest": manifest,
    }


def store_uploaded_backup_archive(*, branch_id, uploaded_file_name, payload, created_by=None, created_by_name=""):
    archive_summary = inspect_uploaded_backup_archive(payload=payload, branch_id=branch_id)

    original_name = Path(uploaded_file_name or "uploaded-backup.zip").name or "uploaded-backup.zip"
    if not original_name.lower().endswith(".zip"):
        original_name = f"{original_name}.zip"

    branch_slug = slugify(branch_id) or "branch"
    timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
    archive_stem = slugify(Path(original_name).stem) or "uploaded-backup"
    archive_name = f"{archive_stem}_{timestamp}.zip"
    archive_storage_path = (
        f"branches/{branch_slug}/uploads/{timezone.now():%Y/%m/%d}/{archive_name}"
    )

    bucket, stored_archive_path = upload_backup_blob(
        object_path=archive_storage_path,
        payload=payload,
        content_type="application/zip",
    )

    history = create_backup_history(
        branch=branch_id,
        backup_type=archive_summary["backup_type"],
        file_path=stored_archive_path,
        sql_file_path="",
        backup_filename=original_name,
        storage_bucket=bucket,
        created_by=created_by,
        created_by_name=created_by_name,
        status=BackupHistory.STATUS_COMPLETED,
        progress=100,
        metadata={
            "branch": branch_id,
            "models": archive_summary["models"],
            "model_counts": archive_summary["model_counts"],
            "student_count": archive_summary["student_count"],
            "alumni_count": archive_summary["alumni_count"],
            "record_count": archive_summary["record_count"],
            "media_count": archive_summary["media_count"],
            "snapshot_format": archive_summary["snapshot_format"],
            "upload_source": "uploaded_archive",
            "uploaded_archive_name": original_name,
        },
        error_message="",
    )
    return history


def create_branch_backup(*, branch_id, backup_type, created_by=None, history=None, snapshot_data=None):
    history = history or create_backup_history(
        branch=branch_id,
        backup_type=backup_type,
        file_path="",
        sql_file_path="",
        backup_filename="pending.zip",
        created_by=created_by,
        status=BackupHistory.STATUS_IN_PROGRESS,
        progress=1,
    )
    history = get_backup_history(history.id) or history
    if history.status == BackupHistory.STATUS_DELETED:
        return history

    history = set_history_progress(
        history,
        status=BackupHistory.STATUS_IN_PROGRESS,
        progress=5,
        error_message="",
    )

    branch_slug = slugify(branch_id) or "branch"
    timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
    sql_file_name = f"{branch_slug}_{backup_type}_{timestamp}.sql"
    archive_name = f"{branch_slug}_{backup_type}_{timestamp}.zip"

    if snapshot_data is not None:
        sql_script = "-- Frontend snapshot backup generated by AICSync\nBEGIN;\nCOMMIT;\n"
        media_entries = []
        exported_models = []
        exported_model_counts = {}
        manifest, students_snapshot, alumni_snapshot, dataset_counts = _build_snapshot_manifest(
            branch_id,
            backup_type,
            snapshot_data,
        )
    else:
        (
            sql_script,
            media_entries,
            exported_models,
            exported_model_counts,
            dataset_counts,
        ) = _build_branch_backup_sql(branch_id)
        manifest = {
            "branch": branch_id,
            "generated_at": timezone.now().isoformat(),
            "backup_type": backup_type,
            "models": exported_models,
            "model_counts": exported_model_counts,
            "dataset_counts": dataset_counts,
            "media_entries": media_entries,
        }
        students_snapshot = None
        alumni_snapshot = None
    history = set_history_progress(history, progress=40)

    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"sql/{sql_file_name}", sql_script.encode("utf-8"))
        archive.writestr("metadata/manifest.json", json.dumps(manifest).encode("utf-8"))
        if students_snapshot is not None:
            archive.writestr(
                "data/students.json",
                json.dumps(students_snapshot, ensure_ascii=True, indent=2).encode("utf-8"),
            )
        if alumni_snapshot is not None:
            archive.writestr(
                "data/alumni.json",
                json.dumps(alumni_snapshot, ensure_ascii=True, indent=2).encode("utf-8"),
            )
        for media_entry in media_entries:
            media_path = media_entry["storage_path"]
            payload = _read_media_bytes(media_path)
            if payload is None:
                continue
            archive.writestr(f"media/{media_path}", payload)

    archive_buffer.seek(0)
    archive_payload = archive_buffer.getvalue()
    sql_payload = sql_script.encode("utf-8")

    base_path = f"branches/{branch_slug}/{timezone.now():%Y/%m/%d}"
    archive_storage_path = f"{base_path}/{archive_name}"
    sql_storage_path = f"{base_path}/{sql_file_name}"

    bucket, stored_archive_path = upload_backup_blob(
        object_path=archive_storage_path,
        payload=archive_payload,
        content_type="application/zip",
    )
    upload_backup_blob(
        object_path=sql_storage_path,
        payload=sql_payload,
        content_type="application/sql",
    )

    history_id = history.id
    history = update_backup_history(
        history_id,
        file_path=stored_archive_path,
        sql_file_path=sql_storage_path,
        backup_filename=archive_name,
        storage_bucket=bucket,
        status=BackupHistory.STATUS_COMPLETED,
        progress=100,
        metadata={
            "branch": branch_id,
            "models": exported_models,
            "model_counts": exported_model_counts,
            "student_count": dataset_counts["students"],
            "alumni_count": dataset_counts["alumni"],
            "record_count": (
                dataset_counts["students"] + dataset_counts["alumni"]
                if snapshot_data is not None
                else sum(exported_model_counts.values())
            ),
            "media_count": len(media_entries),
            "generated_sql_file": sql_file_name,
            "snapshot_format": "json" if snapshot_data is not None else "sql",
        },
        error_message="",
    )
    return history or get_backup_history(history_id)


def _purge_branch_records(branch_id, model_labels=None):
    scoped_models = _sort_models_for_insert(_get_branch_scoped_models())
    allowed_labels = set(model_labels or [])

    for model, branch_lookup in reversed(scoped_models):
        if allowed_labels and model._meta.label not in allowed_labels:
            continue
        model.objects.filter(**{branch_lookup: branch_id}).delete()


def _restore_media_from_archive(archive, history):
    try:
        manifest = json.loads(archive.read("metadata/manifest.json").decode("utf-8"))
    except KeyError:
        manifest = {}

    media_entries = manifest.get("media_entries", [])
    total_items = len(media_entries) or 1

    for index, media_entry in enumerate(media_entries, start=1):
        member_name = f"media/{media_entry['storage_path']}"
        try:
            payload = archive.read(member_name)
        except KeyError:
            continue
        upload_media_blob(
            object_path=media_entry["storage_path"],
            payload=payload,
            content_type=guess_content_type(media_entry["storage_path"]),
        )
        progress = 75 + int((index / total_items) * 20)
        set_history_progress(history, progress=min(progress, RESTORE_PROGRESS_STEPS["media_restored"]))


def restore_branch_backup(history):
    history = get_backup_history(history.id) or history
    if history.status == BackupHistory.STATUS_DELETED:
        return history

    history = update_backup_history(
        history.id,
        status=BackupHistory.STATUS_IN_PROGRESS,
        progress=RESTORE_PROGRESS_STEPS["started"],
        restore_started_at=timezone.now(),
        error_message="",
    ) or history

    archive_payload = download_backup_blob(object_path=history.file_path)
    history = set_history_progress(history, progress=RESTORE_PROGRESS_STEPS["downloaded"])

    with zipfile.ZipFile(io.BytesIO(archive_payload), "r") as archive:
        manifest = json.loads(archive.read("metadata/manifest.json").decode("utf-8"))
        branch_id = manifest.get("branch") or history.branch
        if manifest.get("snapshot_format") == "json":
            students = _read_archive_json_member(
                archive,
                "data/students.json",
                required=True,
            )
            alumni = _read_archive_json_member(
                archive,
                "data/alumni.json",
                required=True,
            )
            save_backup_snapshot(branch_id, students, alumni)
            return update_backup_history(
                history.id,
                status=BackupHistory.STATUS_COMPLETED,
                progress=RESTORE_PROGRESS_STEPS["finished"],
                restore_finished_at=timezone.now(),
                error_message="",
                metadata={
                    **(history.metadata or {}),
                    "snapshot_format": "json",
                    "student_count": len(students),
                    "alumni_count": len(alumni),
                    "record_count": len(students) + len(alumni),
                },
            ) or history

        model_labels = manifest.get("models") or []
        sql_members = [name for name in archive.namelist() if name.startswith("sql/") and name.endswith(".sql")]
        if not sql_members:
            raise ValueError("Backup archive does not contain a SQL export.")
        sql_script = archive.read(sql_members[0]).decode("utf-8")

        with transaction.atomic():
            _purge_branch_records(branch_id, model_labels=model_labels)
            history = set_history_progress(history, progress=RESTORE_PROGRESS_STEPS["purged"])
            _execute_sql_script(sql_script)
            history = set_history_progress(history, progress=RESTORE_PROGRESS_STEPS["sql_restored"])
            _restore_media_from_archive(archive, history)

    return update_backup_history(
        history.id,
        status=BackupHistory.STATUS_COMPLETED,
        progress=RESTORE_PROGRESS_STEPS["finished"],
        restore_finished_at=timezone.now(),
        error_message="",
    ) or history


def read_backup_snapshot(history):
    archive_payload = download_backup_blob(object_path=history.file_path)

    with zipfile.ZipFile(io.BytesIO(archive_payload), "r") as archive:
        try:
            manifest = json.loads(archive.read("metadata/manifest.json").decode("utf-8"))
        except KeyError:
            manifest = {}

        def read_json_member(member_name):
            try:
                return json.loads(archive.read(member_name).decode("utf-8"))
            except KeyError:
                return []

        return {
            "branch": manifest.get("branch") or history.branch,
            "snapshot_format": manifest.get("snapshot_format") or "sql",
            "students": read_json_member("data/students.json"),
            "alumni": read_json_member("data/alumni.json"),
        }


def delete_backup_artifacts(history):
    archive_deleted = delete_backup_blob(object_path=history.file_path) if history.file_path else True
    sql_deleted = delete_backup_blob(object_path=history.sql_file_path) if history.sql_file_path else True
    update_backup_history(
        history.id,
        status=BackupHistory.STATUS_DELETED,
        progress=0,
    )
    return archive_deleted and sql_deleted
