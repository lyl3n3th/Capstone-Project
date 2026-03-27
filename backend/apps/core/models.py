from django.contrib.auth.models import AbstractUser, Group, Permission
from django.db import models


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
