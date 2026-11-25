from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("admission", "0002_admissiondraftrecoverychallenge"),
    ]

    operations = [
        migrations.DeleteModel(
            name="AdmissionDraftRecoveryChallenge",
        ),
    ]
