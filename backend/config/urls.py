from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.establishment import EstablishmentView
from apps.core.files import PrivateFileView, PublicFileView
from apps.public_site.urls import private_patterns as site_private_patterns


def health(_request):
    return JsonResponse({"status": "ok"})


api_patterns = [
    path("", include("apps.accounts.urls")),
    path("", include("apps.academics.urls")),
    path("", include("apps.students.urls")),
    path("", include("apps.guardians.urls")),
    path("", include("apps.quran.urls")),
    path("", include("apps.memorization.urls")),
    path("", include("apps.attendance.urls")),
    path("", include("apps.boarding.urls")),
    path("", include("apps.staff.urls")),
    path("", include("apps.finance.urls")),
    path("", include("apps.social.urls")),
    path("", include("apps.inventory.urls")),
    path("", include("apps.visits.urls")),
    path("", include("apps.documents.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.audit.urls")),
    path("", include("apps.dashboard.urls")),
    path("public/", include("apps.public_site.urls")),
    *site_private_patterns,
    path("establishment/", EstablishmentView.as_view(), name="establishment"),
    path("files/public/<path:token>", PublicFileView.as_view(), name="public-file"),
    path("files/<str:token>/", PrivateFileView.as_view(), name="private-file"),
    path("health/", health),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema")),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]
