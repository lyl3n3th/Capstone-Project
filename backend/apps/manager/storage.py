import mimetypes
import os
import posixpath
import uuid
from urllib import error, parse, request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import default_storage
from django.utils.text import slugify


def _get_required_setting(name):
    value = getattr(settings, name, "") or os.getenv(name)
    if not value or value.startswith("your-"):
        raise ImproperlyConfigured(f"{name} must be configured for report uploads.")
    return value


def _store_attachment_locally(*, uploaded_file, branch_name, sender_id, http_request=None):
    safe_branch = slugify(branch_name) or "branch"
    safe_file_name = slugify(os.path.splitext(uploaded_file.name)[0]) or "attachment"
    extension = os.path.splitext(uploaded_file.name)[1]
    relative_path = posixpath.join(
        "reports",
        safe_branch,
        str(sender_id),
        f"{uuid.uuid4().hex}-{safe_file_name}{extension}",
    )
    stored_path = default_storage.save(relative_path, uploaded_file)
    relative_url = default_storage.url(stored_path)

    if http_request:
        return http_request.build_absolute_uri(relative_url)

    site_url = getattr(settings, "SITE_URL", "").rstrip("/")
    if site_url:
        return f"{site_url}{relative_url}"

    return relative_url


def upload_report_attachment(*, uploaded_file, branch_name, sender_id, http_request=None):
    try:
        project_url = _get_required_setting("SUPABASE_URL").rstrip("/")
        bucket_name = _get_required_setting("SUPABASE_STORAGE_BUCKET")
        api_key = _get_required_setting("SUPABASE_SERVICE_ROLE_KEY")
    except ImproperlyConfigured:
        return _store_attachment_locally(
            uploaded_file=uploaded_file,
            branch_name=branch_name,
            sender_id=sender_id,
            http_request=http_request,
        )

    project_url = _get_required_setting("SUPABASE_URL").rstrip("/")
    safe_branch = slugify(branch_name) or "branch"
    safe_file_name = slugify(os.path.splitext(uploaded_file.name)[0]) or "attachment"
    extension = os.path.splitext(uploaded_file.name)[1]
    object_name = posixpath.join(
        "reports",
        safe_branch,
        str(sender_id),
        f"{uuid.uuid4().hex}-{safe_file_name}{extension}",
    )

    upload_url = (
        f"{project_url}/storage/v1/object/"
        f"{parse.quote(bucket_name, safe='')}/{parse.quote(object_name, safe='/')}"
    )
    content_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0]
    payload = uploaded_file.read()
    upload_request = request.Request(
        upload_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "apikey": api_key,
            "x-upsert": "false",
            "Content-Type": content_type or "application/octet-stream",
        },
    )

    try:
        with request.urlopen(upload_request, timeout=30):
            return (
                f"{project_url}/storage/v1/object/public/"
                f"{parse.quote(bucket_name, safe='')}/{parse.quote(object_name, safe='/')}"
            )
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"Supabase Storage upload failed with status {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        return _store_attachment_locally(
            uploaded_file=uploaded_file,
            branch_name=branch_name,
            sender_id=sender_id,
            http_request=http_request,
        )
