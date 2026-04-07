from django.urls import path

from .views import StaffDetailView, StaffListCreateView, StaffLoginView, StaffTrashView


urlpatterns = [
    path("staff/", StaffListCreateView.as_view(), name="staff-list-create"),
    path("staff/login/", StaffLoginView.as_view(), name="staff-login"),
    path("staff/<str:employee_id>/", StaffDetailView.as_view(), name="staff-detail"),
    path(
        "staff/<str:employee_id>/trash/",
        StaffTrashView.as_view(),
        name="staff-trash",
    ),
]
