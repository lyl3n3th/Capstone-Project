from rest_framework.permissions import BasePermission

from apps.core.models import StaffAccount


def get_request_role(request):
    return request.headers.get("X-User-Role", "").strip().lower()


def get_request_branch(request):
    return request.headers.get("X-User-Branch", "").strip()


def resolve_staff_account_from_request(request):
    if hasattr(request, "_resolved_staff_account"):
        return request._resolved_staff_account

    staff_account = getattr(request.user, "staff_account", None)
    if staff_account:
        request._resolved_staff_account = staff_account
        return staff_account

    employee_id = request.headers.get("X-Employee-Id", "").strip()
    if not employee_id:
        request._resolved_staff_account = None
        return None

    try:
        staff_account = StaffAccount.objects.select_related("user").get(
            employee_id__iexact=employee_id
        )
    except StaffAccount.DoesNotExist:
        staff_account = None

    request._resolved_staff_account = staff_account
    return staff_account


class IsBranchAdmin(BasePermission):
    message = "Only branch administrators can send reports."

    def has_permission(self, request, view):
        staff_account = resolve_staff_account_from_request(request)
        if get_request_role(request) == "admin" and get_request_branch(request):
            return True

        return bool(
            staff_account
            and staff_account.role == "admin"
            and not staff_account.is_trashed
            and staff_account.status == "active"
        )


class IsAreaManager(BasePermission):
    message = "Only area managers can access this resource."

    def has_permission(self, request, view):
        if get_request_role(request) == "manager":
            return True

        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, "manager_profile", None):
            return True

        return user.groups.filter(name__iexact="Area Manager").exists()
