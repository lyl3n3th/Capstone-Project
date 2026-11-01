from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_staffaccount")]

    operations = [
        migrations.AlterField(
            model_name="staffaccount", name="branch",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="staffaccount", name="employee_id",
            field=models.CharField(editable=False, max_length=128, unique=True),
        ),
    ]
