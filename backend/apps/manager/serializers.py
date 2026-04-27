from rest_framework import serializers

from apps.core.models import BRANCH_CHOICES


class ReportSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    sender = serializers.CharField(read_only=True, allow_null=True)
    sender_name = serializers.CharField(read_only=True)
    branch = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(read_only=True)
    subject = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    attachment_url = serializers.CharField(read_only=True, allow_blank=True)
    is_deleted = serializers.BooleanField(read_only=True)
    is_reviewed = serializers.BooleanField(read_only=True)
    reviewed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class ReportCreateSerializer(serializers.Serializer):
    branch = serializers.ChoiceField(choices=[value for value, _label in BRANCH_CHOICES])
    subject = serializers.CharField(max_length=255)
    message = serializers.CharField()
    attachment = serializers.FileField(required=False, allow_null=True)


class ReportReviewStatusSerializer(serializers.Serializer):
    is_reviewed = serializers.BooleanField()
