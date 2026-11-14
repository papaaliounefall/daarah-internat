from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, Establishment, TenantModel
from apps.core.validators import validate_image


class SiteContent(BaseModel):
    """Contenu institutionnel du portail public. Aucune donnée de talibé n'y figure."""

    establishment = models.OneToOneField(Establishment, on_delete=models.CASCADE, related_name="site_content")
    tagline = models.CharField(max_length=255, blank=True)
    history = models.TextField(blank=True)
    mission = models.TextField(blank=True)
    vision = models.TextField(blank=True)
    values = models.JSONField(default=list, blank=True)       # [{"title": "...", "text": "..."}]
    activities = models.JSONField(default=list, blank=True)   # idem
    team = models.JSONField(default=list, blank=True)         # [{"name": "...", "role": "..."}]
    contact_phone = models.CharField(max_length=80, blank=True)
    contact_email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    admission_info = models.TextField(blank=True)
    # Page d'accueil enrichie : tout est facultatif ; une section vide n'est pas affichée.
    hero_image = models.ImageField(upload_to="site/hero/", blank=True, null=True, validators=[validate_image])
    hero_text = models.TextField(blank=True)                    # courte description sous le slogan
    teachings = models.JSONField(default=list, blank=True)      # [{"title", "text"}]
    boarding_intro = models.TextField(blank=True)
    boarding = models.JSONField(default=list, blank=True)       # [{"title", "text"}] services réellement offerts
    approach = models.JSONField(default=list, blank=True)       # étapes du parcours [{"title", "text"}]
    social_links = models.JSONField(default=list, blank=True)   # [{"label", "url"}] réseaux officiels
    legal_notice = models.TextField(blank=True)
    privacy_policy = models.TextField(blank=True)


class NewsPost(TenantModel):
    """Actualité ou événement publié sur la page d'accueil."""

    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    image = models.ImageField(upload_to="site/news/", blank=True, null=True, validators=[validate_image])
    published_on = models.DateField()
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["-published_on", "-created_at"]


class GalleryImage(TenantModel):
    image = models.ImageField(upload_to="site/gallery/", validators=[validate_image])
    caption = models.CharField(max_length=200, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "-created_at"]


class ContactRequest(TenantModel):
    """Demande d'information envoyée depuis le portail public (formulaire anonyme)."""

    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    message = models.TextField(max_length=3000)
    kind = models.CharField(max_length=10, choices=[("INFO", "Demande d'information"), ("VISITE", "Demande de visite")], default="INFO")
    child_name = models.CharField(max_length=150, blank=True)
    desired_date = models.DateField(null=True, blank=True)
    is_processed = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name="+")

    class Meta:
        ordering = ["-created_at"]
