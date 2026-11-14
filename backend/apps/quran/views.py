"""Lecture seule du corpus coranique (global). Réponses cachables : ETag + Cache-Control privé 24 h."""
import hashlib
import json

from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAuthenticatedWithEstablishment

from .models import AudioResource, Ayah, Reciter, Surah
from .serializers import AudioSerializer, AyahSerializer, ReciterSerializer, SurahSerializer

CACHE_CONTROL = "private, max-age=86400"


def cached_response(request, data):
    """Réponse JSON avec ETag ; 304 si le client possède déjà la version courante."""
    body = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    etag = '"%s"' % hashlib.md5(body).hexdigest()  # noqa: S324 - empreinte de cache, pas de sécurité
    candidates = [t.strip().removeprefix("W/") for t in request.META.get("HTTP_IF_NONE_MATCH", "").split(",")]
    if etag in candidates or "*" in candidates:
        resp = Response(status=status.HTTP_304_NOT_MODIFIED)
    else:
        resp = Response(data)
    resp["ETag"] = etag
    resp["Cache-Control"] = CACHE_CONTROL
    resp["Vary"] = "Authorization"
    return resp


class QuranReadOnlyView(APIView):
    """Tout utilisateur authentifié rattaché à un établissement (aucun rôle exclu). Lecture seule."""

    permission_classes = [IsAuthenticatedWithEstablishment]
    http_method_names = ["get", "head", "options"]


def listing(items):
    items = list(items)
    return {"count": len(items), "next": None, "previous": None, "results": items}


def _int_param(request, name):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except ValueError:
        raise ValidationError({name: "Doit être un nombre entier."}) from None


class SurahListView(QuranReadOnlyView):
    def get(self, request):
        return cached_response(request, listing(SurahSerializer(Surah.objects.all(), many=True).data))


class SurahDetailView(QuranReadOnlyView):
    def get(self, request, number):
        surah = Surah.objects.filter(pk=number).first()
        if surah is None:
            raise Http404
        start, end = _int_param(request, "from"), _int_param(request, "to")
        if start is not None and end is not None and start > end:
            raise ValidationError({"to": "« to » doit être supérieur ou égal à « from »."})
        ayat = Ayah.objects.filter(surah=surah)
        if start is not None:
            ayat = ayat.filter(number_in_surah__gte=start)
        if end is not None:
            ayat = ayat.filter(number_in_surah__lte=end)
        data = dict(SurahSerializer(surah).data)
        data["ayat"] = AyahSerializer(ayat.order_by("number_in_surah"), many=True).data
        return cached_response(request, data)


class AyahListView(QuranReadOnlyView):
    """``?surah=``, ``?juz=``, ``?page=`` (page du mushaf, 1..604) ; au moins un filtre est requis.

    Pas de pagination DRF : le paramètre ``page`` désigne ici la page du mushaf.
    """

    def get(self, request):
        qs = Ayah.objects.all()
        applied = 0
        for param, field in (("surah", "surah_id"), ("juz", "juz"), ("page", "page")):
            value = _int_param(request, param)
            if value is not None:
                qs = qs.filter(**{field: value})
                applied += 1
        if not applied:
            raise ValidationError({"detail": "Précisez au moins un filtre : surah, juz ou page."})
        return cached_response(
            request, listing(AyahSerializer(qs.order_by("surah_id", "number_in_surah"), many=True).data)
        )


class ReciterListView(QuranReadOnlyView):
    def get(self, request):
        return cached_response(request, listing(ReciterSerializer(Reciter.objects.order_by("name"), many=True).data))


class SurahAudioView(QuranReadOnlyView):
    """URL audio réellement fournies par la source (sourate entière, et versets si importés)."""

    def get(self, request, number):
        surah = Surah.objects.filter(pk=number).first()
        if surah is None:
            raise Http404
        slug = request.query_params.get("reciter")
        reciter = (Reciter.objects.filter(slug=slug) if slug else Reciter.objects.filter(is_default=True)).first()
        if reciter is None:
            if slug:
                raise Http404
            raise ValidationError({"reciter": "Aucun récitateur disponible : l'audio n'est pas importé."})
        audio = list(AudioResource.objects.filter(reciter=reciter, surah=surah).select_related("ayah"))
        chapter = next((a for a in audio if a.ayah_id is None), None)
        verses = sorted((a for a in audio if a.ayah_id), key=lambda a: a.ayah.number_in_surah)
        return cached_response(request, {
            "reciter": ReciterSerializer(reciter).data,
            "surah": surah.number,
            "chapter_audio": AudioSerializer(chapter).data if chapter else None,
            "verses": AudioSerializer(verses, many=True).data,
        })
