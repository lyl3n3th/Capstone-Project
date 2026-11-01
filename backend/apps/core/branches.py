from django.core.exceptions import ImproperlyConfigured

from .supabase_rest import SupabaseRestClient


def resolve_registered_branch(value):
    """Use the same branch registry as the active data store."""
    name = value.strip()
    try:
        client = SupabaseRestClient.from_settings()
    except ImproperlyConfigured:
        from apps.manager.models import Branch
        branch = Branch.objects.filter(branch_name__iexact=name).first()
        return branch.branch_name if branch else None

    branches = client.select(
        "admission_branches", filters={"is_active": "eq.true"}, select="code,name",
    )
    for branch in branches or []:
        if name.casefold() in (branch["name"].casefold(), branch["code"].casefold()):
            return branch["name"]
    return None
