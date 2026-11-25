from django.db import models
from django.utils.text import slugify


def admission_requirement_upload_path(instance, filename):
    requirement_slug = slugify(instance.requirement_name) or "requirement"
    return (
        f"admissions/{instance.application.tracking_number}/"
        f"{requirement_slug}/{filename}"
    )


class AdmissionApplication(models.Model):
    tracking_number = models.CharField(max_length=32, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    sex = models.CharField(max_length=20)
    civil_status = models.CharField(max_length=20)
    address = models.TextField()
    email = models.EmailField()
    contact = models.CharField(max_length=20)
    last_school_attended = models.CharField(max_length=255)
    year_completion = models.CharField(max_length=4)
    program = models.CharField(max_length=100)
    strand_or_course = models.CharField(max_length=255)
    branch = models.CharField(max_length=50)
    student_status = models.CharField(max_length=50)
    honor = models.CharField(max_length=50, blank=True, default="No Honor")
    apply_scholarship = models.BooleanField(default=False)
    requirements_uploaded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.tracking_number} - {self.last_name}, {self.first_name}"


class AdmissionRequirement(models.Model):
    application = models.ForeignKey(
        AdmissionApplication,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    requirement_name = models.CharField(max_length=100)
    file = models.FileField(upload_to=admission_requirement_upload_path)
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("application", "requirement_name")
        ordering = ["requirement_name"]

    def __str__(self):
        return f"{self.application.tracking_number} - {self.requirement_name}"
