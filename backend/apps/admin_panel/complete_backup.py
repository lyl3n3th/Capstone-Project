"""Versioned recovery archives for the authoritative student database.

No SQL from an uploaded archive is executed. Database replacement is performed
by a fixed, service-role-only RPC in a single PostgreSQL transaction.
"""
import hashlib
import hmac
import io
import json
import mimetypes
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from contextvars import ContextVar
from urllib import parse, request

from django.conf import settings
from django.utils import timezone

from apps.core.supabase_rest import SupabaseRestClient
from .storage import _build_headers, _storage_request, get_storage_config

FORMAT = "branch-database-v2"
DATA_MEMBER = "data/database.json"
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
DEFAULT_ATTACHMENT_STORAGE_BUCKET = "admission-requirements"
_ARCHIVE_PROGRESS_CALLBACK = ContextVar("branch_backup_progress_callback", default=None)
_ARCHIVED_REFERENCE_FIELDS = {
    "student_id",
    "studentid",
    "student_number",
    "studentnumber",
    "tracking_number",
    "trackingnumber",
}


def _normalized_backup_reference(value):
    if value is None:
        return ""
    return str(value).strip().casefold()


def _record_matches_archived_reference(record, archived_references):
    if not isinstance(record, dict):
        return False
    for key, value in record.items():
        if (
            str(key).replace("-", "_").lower() in _ARCHIVED_REFERENCE_FIELDS
            and _normalized_backup_reference(value) in archived_references
        ):
            return True
    return False


def _is_archived_trash_record(record):
    if not isinstance(record, dict):
        return False
    if record.get("archivedAt") or record.get("archived_at"):
        return True
    return _normalized_backup_reference(record.get("status")) == "archived"


def _collect_archived_record_references(record, archived_references):
    if not isinstance(record, dict):
        return
    for key, value in record.items():
        if str(key).replace("-", "_").lower() in (_ARCHIVED_REFERENCE_FIELDS | {"id"}):
            normalized = _normalized_backup_reference(value)
            if normalized:
                archived_references.add(normalized)


def _scope_matches_archived_student(scope, archived_references):
    normalized_scope = parse.unquote(str(scope or "")).casefold()
    for reference in archived_references:
        if normalized_scope.startswith(
            f"imported-student-credential-{reference}-"
        ) or normalized_scope.startswith(f"credential-review:{reference}:"):
            return True
    return False


