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
_ARCHIVE_PROGRESS_CALLBACK = ContextVar("branch_backup_progress_callback", default=None)


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


def _references(value):
    if isinstance(value, dict):
        path_key = "storage_path" if value.get("storage_path") else "storagePath"
        bucket_key = "storage_bucket" if value.get("storage_bucket") else "storageBucket"
        if value.get(path_key):
            if not value.get(bucket_key):
                raise ValueError("A saved attachment has a storage path but no bucket; repair it before backing up.")
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
