from django.contrib import admin

from .models import Branch, ManagerProfile, Report


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("branch_name", "created_at")
    search_fields = ("branch_name",)


@admin.register(ManagerProfile)
class ManagerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "full_name", "created_at")
    search_fields = ("user__username", "user__first_name", "user__last_name", "full_name")


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("subject", "sender", "branch", "is_deleted", "created_at")
    list_filter = ("branch", "is_deleted", "created_at")
    search_fields = ("subject", "message", "sender__username", "sender__first_name", "sender__last_name")
