from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manager", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="report",
            name="is_reviewed",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="report",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
