"""Sérialiseurs du portail public et de son administration.

Le portail public n'expose QUE : l'identité institutionnelle de l'établissement et le contenu rédigé par le Daara.
Aucune donnée de talibé, de parent ou de personnel (hors liste ``team`` saisie volontairement par le directeur).
"""
import re

from django.utils.html import strip_tags
from rest_framework import serializers

from apps.core.files import public_file_url
from apps.core.serializers import TenantModelSerializer

from .models import ContactRequest, GalleryImage, NewsPost, SiteContent

PHONE_RE = re.compile(r"^[0-9+()./\-\s]{6,40}$")


def clean_text(value: str) -> str:
    """Texte brut : balises HTML retirées, espaces normalisés en bordure (le front n'injecte jamais de HTML)."""
    return strip_tags(value or "").strip()


# ---------------------------------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------------------------------
def public_site_payload(establishment, content: SiteContent | None, request=None) -> dict:
    """Liste blanche explicite : toute nouvelle donnée doit être ajoutée ICI pour devenir publique."""
    c = content
    return {
        "establishment": {
            "name": establishment.name, "slug": establishment.slug, "city": establishment.city,
            "country": establishment.country,
        },
        "content": {
            "tagline": c.tagline if c else "",
            "history": c.history if c else "",
            "mission": c.mission if c else "",
            "vision": c.vision if c else "",
            "values": c.values if c else [],
            "activities": c.activities if c else [],
            "team": c.team if c else [],
            "admission_info": c.admission_info if c else "",
            "contact_phone": (c.contact_phone if c and c.contact_phone else establishment.phone),
            "contact_email": (c.contact_email if c and c.contact_email else establishment.email),
            "address": (c.address if c and c.address else establishment.address),
            "latitude": float(c.latitude) if c and c.latitude is not None else None,
            "longitude": float(c.longitude) if c and c.longitude is not None else None,
            "hero_image_url": public_file_url(request, c.hero_image) if c else None,
            "hero_text": c.hero_text if c else "",
            "teachings": c.teachings if c else [],
            "boarding_intro": c.boarding_intro if c else "",
            "boarding": c.boarding if c else [],
            "approach": c.approach if c else [],
            "social_links": c.social_links if c else [],
            "legal_notice": c.legal_notice if c else "",
            "privacy_policy": c.privacy_policy if c else "",
        },
        "news": [
            {"id": str(n.pk), "title": n.title, "summary": n.summary, "body": n.body,
             "image_url": public_file_url(request, n.image), "published_on": n.published_on.isoformat()}
            for n in NewsPost.objects.filter(establishment=establishment, is_published=True)[:30]
        ],
        "gallery": [
            {"id": str(g.pk), "image_url": public_file_url(request, g.image), "caption": g.caption}
            for g in GalleryImage.objects.filter(establishment=establishment, is_published=True)[:24]
        ],
    }


class PublicContactSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=150, error_messages={
        "blank": "Merci d'indiquer votre nom.", "min_length": "Le nom est trop court.",
        "max_length": "Le nom est trop long (150 caractères maximum).", "required": "Merci d'indiquer votre nom."})
    phone = serializers.CharField(required=False, allow_blank=True, max_length=40)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    message = serializers.CharField(min_length=10, max_length=3000, error_messages={
        "blank": "Merci de saisir votre message.", "min_length": "Votre message est trop court (10 caractères minimum).",
        "max_length": "Votre message est trop long (3000 caractères maximum).",
        "required": "Merci de saisir votre message."})
    slug = serializers.SlugField(required=False, allow_blank=True, max_length=50)
    # Champ « piège » : invisible pour un humain, rempli par les robots.
    website = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_name(self, value):
        value = clean_text(value)
        if len(value) < 2:
            raise serializers.ValidationError("Le nom est trop court.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if value and not PHONE_RE.match(value):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        return value

    def validate_message(self, value):
        value = clean_text(value)
        if len(value) < 10:
            raise serializers.ValidationError("Votre message est trop court (10 caractères minimum).")
        return value

    def validate(self, attrs):
        if not attrs.get("phone") and not attrs.get("email"):
            raise serializers.ValidationError({"phone": "Indiquez un numéro de téléphone ou une adresse e-mail pour être recontacté."})
        return attrs


class PublicVisitSerializer(serializers.Serializer):
    """Demande de visite d'un futur parent. Ce n'est PAS une inscription."""

    name = serializers.CharField(min_length=2, max_length=150, error_messages={
        "blank": "Merci d'indiquer votre nom.", "required": "Merci d'indiquer votre nom.", "min_length": "Le nom est trop court."})
    phone = serializers.CharField(max_length=40, error_messages={
        "blank": "Merci d'indiquer un numéro de téléphone.", "required": "Merci d'indiquer un numéro de téléphone."})
    child_name = serializers.CharField(max_length=150, error_messages={
        "blank": "Merci d'indiquer le nom de l'enfant.", "required": "Merci d'indiquer le nom de l'enfant."})
    desired_date = serializers.DateField(error_messages={"invalid": "Date invalide.", "required": "Merci de choisir une date."})
    message = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    slug = serializers.SlugField(required=False, allow_blank=True, max_length=50)
    website = serializers.CharField(required=False, allow_blank=True, max_length=200)  # honeypot

    def validate_phone(self, value):
        value = value.strip()
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        return value

    def validate_desired_date(self, value):
        import datetime

        if value < datetime.date.today():
            raise serializers.ValidationError("La date souhaitée ne peut pas être passée.")
        return value

    def validate_name(self, value):
        return clean_text(value)

    def validate_child_name(self, value):
        return clean_text(value)

    def validate_message(self, value):
        return clean_text(value)


# ---------------------------------------------------------------------------------------------------
# Privé
# ---------------------------------------------------------------------------------------------------
class _PairListField(serializers.ListField):
    """Liste d'objets {clé1, clé2} à structure fixe (valeurs, activités, équipe)."""

    def __init__(self, keys, max_items=30, **kw):
        self.keys = keys
        super().__init__(child=serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=1000)),
                         max_length=max_items, required=False, **kw)

    def to_internal_value(self, data):
        items = super().to_internal_value(data)
        out = []
        for item in items:
            unknown = set(item) - set(self.keys)
            if unknown:
                raise serializers.ValidationError(f"Champ(s) non autorisé(s) : {', '.join(sorted(unknown))}.")
            row = {k: clean_text(item.get(k, "")) for k in self.keys}
            if not row[self.keys[0]]:
                raise serializers.ValidationError(f"Le champ « {self.keys[0]} » est obligatoire pour chaque élément.")
            if any(len(v) > (150 if i == 0 else 1000) for i, v in enumerate(row.values())):
                raise serializers.ValidationError("Texte trop long dans un élément de la liste.")
            out.append(row)
        return out


