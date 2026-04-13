from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


def seed_branches(apps, schema_editor):
    Branch = apps.get_model("manager", "Branch")
    for branch_name in ("Bacoor", "Taytay", "GMA"):
        Branch.objects.get_or_create(branch_name=branch_name)


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Branch",
            fields=[
                ("branch_name", models.CharField(max_length=100, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ("branch_name",)},
        ),
        migrations.CreateModel(
            name="ManagerProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("full_name", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="manager_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Area manager profile",
                "verbose_name_plural": "Area manager profiles",
            },
        ),
        migrations.CreateModel(
            name="Report",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("subject", models.CharField(max_length=255)),
                ("message", models.TextField()),
                ("attachment_url", models.URLField(blank=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "branch",
                    models.ForeignKey(
                        db_column="branch_name",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="reports",
                        to="manager.branch",
                    ),
                ),
                (
                    "sender",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sent_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.RunPython(seed_branches, migrations.RunPython.noop),
    ]
