import json
import mimetypes
import os
from urllib import error, parse, request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage


def get_storage_config():
    project_url = getattr(settings, "SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "")
    service_role_key = getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
    bucket = getattr(settings, "SUPABASE_BACKUP_BUCKET", "") or os.getenv(
        "SUPABASE_BACKUP_BUCKET", "branch-backups"
    )
    if (
        not project_url
        or not service_role_key
        or project_url.startswith("your-")
        or service_role_key.startswith("your-")
    ):
        raise ImproperlyConfigured("Supabase storage credentials are required for backups.")
    return project_url.rstrip("/"), service_role_key, bucket


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
    except ImproperlyConfigured:
        stored_path = default_storage.save(object_path, ContentFile(payload))
        return "local-media", stored_path

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
    with request.urlopen(upload_request, timeout=60):
        return bucket, object_path


def download_backup_blob(*, object_path):
    try:
        project_url, api_key, bucket = get_storage_config()
    except ImproperlyConfigured:
        with default_storage.open(object_path, "rb") as file_handle:
            return file_handle.read()

    download_url = (
        f"{project_url}/storage/v1/object/"
        f"{parse.quote(bucket, safe='')}/{parse.quote(object_path, safe='/')}"
    )
    download_request = request.Request(download_url, headers=_build_headers(api_key))
    with request.urlopen(download_request, timeout=60) as response:
        return response.read()


def delete_backup_blob(*, object_path):
    try:
        project_url, api_key, bucket = get_storage_config()
    except ImproperlyConfigured:
        if default_storage.exists(object_path):
            default_storage.delete(object_path)
            return True
        return False

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
