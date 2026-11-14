import csv

import django_filters
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.academics import services as academics
from apps.academics.models import ClassRoom
from apps.audit.services import record
from apps.core.roles import ADMIN_ROLES, ALL_ROLES, Role
from apps.core.views import AuditedMixin, NoDeleteMixin, TenantViewSetMixin

from .models import Student, StudentDocument, StudentStatus, StudentStatusChange
from .selectors import student_scope, with_derived
from .serializers import (
    StudentDocumentSerializer, StudentFamilySerializer, StudentSerializer, StudentStatusChangeSerializer,
    StudentTeacherSerializer,
)


class StudentFilter(django_filters.FilterSet):
    classroom = django_filters.UUIDFilter(method="filter_classroom")
    academic_year = django_filters.UUIDFilter(method="filter_year")
    boarding = django_filters.BooleanFilter(method="filter_boarding")

    class Meta:
        model = Student
        fields = ["status", "gender", "is_archived"]

    def filter_classroom(self, qs, name, value):
        return qs.filter(enrollments__classroom_id=value, enrollments__status="ACTIVE").distinct()

    def filter_year(self, qs, name, value):
        return qs.filter(enrollments__academic_year_id=value).distinct()

    def filter_boarding(self, qs, name, value):
        from apps.boarding.models import BoardingAssignment

        in_boarding = BoardingAssignment.objects.filter(end_date__isnull=True).values("student_id")
        return qs.filter(pk__in=in_boarding) if value else qs.exclude(pk__in=in_boarding)


class StudentViewSet(AuditedMixin, NoDeleteMixin, TenantViewSetMixin, viewsets.ModelViewSet):
    """Dossiers des talibés. Aucune suppression définitive : archivage uniquement."""

    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    filterset_class = StudentFilter
    search_fields = ["first_name", "last_name", "registration_number"]
    ordering_fields = ["last_name", "first_name", "registration_number", "created_at"]
    audit_exclude = ("photo",)
    role_access = {
        "list": ALL_ROLES, "retrieve": ALL_ROLES,
        "create": ADMIN_ROLES, "update": ADMIN_ROLES, "partial_update": ADMIN_ROLES,
        "archive": ADMIN_ROLES, "unarchive": ADMIN_ROLES, "export": ADMIN_ROLES,
        "change_status": {Role.DIRECTEUR}, "status_history": ADMIN_ROLES,
        "documents": ADMIN_ROLES, "add_document": ADMIN_ROLES,
    }

    def get_queryset(self):
        qs = with_derived(super().get_queryset())
        # Les dossiers archivés ne sont listés que sur demande explicite.
        if self.action == "list" and "is_archived" not in self.request.query_params:
            qs = qs.filter(is_archived=False)
        return qs

    def scope_queryset(self, qs):
        return student_scope(qs, self.request.user)

    def get_serializer_class(self):
        role = self.request.user.role
        if role == Role.PARENT:
            return StudentFamilySerializer
        if role == Role.MAITRE:
            return StudentTeacherSerializer
        return StudentSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        est = self.request.user.establishment
        classroom_id = serializer.validated_data.get("classroom")
        year = academics.current_year(est)
        classroom = None
        if classroom_id:
            classroom = ClassRoom.objects.filter(pk=classroom_id, establishment=est).first()
            if classroom is None:
                raise ValidationError({"classroom": "Classe introuvable."})
        if year is None:
            raise ValidationError({"detail": "Aucune année scolaire active : créez-en une avant d'inscrire un talibé."})
        super().perform_create(serializer)
        academics.enroll(serializer.instance, year, classroom, user=self.request.user)

    def perform_update(self, serializer):
        super().perform_update(serializer)

    # ---- archivage (remplace la suppression) ----
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        st = self.get_object()
        st.is_archived, st.archived_at = True, timezone.now()
        st.save(update_fields=["is_archived", "archived_at", "updated_at"])
        record(request, "ARCHIVE", st)
        return Response(self.get_serializer(st).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        st = self.get_object()
        st.is_archived, st.archived_at = False, None
        st.save(update_fields=["is_archived", "archived_at", "updated_at"])
        record(request, "UNARCHIVE", st)
        return Response(self.get_serializer(st).data)

    # ---- statut social / payant, avec historique ----
    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        st = self.get_object()
        new = request.data.get("status")
        if new not in StudentStatus.values:
            raise ValidationError({"status": "Statut invalide (PAYANT ou SOCIAL)."})
        if new == st.status:
            raise ValidationError({"status": "Le talibé a déjà ce statut."})
        old = st.status
        with transaction.atomic():
            StudentStatusChange.objects.create(
                establishment=st.establishment, student=st, from_status=old, to_status=new,
                reason=request.data.get("reason", ""), changed_by=request.user,
            )
            st.status = new
            st.save(update_fields=["status", "updated_at"])
        record(request, "STATUS_CHANGE", st, changes={"status": {"old": old, "new": new}})
        return Response(self.get_serializer(self.get_queryset().get(pk=st.pk)).data)

    @action(detail=True, methods=["get"], url_path="status-history")
    def status_history(self, request, pk=None):
        st = self.get_object()
        qs = st.status_changes.select_related("changed_by")
        return Response(StudentStatusChangeSerializer(qs, many=True, context={"request": request}).data)

    # ---- documents ----
    @action(detail=True, methods=["get"])
    def documents(self, request, pk=None):
        st = self.get_object()
        return Response(StudentDocumentSerializer(st.documents.all(), many=True, context={"request": request}).data)

    @documents.mapping.post
    def add_document(self, request, pk=None):
        st = self.get_object()
        data = request.data.copy()
        data["student"] = str(st.pk)
        ser = StudentDocumentSerializer(data=data, context={"request": request})
        ser.is_valid(raise_exception=True)
        doc = ser.save(establishment=request.user.establishment, uploaded_by=request.user)
        record(request, "DOCUMENT_ADD", doc, changes={"student": str(st.pk)})
        return Response(StudentDocumentSerializer(doc, context={"request": request}).data, status=201)

    # ---- export des listes autorisées ----
    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        resp = HttpResponse(content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="talibes.csv"'
        resp.write("﻿")  # BOM : ouverture correcte dans Excel
        w = csv.writer(resp, delimiter=";")
        w.writerow(["Matricule", "Nom", "Prénom", "Sexe", "Naissance", "Statut", "Classe", "Internat", "Téléphone responsable"])
        ser = self.get_serializer(qs, many=True)
        for row in ser.data:
            w.writerow([
                row["registration_number"], row["last_name"], row["first_name"], row["gender"],
                row["birth_date"] or "", row["status"], row["class_name"], "Oui" if row["is_boarding"] else "Non",
                row["guardian_phone"] or row["father_phone"],
            ])
        record(request, "EXPORT", model="Student", detail=f"{qs.count()} lignes")
        return resp
