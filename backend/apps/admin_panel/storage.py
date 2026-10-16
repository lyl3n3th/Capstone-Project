import io
import hashlib
import json
import mimetypes
import os
import zipfile
from contextlib import contextmanager
from urllib import error, parse, request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage


LOCAL_BACKUP_STORAGE_BUCKET = "local-media"


class BackupStorageError(ValueError):
    """A storage failure with a safe message suitable for the admin UI."""

    def __init__(self, message, *, status_code=503):
        super().__init__(message)
        self.status_code = status_code


@contextmanager
def _storage_request(http_request):
    try:
        with request.urlopen(http_request, timeout=60) as response:
            yield response
    except error.HTTPError as exc:
        try:
            details = json.loads(exc.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            details = {}
        if not isinstance(details, dict):
            details = {}
        storage_code = str(details.get("code") or details.get("error") or "").lower()
        storage_message = str(details.get("message") or "").lower()
        if ("bucket" in storage_message and "not found" in storage_message) or storage_code == "nosuchbucket":
            raise BackupStorageError(
                "The backup storage bucket is missing. Ask an administrator to configure permanent backup storage."
            ) from exc
        if exc.code in (401, 403) or storage_code in ("invalidjwt", "accessdenied"):
            raise BackupStorageError(
                "Backup storage access was denied. Ask an administrator to check the backend storage credentials."
            ) from exc
        if exc.code == 404 or storage_code == "nosuchkey" or "not found" in storage_message:
            raise BackupStorageError(
                "The backup ZIP is missing from storage. Recover a surviving copy before downloading or restoring it.",
                status_code=404,
            ) from exc
        raise BackupStorageError(
            "Backup storage could not complete the request. Check the bucket configuration and try again."
        ) from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise BackupStorageError(
            "Backup storage is temporarily unreachable. Try again shortly."
        ) from exc


def get_storage_config():
    project_url = (getattr(settings, "SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "")).strip()
    service_role_key = (getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )).strip()
    bucket = (getattr(settings, "SUPABASE_BACKUP_BUCKET", "") or os.getenv(
        "SUPABASE_BACKUP_BUCKET", "branch-backups"
    )).strip()
    if (
        not project_url
        or not service_role_key
        or project_url.startswith("your-")
        or service_role_key.startswith("your-")
    ):
        raise ImproperlyConfigured("Supabase storage credentials are required for backups.")
    parsed_url = parse.urlparse(project_url)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        raise ImproperlyConfigured("A valid Supabase project URL is required for backups.")
    if not bucket or bucket == LOCAL_BACKUP_STORAGE_BUCKET:
        raise ImproperlyConfigured("A private Supabase backup bucket is required.")
    return project_url.rstrip("/"), service_role_key.strip(), bucket.strip()


def _build_headers(api_key, *, content_type=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "apikey": api_key,
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def upload_backup_blob(*, object_path, payload, content_type="application/octet-stream"):
    try:
        project_url, api_key, bucket = get_storage_config()
    except ImproperlyConfigured as exc:
        if not getattr(settings, "BACKUP_ALLOW_LOCAL_STORAGE", False):
            raise BackupStorageError(
                "Permanent backup storage is not configured. Ask an administrator to configure Supabase backup storage on the backend."
            ) from exc
        stored_path = default_storage.save(object_path, ContentFile(payload))
        return LOCAL_BACKUP_STORAGE_BUCKET, stored_path

    upload_url = (
        f"{project_url}/storage/v1/object/"
        f"{parse.quote(bucket, safe='')}/{parse.quote(object_path, safe='/')}"
    )
    upload_request = request.Request(
        upload_url,
        data=payload,
        method="POST",
        headers={
            **_build_headers(api_key, content_type=content_type),
            "x-upsert": "true",
        },
    )
    with _storage_request(upload_request):
        return bucket, object_path


def download_backup_blob(*, object_path, storage_bucket=None):
    # Archives made before Supabase backup storage was configured live in the
    # Django media storage.  Keep resolving those records locally even if
    # Supabase is configured later.
    if storage_bucket == LOCAL_BACKUP_STORAGE_BUCKET:
        with default_storage.open(object_path, "rb") as file_handle:
            return file_handle.read()

    try:
        project_url, api_key, configured_bucket = get_storage_config()
    except ImproperlyConfigured as exc:
        if storage_bucket or not getattr(settings, "BACKUP_ALLOW_LOCAL_STORAGE", False):
            raise BackupStorageError(
                "Permanent backup storage is not configured. Ask an administrator to check the backend storage credentials."
            ) from exc
        with default_storage.open(object_path, "rb") as file_handle:
            return file_handle.read()

    # A history record retains the bucket that held the archive when it was
    # created.  Prefer it so configuration changes do not make an existing
    # archive appear to be an invalid ZIP file.
    bucket = storage_bucket or configured_bucket

    download_url = (
        f"{project_url}/storage/v1/object/authenticated/"
        f"{parse.quote(bucket, safe='')}/{parse.quote(object_path, safe='/')}"
    )
    download_request = request.Request(download_url, headers=_build_headers(api_key))
    with _storage_request(download_request) as response:
        return response.read()


def verify_backup_archive(*, object_path, storage_bucket, expected_payload):
    """Read back this exact object, without falling back to another location."""
    payload = download_backup_blob(object_path=object_path, storage_bucket=storage_bucket)
    if hashlib.sha256(payload).digest() != hashlib.sha256(expected_payload).digest():
        raise BackupStorageError(
            "The saved backup failed verification. Create a new backup before relying on it.",
            status_code=409,
        )


def download_backup_archive_blob(*, object_path, storage_bucket=None):
    """Return a readable ZIP archive, recovering from stale bucket metadata.

    Backup history is kept longer than storage configuration.  A history row
    can therefore reference an old bucket (or predate the bucket column).
    Try only the known backup locations and validate the returned bytes before
    a restore uses them.
    """
    try:
        _project_url, _api_key, configured_bucket = get_storage_config()
    except ImproperlyConfigured as exc:
        config_error = exc
        configured_bucket = None
    else:
        config_error = None

    candidate_buckets = []
    for bucket in (storage_bucket, configured_bucket, LOCAL_BACKUP_STORAGE_BUCKET):
        if bucket and bucket not in candidate_buckets:
            candidate_buckets.append(bucket)

    failures = []
    for candidate_bucket in candidate_buckets:
        try:
            payload = download_backup_blob(
                object_path=object_path,
                storage_bucket=candidate_bucket,
            )
        except (BackupStorageError, FileNotFoundError) as exc:
            failures.append(exc)
            continue

        if zipfile.is_zipfile(io.BytesIO(payload)):
            return payload, candidate_bucket

        failures.append(BackupStorageError(
            "The stored backup is not a valid ZIP archive. Recover an intact backup copy.",
            status_code=409,
        ))

    for failure in failures:
        if isinstance(failure, BackupStorageError) and failure.status_code != 404:
            raise failure
    if storage_bucket != LOCAL_BACKUP_STORAGE_BUCKET and config_error is not None:
        raise BackupStorageError(
            "Permanent backup storage is not configured. Ask an administrator to check the backend storage credentials."
        ) from config_error
    raise BackupStorageError(
        "The backup ZIP is missing from storage. If it was saved locally before deployment, recover a surviving copy from the original computer or server.",
        status_code=404,
    ) from (failures[-1] if failures else None)


def delete_backup_blob(*, object_path, storage_bucket=None):
    if storage_bucket == LOCAL_BACKUP_STORAGE_BUCKET:
        if default_storage.exists(object_path):
            default_storage.delete(object_path)
            return True
        return False

    try:
        project_url, api_key, configured_bucket = get_storage_config()
    except ImproperlyConfigured:
        if default_storage.exists(object_path):
            default_storage.delete(object_path)
            return True
        return False

    bucket = storage_bucket or configured_bucket

    delete_url = f"{project_url}/storage/v1/object/{parse.quote(bucket, safe='')}"
    payload = json.dumps([object_path]).encode("utf-8")
    delete_request = request.Request(
        delete_url,
        data=payload,
        method="DELETE",
        headers=_build_headers(api_key, content_type="application/json"),
    )
    try:
        with request.urlopen(delete_request, timeout=60):
            return True
    except error.HTTPError:
        return False


def upload_media_blob(*, object_path, payload, content_type=None):
    project_url = getattr(settings, "SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "")
    api_key = getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
    bucket = getattr(settings, "SUPABASE_STORAGE_BUCKET", "") or os.getenv(
        "SUPABASE_STORAGE_BUCKET", "reports"
    )
    if (
        not project_url
        or not api_key
        or project_url.startswith("your-")
        or api_key.startswith("your-")
    ):
        stored_path = default_storage.save(object_path, ContentFile(payload))
        return "local-media", stored_path

    upload_url = (
        f"{project_url.rstrip('/')}/storage/v1/object/"
        f"{parse.quote(bucket, safe='')}/{parse.quote(object_path, safe='/')}"
    )
    media_request = request.Request(
        upload_url,
        data=payload,
        method="POST",
        headers={
            **_build_headers(api_key, content_type=content_type or "application/octet-stream"),
            "x-upsert": "true",
        },
    )
    with request.urlopen(media_request, timeout=60):
        return bucket, object_path


def guess_content_type(file_name):
    return mimetypes.guess_type(file_name)[0] or "application/octet-stream"
