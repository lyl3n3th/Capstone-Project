from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import (
    IsAreaManager,
    IsBranchAdmin,
    get_request_branch,
    get_request_role,
    resolve_staff_account_from_request,
)
from .repository import create_report, delete_report, get_report, set_report_deleted, use_supabase_reports, list_reports
from .serializers import ReportCreateSerializer, ReportSerializer
from .storage import upload_report_attachment


User = get_user_model()


def get_sender_from_request(request):
    staff_account = resolve_staff_account_from_request(request)
    if staff_account:
        sender_name = staff_account.user.get_full_name().strip() or staff_account.user.username
        return {
            "sender_user": staff_account.user,
            "sender_id": staff_account.employee_id or str(staff_account.user.pk),
            "sender_name": sender_name,
            "branch": staff_account.branch,
        }

    role = get_request_role(request)
    branch_name = get_request_branch(request)
    employee_id = request.headers.get("X-Employee-Id", "").strip().upper()
    display_name = request.headers.get("X-User-Name", "").strip()

    if role != "admin" or not branch_name:
        return None

    sender_name = display_name or employee_id or branch_name

    if use_supabase_reports():
        return {
            "sender_user": None,
            "sender_id": employee_id or f"report-admin-{slugify(sender_name) or slugify(branch_name)}",
            "sender_name": sender_name,
            "branch": branch_name,
        }

    username = employee_id or f"report-admin-{slugify(sender_name) or slugify(branch_name)}"
    defaults = {}

    if sender_name:
        name_parts = sender_name.split()
        defaults["first_name"] = name_parts[0]
        defaults["last_name"] = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    user, created = User.objects.get_or_create(username=username, defaults=defaults)
    if not created and sender_name:
        name_parts = sender_name.split()
        next_first_name = name_parts[0]
        next_last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        if user.first_name != next_first_name or user.last_name != next_last_name:
            user.first_name = next_first_name
            user.last_name = next_last_name
            user.save(update_fields=["first_name", "last_name"])

    return {
        "sender_user": user,
        "sender_id": employee_id or str(user.pk),
        "sender_name": sender_name or user.get_full_name().strip() or user.username,
        "branch": branch_name,
    }


class ReportCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsBranchAdmin]

    def post(self, request):
        serializer = ReportCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        sender_context = get_sender_from_request(request)
        branch_name = serializer.validated_data["branch"]
        if not sender_context:
            return Response(
                {"detail": "Unable to identify the branch administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if branch_name != sender_context["branch"]:
            return Response(
                {"branch": ["Report branch must match the sender's assigned branch."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attachment = serializer.validated_data.get("attachment")
        attachment_url = ""

        if attachment:
            attachment_url = upload_report_attachment(
                uploaded_file=attachment,
                branch_name=branch_name,
                sender_id=sender_context["sender_id"] or "branch-admin",
                http_request=request,
            )

        report = create_report(
            sender_user=sender_context["sender_user"],
            sender_identifier=sender_context["sender_id"],
            sender_name=sender_context["sender_name"],
            branch_name=branch_name,
            subject=serializer.validated_data["subject"],
            message=serializer.validated_data["message"],
            attachment_url=attachment_url,
        )

        response_serializer = ReportSerializer(report)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ReportInboxView(APIView):
    permission_classes = [IsAreaManager]

    def get(self, request):
        serializer = ReportSerializer(list_reports(is_deleted=False), many=True)
        return Response(serializer.data)


class ReportTrashView(APIView):
    permission_classes = [IsAreaManager]

    def get(self, request):
        serializer = ReportSerializer(list_reports(is_deleted=True), many=True)
        return Response(serializer.data)


class ReportSoftDeleteView(APIView):
    permission_classes = [IsAreaManager]

    def patch(self, request, report_id):
        report = get_report(report_id)
        if not report:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if report.is_deleted:
            return Response(ReportSerializer(report).data)

        updated_report = set_report_deleted(report_id, is_deleted=True)
        return Response(ReportSerializer(updated_report).data)


class ReportRestoreView(APIView):
    permission_classes = [IsAreaManager]

    def patch(self, request, report_id):
        report = get_report(report_id)
        if not report:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not report.is_deleted:
            return Response(ReportSerializer(report).data)

        updated_report = set_report_deleted(report_id, is_deleted=False)
        return Response(ReportSerializer(updated_report).data)


class ReportDetailView(APIView):
    permission_classes = [IsAreaManager]

    def delete(self, request, report_id):
        if not delete_report(report_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
