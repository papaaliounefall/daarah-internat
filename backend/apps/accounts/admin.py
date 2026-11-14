from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class DaaraUserAdmin(UserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "establishment", "is_active")
    list_filter = ("role", "is_active", "establishment")
    fieldsets = UserAdmin.fieldsets + (
        ("Daara", {"fields": ("establishment", "role", "phone", "avatar", "can_view_finance", "must_change_password")}),
    )
