from django.urls import path

from . import views

urlpatterns = [
    path("quran/surahs/", views.SurahListView.as_view(), name="quran-surah-list"),
    path("quran/surahs/<int:number>/", views.SurahDetailView.as_view(), name="quran-surah-detail"),
    path("quran/surahs/<int:number>/audio/", views.SurahAudioView.as_view(), name="quran-surah-audio"),
    path("quran/ayat/", views.AyahListView.as_view(), name="quran-ayah-list"),
    path("quran/reciters/", views.ReciterListView.as_view(), name="quran-reciter-list"),
]
