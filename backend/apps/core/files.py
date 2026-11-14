"""Accès aux fichiers privés (photos et documents de mineurs, justificatifs, PDF).

Les fichiers ne sont JAMAIS servis directement par Nginx depuis un dossier public. Les
sérialiseurs émettent une URL signée à durée limitée ; la vue vérifie la signature puis soit
délègue à Nginx (X-Accel-Redirect, en production), soit streame le fichier (développement).
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

SALT = "daara.private-files"
PUBLIC_SALT = "daara.public-site-files"
DEFAULT_MAX_AGE = 60 * 60  # 1 h


def signed_file_url(request, fieldfile, max_age: int = DEFAULT_MAX_AGE) -> str | None:
    """URL signée vers un champ fichier, ou None s'il est vide."""
    if not fieldfile:
        return None
    token = signing.dumps({"p": fieldfile.name}, salt=SALT)
    path = f"/api/files/{token}/"
    return path  # relatif : toujours servi par l'origine de l'application (aucune dépendance au Host vu par le proxy)


def public_file_url(request, fieldfile) -> str | None:
    """URL STABLE (non expirante, donc mise en cache) d'une image destinée au site public.

    À réserver aux contenus publics par nature (photo d'accueil, actualités, galerie) : jamais de données de
    talibés. La signature empêche seulement d'énumérer d'autres fichiers du dossier média."""
    if not fieldfile:
        return None
    token = signing.Signer(salt=PUBLIC_SALT).sign(fieldfile.name)
    path = f"/api/files/public/{token}"
    return path  # relatif : toujours servi par l'origine de l'application (aucune dépendance au Host vu par le proxy)


class PublicFileView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def get(self, request, token):
        try:
            rel = signing.Signer(salt=PUBLIC_SALT).unsign(token)
        except signing.BadSignature:
            raise Http404()
        if not rel.startswith("site/"):  # uniquement les contenus du site public
            raise Http404()
        root = Path(settings.MEDIA_ROOT).resolve()
        full = (root / rel).resolve()
        if root not in full.parents or not full.is_file():
            raise Http404()
        ctype = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
        if getattr(settings, "USE_X_ACCEL_REDIRECT", False):
            resp = HttpResponse(content_type=ctype)
            resp["X-Accel-Redirect"] = f"/_protected_media/{rel}"
        else:
            resp = FileResponse(open(full, "rb"), content_type=ctype)
        resp["Cache-Control"] = "public, max-age=86400"
        resp["X-Content-Type-Options"] = "nosniff"
        return resp


class PrivateFileView(APIView):
    permission_classes = [AllowAny]  # l'autorisation est portée par la signature
    authentication_classes: list = []
    throttle_classes: list = []

    def get(self, request, token):
        try:
            data = signing.loads(token, salt=SALT, max_age=DEFAULT_MAX_AGE)
        except signing.SignatureExpired:
            raise Http404("Lien expiré.")
        except signing.BadSignature:
            raise Http404()
        rel = data["p"]
        root = Path(settings.MEDIA_ROOT).resolve()
        full = (root / rel).resolve()
        if root not in full.parents or not full.is_file():  # anti « path traversal »
            raise Http404()
        ctype = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
        if getattr(settings, "USE_X_ACCEL_REDIRECT", False):
            resp = HttpResponse(content_type=ctype)
            resp["X-Accel-Redirect"] = f"/_protected_media/{rel}"
        else:
            resp = FileResponse(open(full, "rb"), content_type=ctype)
        resp["Cache-Control"] = "private, max-age=600"
        resp["X-Content-Type-Options"] = "nosniff"
        if ctype == "application/pdf":
            resp["Content-Disposition"] = f'inline; filename="{full.name}"'
        return resp
