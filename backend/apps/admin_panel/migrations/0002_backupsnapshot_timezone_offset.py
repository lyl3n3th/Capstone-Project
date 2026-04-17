from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("admin_panel", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="backupsettings",
            name="timezone_offset_minutes",
            field=models.SmallIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="BackupSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("branch", models.CharField(choices=[("Bacoor", "Bacoor"), ("Taytay", "Taytay"), ("GMA", "GMA")], max_length=20, unique=True)),
                ("students", models.JSONField(blank=True, default=list)),
                ("alumni", models.JSONField(blank=True, default=list)),
                ("record_count", models.PositiveIntegerField(default=0)),
                ("updated_by_name", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_backup_snapshots", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("branch",),
                "verbose_name_plural": "Backup snapshots",
            },
        ),
    ]
