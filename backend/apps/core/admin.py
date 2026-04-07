from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import StaffAccount, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    pass


@admin.register(StaffAccount)
class StaffAccountAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "user", "role", "branch", "status", "is_trashed")
    list_filter = ("role", "branch", "status", "is_trashed")
    search_fields = (
        "employee_id",
        "user__first_name",
        "user__last_name",
        "email",
    )
