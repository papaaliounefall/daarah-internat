from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Traduit les erreurs Django en réponses API lisibles ; ne divulgue jamais de trace."""
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(detail=exc.message_dict if hasattr(exc, "error_dict") else exc.messages)
    elif isinstance(exc, PermissionDenied):
        return Response({"detail": "Accès refusé."}, status=status.HTTP_403_FORBIDDEN)
    elif isinstance(exc, IntegrityError):
        return Response(
            {"detail": "Cette opération viole une règle d'intégrité des données (doublon ou référence invalide)."},
            status=status.HTTP_409_CONFLICT,
        )
    return exception_handler(exc, context)