class SiteContentSerializer(serializers.ModelSerializer):
    values = _PairListField(["title", "text"])
    activities = _PairListField(["title", "text"])
    team = _PairListField(["name", "role"], max_items=50)
    teachings = _PairListField(["title", "text"], max_items=12)
    boarding = _PairListField(["title", "text"], max_items=12)
    approach = _PairListField(["title", "text"], max_items=8)
    social_links = _PairListField(["label", "url"], max_items=8)
    hero_image_url = serializers.SerializerMethodField()

    class Meta:
        model = SiteContent
        fields = ["tagline", "hero_text", "hero_image_url", "history", "mission", "vision", "values", "activities",
                  "team", "teachings", "boarding_intro", "boarding", "approach", "social_links", "legal_notice",
                  "privacy_policy", "contact_phone", "contact_email", "address", "latitude", "longitude",
                  "admission_info", "updated_at"]
        read_only_fields = ["updated_at"]
        extra_kwargs = {
            "history": {"max_length": 10000}, "mission": {"max_length": 10000}, "vision": {"max_length": 10000},
            "admission_info": {"max_length": 10000}, "boarding_intro": {"max_length": 3000},
            "hero_text": {"max_length": 600}, "legal_notice": {"max_length": 20000}, "privacy_policy": {"max_length": 20000},
        }

    def get_hero_image_url(self, obj):
        return public_file_url(self.context.get("request"), obj.hero_image)

    def validate_social_links(self, links):
        for item in links:
            if not re.match(r"^https?://", item["url"]):
                raise serializers.ValidationError("Chaque lien doit commencer par http:// ou https://.")
        return links

    def validate(self, attrs):
        for field in ("tagline", "hero_text", "history", "mission", "vision", "address", "admission_info", "contact_phone",
                      "boarding_intro", "legal_notice", "privacy_policy"):
            if field in attrs and isinstance(attrs[field], str):
                attrs[field] = clean_text(attrs[field])
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if lat is not None and not -90 <= lat <= 90:
            raise serializers.ValidationError({"latitude": "Latitude invalide (entre -90 et 90)."})
        if lng is not None and not -180 <= lng <= 180:
            raise serializers.ValidationError({"longitude": "Longitude invalide (entre -180 et 180)."})
        return attrs


class ContactRequestSerializer(TenantModelSerializer):
    processed_by_name = serializers.CharField(source="processed_by.full_name", read_only=True, default="")

    class Meta:
        model = ContactRequest
        fields = ["id", "kind", "name", "phone", "email", "child_name", "desired_date", "message", "is_processed",
                  "processed_at", "processed_by_name", "created_at"]
        read_only_fields = fields


class NewsPostSerializer(TenantModelSerializer):
    image = serializers.ImageField(write_only=True, required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()
    is_published = serializers.BooleanField(default=True)  # défaut explicite : un champ absent d'un formulaire multipart vaut « publié »

    class Meta:
        model = NewsPost
        fields = ["id", "title", "summary", "body", "image", "image_url", "published_on", "is_published", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_image_url(self, obj):
        return public_file_url(self.context.get("request"), obj.image)

    def validate(self, attrs):
        for f in ("title", "summary", "body"):
            if f in attrs:
                attrs[f] = clean_text(attrs[f])
        return attrs


class GalleryImageSerializer(TenantModelSerializer):
    image = serializers.ImageField(write_only=True, required=False)
    image_url = serializers.SerializerMethodField()
    is_published = serializers.BooleanField(default=True)

    class Meta:
        model = GalleryImage
        fields = ["id", "image", "image_url", "caption", "order", "is_published"]
        read_only_fields = ["id"]

    def get_image_url(self, obj):
        return public_file_url(self.context.get("request"), obj.image)

    def validate(self, attrs):
        if self.instance is None and "image" not in attrs:
            raise serializers.ValidationError({"image": "Choisissez une image."})
        if "caption" in attrs:
            attrs["caption"] = clean_text(attrs["caption"])
        return attrs
