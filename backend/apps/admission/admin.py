from django.contrib import admin

from .models import AdmissionApplication, AdmissionRequirement


@admin.register(AdmissionApplication)
class AdmissionApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "tracking_number",
        "last_name",
        "first_name",
        "branch",
        "student_status",
        "program",
        "created_at",
    )
    search_fields = ("tracking_number", "first_name", "last_name", "email")
    list_filter = ("branch", "student_status", "program", "apply_scholarship")


@admin.register(AdmissionRequirement)
class AdmissionRequirementAdmin(admin.ModelAdmin):
    list_display = ("application", "requirement_name", "uploaded_at")
    search_fields = ("application__tracking_number", "requirement_name")