def _exclude_archived_records(snapshot):
    """Omit records in the Admin Archive from manual and scheduled archives."""
    tables = snapshot.get("tables")
    if not isinstance(tables, dict):
        return snapshot

    student_profiles = tables.get("student_profiles", [])
    archived_profiles = [
        row
        for row in student_profiles
        if _normalized_backup_reference(row.get("status")) == "archived"
    ]
    archived_profile_ids = {
        _normalized_backup_reference(row.get("id"))
        for row in archived_profiles
        if row.get("id")
    }
    archived_application_ids = {
        _normalized_backup_reference(row.get("admission_application_id"))
        for row in archived_profiles
        if row.get("admission_application_id")
    }
    archived_student_references = set(archived_profile_ids)
    for row in archived_profiles:
        _collect_archived_record_references(row, archived_student_references)

    local_records = tables.get("branch_local_storage_records", [])
    if not isinstance(local_records, list):
        local_records = []
    archived_enrollee_references = set()
    archived_request_references = set()
    for stored_record in local_records:
        scope = str(stored_record.get("scope") or "").lower()
        archived_references = (
            archived_enrollee_references
            if scope == "enrollees"
            else archived_request_references
            if scope == "enrollment-requests"
            else None
        )
        payload = stored_record.get("payload")
        if archived_references is not None and isinstance(payload, list):
            for item in payload:
                if _is_archived_trash_record(item):
                    _collect_archived_record_references(item, archived_references)

    archived_enrollment_rows = []
    for row in tables.get("branch_enrollment_requests", []):
        payload = row.get("payload")
        if _is_archived_trash_record(payload):
            archived_enrollment_rows.append(row)
            _collect_archived_record_references(row, archived_request_references)
            _collect_archived_record_references(payload, archived_request_references)

    applications = tables.get("admission_applications", [])
    for row in applications:
        application_id = _normalized_backup_reference(row.get("id"))
        tracking_number = _normalized_backup_reference(row.get("tracking_number"))
        if (
            application_id in archived_application_ids
            or application_id in archived_student_references
            or tracking_number in archived_student_references
        ):
            if application_id:
                archived_application_ids.add(application_id)
            if tracking_number:
                archived_student_references.add(tracking_number)

    for row in applications:
        application_id = _normalized_backup_reference(row.get("id"))
        tracking_number = _normalized_backup_reference(row.get("tracking_number"))
        if (
            application_id in archived_enrollee_references
            or tracking_number in archived_enrollee_references
        ):
            if application_id:
                archived_application_ids.add(application_id)
            if tracking_number:
                archived_enrollee_references.add(tracking_number)

    tables["student_profiles"] = [
        row for row in student_profiles
        if _normalized_backup_reference(row.get("status")) != "archived"
    ]

    for table_name in (
        "student_contact_details",
        "student_import_details",
        "student_portal_accounts",
    ):
        tables[table_name] = [
            row for row in tables.get(table_name, [])
            if _normalized_backup_reference(row.get("student_id"))
            not in archived_profile_ids
        ]

    for table_name in (
        "branch_student_planning_states",
        "branch_student_subject_plans",
        "branch_student_schedule_requests",
        "branch_student_grade_records",
        "student_payments",
        "instructor_evaluation_submissions",
    ):
        tables[table_name] = [
            row for row in tables.get(table_name, [])
            if not _record_matches_archived_reference(
                row, archived_student_references
            )
        ]

    tables["admission_applications"] = [
        row for row in applications
        if _normalized_backup_reference(row.get("id"))
        not in archived_application_ids
    ]
    tables["admission_application_requirement_files"] = [
        row for row in tables.get("admission_application_requirement_files", [])
        if _normalized_backup_reference(row.get("application_id"))
        not in archived_application_ids
    ]
    tables["branch_enrollment_requests"] = [
        row for row in tables.get("branch_enrollment_requests", [])
        if row not in archived_enrollment_rows
        and not _record_matches_archived_reference(
            row, archived_student_references
        )
    ]

    for stored_record in local_records:
        scope = str(stored_record.get("scope") or "").lower()
        if scope == "enrollees":
            scope_references = archived_student_references | archived_enrollee_references
            exclude_archive_marked_rows = True
        elif scope == "enrollment-requests":
            scope_references = archived_student_references | archived_request_references
            exclude_archive_marked_rows = True
        else:
            scope_references = archived_student_references
            exclude_archive_marked_rows = False

        payload = stored_record.get("payload")
        if isinstance(payload, list):
            stored_record["payload"] = [
                item
                for item in payload
                if not (
                    exclude_archive_marked_rows
                    and _is_archived_trash_record(item)
                )
                and not _record_matches_archived_reference(item, scope_references)
            ]
    tables["branch_local_storage_records"] = [
        row for row in local_records
        if not _scope_matches_archived_student(row.get("scope"), archived_student_references)
        and not _scope_matches_archived_student(row.get("scope"), archived_enrollee_references)
    ]

    for row in tables.get("instructor_grade_submissions", []):
        for key in ("records", "errorRows", "error_rows"):
            if isinstance(row.get(key), list):
                row[key] = [
                    record
                    for record in row[key]
                    if not _record_matches_archived_reference(
                        record, archived_student_references
                    )
                ]

    return snapshot


def _encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _signature(manifest):
    # Restoring a ZIP received from outside this backend must not permit forged
    # database records or paths. Keep this key stable across backend deployments.
    key = getattr(settings, "BACKUP_SIGNING_KEY", "") or getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise ValueError("A private backend backup signing key is required.")
    return hmac.new(str(key).encode(), _encode(manifest), hashlib.sha256).hexdigest()


