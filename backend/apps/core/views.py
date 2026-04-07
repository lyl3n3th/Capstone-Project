from django.contrib.auth import authenticate, get_user_model
from django.core.validators import validate_email
from django.db import transaction
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BRANCH_CHOICES, STAFF_ROLE_CHOICES, STAFF_STATUS_CHOICES, StaffAccount

User = get_user_model()
VALID_BRANCHES = {value for value, _label in BRANCH_CHOICES}
VALID_ROLES = {value for value, _label in STAFF_ROLE_CHOICES}
VALID_STATUSES = {value for value, _label in STAFF_STATUS_CHOICES}

ROLE_ALIASES = {
    "admin": "admin",
    "administrator": "admin",
    "branch administrator": "admin",
    "registrar": "registrar",
}


def normalize_text(value):
    return value.strip() if isinstance(value, str) else ""


def serialize_staff_account(account):
    return {
        "employee_id": account.employee_id,
        "first_name": account.user.first_name,
        "last_name": account.user.last_name,
        "role": account.role,
        "branch": account.branch,
        "email": account.email,
        "contact_number": account.contact_number,
        "address": account.address,
        "status": account.status,
        "is_trashed": account.is_trashed,
    }


def serialize_login_response(account):
    return {
        "employee_id": account.employee_id,
        "branch": account.branch,
        "full_name": f"{account.user.first_name} {account.user.last_name}".strip(),
        "role": account.role,
    }


def normalize_role(value):
    return ROLE_ALIASES.get(normalize_text(value).lower(), "")


def sync_user_status(account):
    account.user.is_active = account.status == "active" and not account.is_trashed
    account.user.save(update_fields=["is_active"])


def validate_staff_payload(payload, *, is_create):
    cleaned = {}
    errors = {}

    required_fields = (
        "first_name",
        "last_name",
        "role",
        "branch",
        "email",
        "contact_number",
        "address",
    )

    for field in required_fields:
        value = normalize_text(payload.get(field, ""))
        if not value:
            errors.setdefault(field, []).append("This field is required.")
        else:
            cleaned[field] = value

    password = normalize_text(payload.get("password", ""))
    if is_create and not password:
        errors.setdefault("password", []).append("This field is required.")
    elif password:
        cleaned["password"] = password

    normalized_role = normalize_role(cleaned.get("role", ""))
    if cleaned.get("role") and not normalized_role:
        errors.setdefault("role", []).append("Select a valid role.")
    elif normalized_role:
        cleaned["role"] = normalized_role

    branch = cleaned.get("branch", "")
    if branch and branch not in VALID_BRANCHES:
        errors.setdefault("branch", []).append("Select a valid branch.")

    email = cleaned.get("email", "")
    if email:
        try:
            validate_email(email)
        except Exception:
            errors.setdefault("email", []).append("Enter a valid email address.")

    contact_number = cleaned.get("contact_number", "")
    if contact_number and len("".join(filter(str.isdigit, contact_number))) != 11:
        errors.setdefault("contact_number", []).append(
            "Contact number must contain exactly 11 digits."
        )

    status_value = normalize_text(payload.get("status", "active")).lower() or "active"
    if status_value not in VALID_STATUSES:
        errors.setdefault("status", []).append("Select a valid status.")
    else:
        cleaned["status"] = status_value

    return cleaned, errors


def get_staff_account_or_404(employee_id):
    try:
        return StaffAccount.objects.select_related("user").get(employee_id=employee_id)
    except StaffAccount.DoesNotExist:
        return None


