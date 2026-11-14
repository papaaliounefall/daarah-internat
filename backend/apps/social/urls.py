from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("social/sponsors", views.SponsorViewSet, basename="social-sponsor")
router.register("social/sponsorships", views.SponsorshipViewSet, basename="social-sponsorship")
router.register("social/donations", views.DonationViewSet, basename="social-donation")
# Alias court : /api/donations/ (même vue, mêmes droits).
router.register("donations", views.DonationViewSet, basename="donation")

urlpatterns = [
    path("social/overview/", views.OverviewView.as_view(), name="social-overview"),
    *router.urls,
]