def _object(method, bucket, path, payload=None):
    if not bucket or not path or path.startswith("/") or any(p in (".", "..") for p in path.split("/")):
        raise ValueError("Invalid credential storage reference in backup.")
    url, key, _ = get_storage_config()
    endpoint = f"{url}/storage/v1/object/{parse.quote(bucket, safe='')}/{parse.quote(path, safe='/')}"
    headers = _build_headers(key, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream")
    headers["x-upsert"] = "false"
    with _storage_request(request.Request(endpoint, method=method, data=payload, headers=headers)) as response:
        return response.read()


@contextmanager
def archive_progress_reporting(callback):
    token = _ARCHIVE_PROGRESS_CALLBACK.set(callback)
    try:
        yield
    finally:
        _ARCHIVE_PROGRESS_CALLBACK.reset(token)


def _report_progress(progress):
    callback = _ARCHIVE_PROGRESS_CALLBACK.get()
    if callback:
        callback(progress)


def _write_json_member(archive, member_name, value):
    """Write canonical JSON into the ZIP without building a second full copy."""
    digest = hashlib.sha256()
    encoder = json.JSONEncoder(sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    with archive.open(member_name, "w", force_zip64=True) as output:
        for part in encoder.iterencode(value):
            chunk = part.encode("utf-8")
            digest.update(chunk)
            output.write(chunk)
    return digest.hexdigest()


def _write_object_member(archive, bucket, path, member_name):
    """Copy one referenced storage object directly into the ZIP."""
    if not bucket or not path or path.startswith("/") or any(p in (".", "..") for p in path.split("/")):
        raise ValueError("Invalid credential storage reference in backup.")
    url, key, _ = get_storage_config()
    endpoint = f"{url}/storage/v1/object/{parse.quote(bucket, safe='')}/{parse.quote(path, safe='/')}"
    headers = _build_headers(key, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream")
    digest = hashlib.sha256()
    with _storage_request(request.Request(endpoint, headers=headers)) as response:
        with archive.open(member_name, "w", force_zip64=True) as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                output.write(chunk)
    return digest.hexdigest()


def _reference_key(value, snake_key, camel_key, *, default):
    if value.get(snake_key):
        return snake_key
    if value.get(camel_key):
        return camel_key
    if snake_key in value:
        return snake_key
    if camel_key in value:
        return camel_key
    return default


def _references(value):
    if isinstance(value, dict):
        path_key = _reference_key(
            value, "storage_path", "storagePath", default="storage_path"
        )
        bucket_key = _reference_key(
            value,
            "storage_bucket",
            "storageBucket",
            default="storage_bucket" if path_key == "storage_path" else "storageBucket",
        )
        if value.get(path_key):
            if not value.get(bucket_key):
                # Older admission and imported-student attachment records omit
                # the bucket; the application has always resolved those through
                # this bucket. Materialize it so backup and restore both retain
                # the exact object reference.
                value[bucket_key] = DEFAULT_ATTACHMENT_STORAGE_BUCKET
            yield value, path_key, bucket_key
        for nested in value.values():
            yield from _references(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _references(nested)


def create_archive(branch, backup_type, *, alumni=None):
    _report_progress(7)
    snapshot = SupabaseRestClient.from_settings().rpc("export_branch_backup_data", {"p_branch": branch})
    if not isinstance(snapshot, dict) or snapshot.get("version") != 2:
        raise ValueError("The database backup migration is missing or returned an unsupported snapshot.")
    snapshot = _exclude_archived_records(snapshot)
    # The alumni screen still keeps its display records in the synchronized
    # browser snapshot. Preserve these separately; never use them as profiles.
    snapshot["alumni"] = alumni or []
    _report_progress(15)
    references = list(dict.fromkeys(
        (record[bucket_key], record[path_key])
        for record, path_key, bucket_key in _references(snapshot)
    ))
    counts = {name: len(rows) for name, rows in snapshot["tables"].items()}
    manifest = {
        "branch": branch, "snapshot_format": FORMAT, "version": 2,
        "backup_type": backup_type, "generated_at": timezone.now().isoformat(),
        "models": list(counts), "model_counts": counts,
        "dataset_counts": {"students": counts["student_profiles"], "alumni": len(snapshot["alumni"])},
        "media_entries": [],
    }
    # Roll large ZIPs onto Render's temporary filesystem rather than retaining
    # the full archive and every referenced attachment in RAM at once.
    buffer = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    try:
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            manifest["database_sha256"] = _write_json_member(archive, DATA_MEMBER, snapshot)
            _report_progress(20)
            total_references = len(references)
            for index, (bucket, path) in enumerate(references, start=1):
                member = f"attachments/{index - 1}"
                digest = _write_object_member(archive, bucket, path, member)
                manifest["media_entries"].append({
                    "bucket": bucket,
                    "path": path,
                    "member": member,
                    "sha256": digest,
                })
                _report_progress(20 + int(index / total_references * 45))
            if not total_references:
                _report_progress(65)
            manifest["signature"] = _signature(manifest)
            archive.writestr("metadata/manifest.json", _encode(manifest))

        _report_progress(70)
        # Release the database snapshot before loading the final ZIP for upload.
        del snapshot
        del references
        buffer.seek(0)
        return buffer.read(), manifest
    finally:
        buffer.close()


def validate_archive(archive, branch):
    infos = archive.infolist()
    if len({info.filename for info in infos}) != len(infos) or sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
        raise ValueError("Backup contains duplicate members or exceeds the recovery size limit.")
    manifest = json.loads(archive.read("metadata/manifest.json"))
    signature = manifest.pop("signature", "")
    if not isinstance(signature, str) or not hmac.compare_digest(signature, _signature(manifest)):
        raise ValueError("Backup verification failed. Use an original archive from this system with the same backup signing key.")
    if manifest.get("snapshot_format") != FORMAT or manifest.get("branch") != branch:
        raise ValueError("Backup format or branch does not match the restore target.")
    data = archive.read(DATA_MEMBER)
    if hashlib.sha256(data).hexdigest() != manifest["database_sha256"]:
        raise ValueError("Backup database checksum does not match.")
    snapshot = json.loads(data)
    refs = {(row[bk], row[pk]) for row, pk, bk in _references(snapshot)}
    entries = manifest["media_entries"]
    if refs != {(entry["bucket"], entry["path"]) for entry in entries} or len(entries) != len(refs):
        raise ValueError("Backup attachments do not match the database references.")
    for entry in entries:
        if hashlib.sha256(archive.read(entry["member"])).hexdigest() != entry["sha256"]:
            raise ValueError("Backup attachment checksum does not match.")
    return snapshot, manifest


def restore_archive(archive, branch):
    snapshot, manifest = validate_archive(archive, branch)
    mapping = {}
    prefix = f"backup-restores/{uuid.uuid4()}"
    try:
        # New object names leave all currently used files intact if DB restoration fails.
        for index, entry in enumerate(manifest["media_entries"]):
            bucket, old_path = entry["bucket"], entry["path"]
            path = f"{prefix}/{index}/{old_path.rsplit('/', 1)[-1]}"
            _object("POST", bucket, path, archive.read(entry["member"]))
            mapping[bucket, old_path] = path
        for record, path_key, bucket_key in _references(snapshot):
            record[path_key] = mapping[record[bucket_key], record[path_key]]
            # Expired signed URLs are regenerated by the normal credential reader.
            if "url" in record:
                record["url"] = ""
        counts = SupabaseRestClient.from_settings().rpc("restore_branch_backup_data", {
            "p_branch": branch, "p_snapshot": snapshot,
        })
        return {"counts": counts, "alumni": snapshot.get("alumni", [])}
    except Exception:
        # An HTTP timeout is ambiguous: PostgreSQL might have committed. Never
        # delete staged files here; doing so could break successfully restored
        # credentials. Unreferenced objects can be cleaned up after reconciliation.
        raise
