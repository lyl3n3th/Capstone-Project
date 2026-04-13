from django.urls import path

from .views import (
    ReportCreateView,
    ReportDetailView,
    ReportInboxView,
    ReportRestoreView,
    ReportSoftDeleteView,
    ReportTrashView,
)


urlpatterns = [
    path("reports/", ReportCreateView.as_view(), name="report-create"),
    path("reports/inbox/", ReportInboxView.as_view(), name="report-inbox"),
    path("reports/trash/", ReportTrashView.as_view(), name="report-trash"),
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
