import type { StudentStatus } from './index';

export type DocumentKind = 'EXTRAIT_NAISSANCE' | 'ADMINISTRATIF' | 'MEDICAL' | 'AUTRE';

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  EXTRAIT_NAISSANCE: 'Extrait de naissance',
  ADMINISTRATIF: 'Document administratif',
  MEDICAL: 'Document médical',
  AUTRE: 'Autre justificatif',
};

export interface StudentDocument {
  id: string;
  student: string;
  kind: DocumentKind;
  title: string;
  fileUrl: string | null; // URL signée temporaire
  createdAt: string;
}

export interface StatusChange {
  id: string;
  student: string;
  fromStatus: StudentStatus;
  toStatus: StudentStatus;
  reason: string;
  effectiveDate: string;
  changedByName: string;
  createdAt: string;
}

export const STATUS_LABEL: Record<StudentStatus, string> = {
  PAYANT: 'Payant',
  SOCIAL: 'Social (pris en charge)',
};

/** Valeurs du formulaire talibé (dossier §6). */
export interface StudentFormValues {
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  birthDate: string;
  birthPlace: string;
  nationality: string;
  address: string;
  fatherName: string;
  fatherPhone: string;
  motherName: string;
  motherPhone: string;
  guardianName: string;
  guardianPhone: string;
  emergencyContact: string;
  emergencyPhone: string;
  status: StudentStatus;
  enrollmentDate: string;
  classroom: string;
  notes: string;
}
