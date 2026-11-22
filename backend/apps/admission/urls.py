from django.urls import path

from .views import (
    AdmissionDecisionNotificationView,
    AdmissionDraftRecoveryStartView,
    AdmissionDraftRecoveryVerifyView,
    AdmissionRequirementRedoNotificationView,
    AdmissionStep2View,
    AdmissionSubmissionNotificationView,
    AdmissionTrackingRecoveryView,
    RequirementsUploadView,
)

urlpatterns = [
    path("step2/", AdmissionStep2View.as_view(), name="admission-step2"),
    path(
        "tracking-recovery/",
        AdmissionTrackingRecoveryView.as_view(),
        name="admission-tracking-recovery",
    ),
    path(
        "draft-recovery/start/",
        AdmissionDraftRecoveryStartView.as_view(),
        name="admission-draft-recovery-start",
    ),
    path(
        "draft-recovery/verify/",
        AdmissionDraftRecoveryVerifyView.as_view(),
        name="admission-draft-recovery-verify",
    ),
    path(
        "submission-notification/",
        AdmissionSubmissionNotificationView.as_view(),
        name="admission-submission-notification",
    ),
    path(
        "decision-notification/",
        AdmissionDecisionNotificationView.as_view(),
        name="admission-decision-notification",
    ),
    path(
        "requirement-redo-notification/",
        AdmissionRequirementRedoNotificationView.as_view(),
        name="admission-requirement-redo-notification",
    ),
    path(
        "requirements/",
        RequirementsUploadView.as_view(),
        name="admission-requirements",
    ),
]