class StaffListCreateView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def get(self, request):
        trash_filter = normalize_text(request.query_params.get("trash", "")).lower()
        queryset = StaffAccount.objects.select_related("user")

        if trash_filter == "only":
            queryset = queryset.filter(is_trashed=True)
        elif trash_filter != "all":
            queryset = queryset.filter(is_trashed=False)

        payload = [serialize_staff_account(account) for account in queryset]
        return Response(payload)

    @transaction.atomic
    def post(self, request):
        cleaned, errors = validate_staff_payload(request.data, is_create=True)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        if StaffAccount.objects.filter(email__iexact=cleaned["email"]).exists():
            return Response(
                {"errors": {"email": ["Email already exists."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee_id = StaffAccount.generate_employee_id(cleaned["branch"])
        user = User.objects.create_user(
            username=employee_id,
            password=cleaned["password"],
            first_name=cleaned["first_name"],
            last_name=cleaned["last_name"],
            email=cleaned["email"],
            is_active=cleaned["status"] == "active",
        )
        account = StaffAccount.objects.create(
            user=user,
            employee_id=employee_id,
            role=cleaned["role"],
            branch=cleaned["branch"],
            email=cleaned["email"],
            contact_number=cleaned["contact_number"],
            address=cleaned["address"],
            status=cleaned["status"],
        )

        return Response(
            serialize_staff_account(account),
            status=status.HTTP_201_CREATED,
        )


class StaffDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    @transaction.atomic
    def put(self, request, employee_id):
        account = get_staff_account_or_404(employee_id)
        if not account:
            return Response(status=status.HTTP_404_NOT_FOUND)

        cleaned, errors = validate_staff_payload(request.data, is_create=False)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        duplicate_email = (
            StaffAccount.objects.filter(email__iexact=cleaned["email"])
            .exclude(pk=account.pk)
            .exists()
        )
        if duplicate_email:
            return Response(
                {"errors": {"email": ["Email already exists."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch_changed = account.branch != cleaned["branch"]
        if branch_changed:
            account.employee_id = StaffAccount.generate_employee_id(cleaned["branch"])
            account.user.username = account.employee_id

        account.user.first_name = cleaned["first_name"]
        account.user.last_name = cleaned["last_name"]
        account.user.email = cleaned["email"]
        if cleaned.get("password"):
            account.user.set_password(cleaned["password"])

        account.role = cleaned["role"]
        account.branch = cleaned["branch"]
        account.email = cleaned["email"]
        account.contact_number = cleaned["contact_number"]
        account.address = cleaned["address"]
        account.status = cleaned["status"]

        account.user.is_active = account.status == "active" and not account.is_trashed
        account.user.save()
        account.save()

        return Response(serialize_staff_account(account))

    @transaction.atomic
    def delete(self, request, employee_id):
        account = get_staff_account_or_404(employee_id)
        if not account:
            return Response(status=status.HTTP_404_NOT_FOUND)

        account.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffTrashView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def patch(self, request, employee_id):
        account = get_staff_account_or_404(employee_id)
        if not account:
            return Response(status=status.HTTP_404_NOT_FOUND)

        is_trashed = request.data.get("is_trashed")
        if not isinstance(is_trashed, bool):
            return Response(
                {"errors": {"is_trashed": ["Provide a boolean value."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account.is_trashed = is_trashed
        account.save(update_fields=["is_trashed", "updated_at"])
        sync_user_status(account)

        return Response(serialize_staff_account(account))


class StaffLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        employee_id = normalize_text(request.data.get("employee_id", "")).upper()
        password = normalize_text(request.data.get("password", ""))

        if not employee_id or not password:
            return Response(
                {
                    "errors": {
                        "credentials": [
                            "Employee ID and password are required."
                        ]
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            account = StaffAccount.objects.select_related("user").get(
                employee_id__iexact=employee_id
            )
        except StaffAccount.DoesNotExist:
            return Response(
                {"errors": {"credentials": ["Invalid login credentials."]}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if account.is_trashed or account.status != "active":
            return Response(
                {"errors": {"credentials": ["This staff account is inactive."]}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = authenticate(
            request=request,
            username=account.user.username,
            password=password,
        )
        if not user:
            return Response(
                {"errors": {"credentials": ["Invalid login credentials."]}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(serialize_login_response(account))
