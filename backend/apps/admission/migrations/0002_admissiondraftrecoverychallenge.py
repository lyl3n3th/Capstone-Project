from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("admission", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AdmissionDraftRecoveryChallenge",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("email", models.EmailField(db_index=True, max_length=254)),
                ("first_name", models.CharField(max_length=100)),
                ("last_name", models.CharField(max_length=100)),
                ("tracking_number", models.CharField(max_length=32)),
                ("code_digest", models.CharField(max_length=64)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["email", "first_name", "last_name", "created_at"],
                        name="admission_d_email_f31a78_idx",
                    ),
                ],
            },
        ),
    ]
