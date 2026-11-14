from rest_framework import serializers

from .models import AudioResource, Ayah, Reciter, Surah


class SurahSerializer(serializers.ModelSerializer):
    class Meta:
        model = Surah
        fields = ["number", "name_arabic", "name_simple", "name_french", "revelation_place", "verses_count",
                  "page_start", "page_end", "bismillah_pre"]
        read_only_fields = fields


class AyahSerializer(serializers.ModelSerializer):
    surah = serializers.IntegerField(source="surah_id", read_only=True)

    class Meta:
        model = Ayah
        fields = ["surah", "number_in_surah", "verse_key", "text_uthmani", "juz", "hizb", "rub_el_hizb", "page", "sajda"]
        read_only_fields = fields


class ReciterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reciter
        fields = ["slug", "name", "source", "is_default", "license_note"]
        read_only_fields = fields


class AudioSerializer(serializers.ModelSerializer):
    verse_key = serializers.CharField(source="ayah.verse_key", default=None, read_only=True)
    ayah = serializers.IntegerField(source="ayah.number_in_surah", default=None, read_only=True)

    class Meta:
        model = AudioResource
        fields = ["ayah", "verse_key", "url", "duration_seconds"]
        read_only_fields = fields
