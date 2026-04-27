import uuid

from django.conf import settings
from django.db import models


class Branch(models.Model):
    branch_name = models.CharField(max_length=100, primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("branch_name",)

    def __str__(self):
        return self.branch_name


class ManagerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="manager_profile",
    )
    full_name = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Area manager profile"
        verbose_name_plural = "Area manager profiles"

    def __str__(self):
        return self.full_name or self.user.get_full_name() or self.user.username


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_reports",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        db_column="branch_name",
        related_name="reports",
    )
    subject = models.CharField(max_length=255)
    message = models.TextField()
    attachment_url = models.URLField(blank=True)
    is_deleted = models.BooleanField(default=False)
    is_reviewed = models.BooleanField(default=False)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.subject} ({self.branch_id})"
