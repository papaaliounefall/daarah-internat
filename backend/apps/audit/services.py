from __future__ import annotations

import datetime
import decimal
import uuid

from .models import AuditLog

# Jamais journalisés, même en différence de valeurs.
SENSITIVE_FIELDS = {"password", "token", "refresh", "access", "secret"}


def _jsonable(value):
    if isinstance(value, (datetime.date, datetime.datetime, datetime.time)):
        return value.isoformat()
    if isinstance(value, (decimal.Decimal, uuid.UUID)):
        return str(value)
    if hasattr(value, "pk"):
        return str(value.pk)
    if hasattr(value, "name") and hasattr(value, "url"):  # FieldFile
        return value.name or ""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record(request, action: str, obj=None, *, changes: dict | None = None, user=None, model: str = "", detail: str = "") -> AuditLog:
    """Écrit une entrée du journal. À appeler pour toute opération sensible."""
    user = user or getattr(request, "user", None)
    if user is not None and not getattr(user, "is_authenticated", False):
        user = None
    clean = {}
    for key, value in (changes or {}).items():
        if key.lower() in SENSITIVE_FIELDS:
            clean[key] = "***"
        elif isinstance(value, dict) and set(value) == {"old", "new"}:
            clean[key] = {"old": _jsonable(value["old"]), "new": _jsonable(value["new"])}
        else:
            clean[key] = _jsonable(value)
    if detail:
        clean["_detail"] = detail
    return AuditLog.objects.create(
        establishment_id=getattr(user, "establishment_id", None) if user else getattr(obj, "establishment_id", None),
        user=user,
        user_name=(user.get_full_name() or user.username) if user else "",
        user_role=getattr(user, "role", "") if user else "",
        action=action,
        model=model or (obj.__class__.__name__ if obj is not None else ""),
        object_id=str(obj.pk) if obj is not None and obj.pk else "",
        object_repr=str(obj)[:255] if obj is not None else "",
        changes=clean,
        ip_address=client_ip(request),
    )
