import json
import os
from urllib import error, parse, request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


TRUTHY_VALUES = {"1", "true", "yes", "on"}


class SupabaseRestError(RuntimeError):
    """Raised when a Supabase REST request fails."""


def is_supabase_feature_enabled(setting_name):
    raw_value = getattr(settings, setting_name, os.getenv(setting_name, "false"))
    return str(raw_value).strip().lower() in TRUTHY_VALUES


class SupabaseRestClient:
    def __init__(self, project_url, api_key):
        self.base_url = f"{project_url.rstrip('/')}/rest/v1"
        self.api_key = api_key

    @classmethod
    def from_settings(cls):
        project_url = getattr(settings, "SUPABASE_URL", "") or os.getenv("SUPABASE_URL", "")
        api_key = getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        )

        if (
            not project_url
            or not api_key
            or str(project_url).startswith("your-")
            or str(api_key).startswith("your-")
        ):
            raise ImproperlyConfigured("Supabase REST credentials are required for this feature.")

        return cls(project_url, api_key)

    def select(self, table, *, filters=None, select="*", order=None, limit=None):
        query = [("select", select)]
        query.extend((filters or {}).items())
        if order:
            query.append(("order", order))
        if limit is not None:
            query.append(("limit", str(limit)))
        return self._request("GET", table, query=query)

    def select_page(self, table, *, filters=None, select="*", order=None, limit, offset=0):
        query = [("select", select)]
        query.extend((filters or {}).items())
        if order:
            query.append(("order", order))

        headers = {
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": f"{offset}-{offset + limit - 1}",
        }
        rows, response_headers = self._request(
            "GET",
            table,
            query=query,
            headers=headers,
            return_headers=True,
        )

        content_range = response_headers.get("Content-Range") or ""
        total = None
        if "/" in content_range:
            total_value = content_range.rsplit("/", 1)[1]
            if total_value.isdigit():
                total = int(total_value)

        if total is None:
            raise SupabaseRestError(
                "Supabase did not return an exact count for the paginated request."
            )

        return rows or [], total

    def insert(self, table, payload, *, upsert=False, on_conflict=None):
        headers = {}
        prefer_parts = ["return=representation"]
        if upsert:
            prefer_parts.append("resolution=merge-duplicates")
        headers["Prefer"] = ",".join(prefer_parts)

        query = []
        if on_conflict:
            query.append(("on_conflict", on_conflict))

        return self._request("POST", table, query=query, payload=payload, headers=headers)

    def update(self, table, payload, *, filters=None):
        headers = {"Prefer": "return=representation"}
        query = list((filters or {}).items())
        return self._request("PATCH", table, query=query, payload=payload, headers=headers)

    def rpc(self, name, payload):
        timeout = 30
        if name == "export_branch_backup_data":
            timeout = int(getattr(settings, "BACKUP_EXPORT_TIMEOUT_SECONDS", 180))
        return self._request("POST", f"rpc/{name}", payload=payload, timeout=timeout)

    def delete(self, table, *, filters=None):
        headers = {"Prefer": "return=representation"}
        query = list((filters or {}).items())
        return self._request("DELETE", table, query=query, headers=headers)

    def _request(
        self,
        method,
        path,
        *,
        query=None,
        payload=None,
        headers=None,
        timeout=30,
        return_headers=False,
    ):
        query_string = ""
        if query:
            query_string = "?" + parse.urlencode(
                query,
                doseq=True,
                quote_via=parse.quote,
                safe="(),.*:_-",
            )

        request_headers = {
            "Authorization": f"Bearer {self.api_key}",
            "apikey": self.api_key,
            "Accept": "application/json",
        }
        if headers:
            request_headers.update(headers)

        data = None
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")

        http_request = request.Request(
            f"{self.base_url}/{path}{query_string}",
            data=data,
            method=method,
            headers=request_headers,
        )

        try:
            with request.urlopen(http_request, timeout=timeout) as response:
                body = response.read()
                response_headers = response.headers
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            try:
                payload = json.loads(detail) if detail else {}
            except json.JSONDecodeError:
                payload = {}

            message = (
                payload.get("message")
                or payload.get("error_description")
                or payload.get("hint")
                or payload.get("details")
                or detail
                or exc.reason
            )
            raise SupabaseRestError(str(message)) from exc
        except error.URLError as exc:
            raise SupabaseRestError(f"Supabase request failed: {exc.reason}") from exc

        if not body:
            return (None, response_headers) if return_headers else None

        try:
            parsed_body = json.loads(body.decode("utf-8"))
            return (parsed_body, response_headers) if return_headers else parsed_body
        except json.JSONDecodeError as exc:
            raise SupabaseRestError("Supabase returned a non-JSON response.") from exc
