"""URLs du portail public.

``config/urls.py`` monte ``urlpatterns`` (routes PUBLIQUES, sans authentification) sous ``/api/public/``.
Les routes PRIVÉES (``/api/site-content/``, ``/api/contact-requests/``) vivent dans ``private_patterns`` ; elles
sont ajoutées à l'espace ``/api/`` par ``apps/notifications/urls.py`` (seul point de montage disponible sans
modifier ``config/urls.py``). Si ``config/urls.py`` monte un jour ``private_patterns`` directement, retirer
l'inclusion côté notifications.
"""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("contact-requests", views.ContactRequestViewSet, basename="contact-request")
router.register("news-posts", views.NewsPostViewSet, basename="news-post")
router.register("gallery-images", views.GalleryImageViewSet, basename="gallery-image")

# Routes publiques (montées sous /api/public/)
public_patterns = [
    path("site/", views.PublicSiteView.as_view(), name="public-site"),
    path("contact/", views.PublicContactView.as_view(), name="public-contact"),
    path("visit-request/", views.PublicVisitView.as_view(), name="public-visit"),
]

# Routes privées (à monter sous /api/)
private_patterns = [
    path("site-content/", views.SiteContentView.as_view(), name="site-content"),
    path("site-content/hero-image/", views.HeroImageView.as_view(), name="site-hero-image"),
    *router.urls,
]

urlpatterns = public_patterns
