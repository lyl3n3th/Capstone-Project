from django.urls import path

from .views import (
    ReportCreateView,
    ReportDetailView,
    ReportInboxView,
    ReportReviewStatusView,
    ReportRestoreView,
    ReportSentView,
    ReportSoftDeleteView,
    ReportTrashView,
)


urlpatterns = [
    path("reports/", ReportCreateView.as_view(), name="report-create"),
    path("reports/inbox/", ReportInboxView.as_view(), name="report-inbox"),
    path("reports/sent/", ReportSentView.as_view(), name="report-sent"),
    path("reports/trash/", ReportTrashView.as_view(), name="report-trash"),
    path(
        "reports/<uuid:report_id>/review-status/",
        ReportReviewStatusView.as_view(),
        name="report-review-status",
    ),
    path(
        "reports/<uuid:report_id>/soft-delete/",
        ReportSoftDeleteView.as_view(),
        name="report-soft-delete",
    ),
    path(
        "reports/<uuid:report_id>/restore/",
        ReportRestoreView.as_view(),
        name="report-restore",
    ),
    path("reports/<uuid:report_id>/", ReportDetailView.as_view(), name="report-detail"),
]
