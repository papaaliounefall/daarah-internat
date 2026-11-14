from django.urls import path

from . import views

card = views.StudentCardViewSet
cards = views.CardViewSet

urlpatterns = [
    # Cartes talibé (rattachées au talibé)
    path("students/<uuid:pk>/card/preview/", card.as_view({"get": "preview"}), name="student-card-preview"),
    path("students/<uuid:pk>/card/", card.as_view({"get": "current", "post": "generate"}), name="student-card"),
    path("students/<uuid:pk>/cards/", card.as_view({"get": "history"}), name="student-cards"),
    # Cartes (par identifiant)
    path("cards/batch/", cards.as_view({"post": "batch"}), name="cards-batch"),
    path("cards/<uuid:pk>/pdf/", cards.as_view({"get": "pdf"}), name="card-pdf"),
    # Documents financiers
    path("documents/receipts/<uuid:pk>/", views.ReceiptView.as_view(), name="document-receipt"),
    path("documents/finance-report/", views.FinanceReportView.as_view(), name="document-finance-report"),
]
