from django.urls import path

from .views import AdmissionStep2View, RequirementsUploadView

urlpatterns = [
    path("step2/", AdmissionStep2View.as_view(), name="admission-step2"),
    path(
        "requirements/",
        RequirementsUploadView.as_view(),
        name="admission-requirements",
    ),
]
