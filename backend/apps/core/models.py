from django.contrib.auth.models import AbstractUser, Group, Permission
from django.db import models
from django.utils.crypto import get_random_string


BRANCH_CHOICES = (
    ("Bacoor", "Bacoor"),
    ("Taytay", "Taytay"),
    ("GMA", "GMA"),
)

STAFF_ROLE_CHOICES = (
    ("admin", "Branch Administrator"),
    ("registrar", "Registrar"),
)

STAFF_STATUS_CHOICES = (
    ("active", "Active"),
    ("inactive", "Inactive"),
)

BRANCH_ID_SEGMENTS = {
    "Bacoor": "BACOOR",
    "Taytay": "TAYTAY",
    "GMA": "GMA",
}


class User(AbstractUser):
    """Project auth user model."""

    groups = models.ManyToManyField(
        Group,
        blank=True,
        help_text=(
            'The groups this user belongs to. '
            'A user will get all permissions granted to each of their groups.'
        ),
        related_name='user_set',
        related_query_name='user',
        db_table='auth_user_groups',
        verbose_name='groups',
    )
    user_permissions = models.ManyToManyField(
        Permission,
        blank=True,
        help_text='Specific permissions for this user.',
        related_name='user_set',
        related_query_name='user',
        db_table='auth_user_user_permissions',
        verbose_name='user permissions',
    )

    class Meta(AbstractUser.Meta):
        db_table = 'auth_user'


class StaffAccount(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="staff_account",
    )
    employee_id = models.CharField(max_length=32, unique=True, editable=False)
    role = models.CharField(max_length=20, choices=STAFF_ROLE_CHOICES)
    branch = models.CharField(max_length=20, choices=BRANCH_CHOICES)
    email = models.EmailField(unique=True)
    contact_number = models.CharField(max_length=20)
    address = models.TextField()
    status = models.CharField(
        max_length=10,
        choices=STAFF_STATUS_CHOICES,
        default="active",
    )
    is_trashed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("employee_id",)

    def __str__(self):
        full_name = f"{self.user.first_name} {self.user.last_name}".strip()
        return full_name or self.employee_id

    @classmethod
    def generate_employee_id(cls, branch):
        branch_segment = BRANCH_ID_SEGMENTS.get(branch, branch.upper())
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

        while True:
            random_segment = get_random_string(6, alphabet)
            employee_id = f"AICS-{branch_segment}-{random_segment}"
            if not cls.objects.filter(employee_id=employee_id).exists():
                return employee_id

    def save(self, *args, **kwargs):
        if not self.employee_id:
            self.employee_id = self.generate_employee_id(self.branch)
        super().save(*args, **kwargs)
