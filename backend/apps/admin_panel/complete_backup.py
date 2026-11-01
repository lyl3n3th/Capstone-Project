"""Versioned recovery archives for the authoritative student database.

No SQL from an uploaded archive is executed. Database replacement is performed
by a fixed, service-role-only RPC in a single PostgreSQL transaction.
"""
import hashlib
import hmac
import io
import json
import mimetypes
import uuid
import zipfile
from urllib import parse, request

from django.conf import settings
from django.utils import timezone

from apps.core.supabase_rest import SupabaseRestClient
from .storage import _build_headers, _storage_request, get_storage_config

FORMAT = "branch-database-v2"
DATA_MEMBER = "data/database.json"
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024


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
    snapshot = SupabaseRestClient.from_settings().rpc("export_branch_backup_data", {"p_branch": branch})
    if not isinstance(snapshot, dict) or snapshot.get("version") != 2:
        raise ValueError("The database backup migration is missing or returned an unsupported snapshot.")
    # The alumni screen still keeps its display records in the synchronized
    # browser snapshot. Preserve these separately; never use them as profiles.
    snapshot["alumni"] = alumni or []
    data = _encode(snapshot)
    files = {}
    for record, path_key, bucket_key in _references(snapshot):
        reference = (record[bucket_key], record[path_key])
        if reference not in files:
            files[reference] = _object("GET", *reference)
    counts = {name: len(rows) for name, rows in snapshot["tables"].items()}
    manifest = {
        "branch": branch, "snapshot_format": FORMAT, "version": 2,
        "backup_type": backup_type, "generated_at": timezone.now().isoformat(),
        "database_sha256": hashlib.sha256(data).hexdigest(),
        "models": list(counts), "model_counts": counts,
        "dataset_counts": {"students": counts["student_profiles"], "alumni": len(snapshot["alumni"])},
        "media_entries": [],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(DATA_MEMBER, data)
        for index, ((bucket, path), payload) in enumerate(files.items()):
            member = f"attachments/{index}"
            archive.writestr(member, payload)
            manifest["media_entries"].append({"bucket": bucket, "path": path, "member": member,
                                               "sha256": hashlib.sha256(payload).hexdigest()})
        manifest["signature"] = _signature(manifest)
        archive.writestr("metadata/manifest.json", _encode(manifest))
    return buffer.getvalue(), manifest


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
