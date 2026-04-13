from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BackupSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("branch", models.CharField(choices=[("Bacoor", "Bacoor"), ("Taytay", "Taytay"), ("GMA", "GMA")], max_length=20, unique=True)),
                ("automated_time", models.TimeField(default="23:00")),
                ("retention_days", models.PositiveIntegerField(default=30)),
                ("is_enabled", models.BooleanField(default=True)),
                ("last_automated_backup_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_backup_settings", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("branch",),
                "verbose_name_plural": "Backup settings",
            },
        ),
        migrations.CreateModel(
            name="BackupHistory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("branch", models.CharField(choices=[("Bacoor", "Bacoor"), ("Taytay", "Taytay"), ("GMA", "GMA")], db_index=True, max_length=20)),
                ("backup_type", models.CharField(choices=[("manual", "Manual"), ("automated", "Automated"), ("restore", "Restore")], max_length=20)),
                ("file_path", models.CharField(max_length=512)),
                ("sql_file_path", models.CharField(blank=True, max_length=512)),
                ("backup_filename", models.CharField(max_length=255)),
                ("storage_bucket", models.CharField(blank=True, max_length=100)),
                ("creation_date", models.DateTimeField(auto_now_add=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("in_progress", "In Progress"), ("completed", "Completed"), ("failed", "Failed"), ("deleted", "Deleted")], db_index=True, default="pending", max_length=20)),
                ("progress", models.PositiveSmallIntegerField(default=0)),
                ("task_id", models.CharField(blank=True, max_length=255)),
                ("error_message", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("restore_started_at", models.DateTimeField(blank=True, null=True)),
                ("restore_finished_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_backups", to=settings.AUTH_USER_MODEL)),
                ("restored_from", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="restore_runs", to="admin_panel.backuphistory")),
            ],
            options={
                "ordering": ("-creation_date",),
            },
        ),
    ]
