/** Formes de /visit-requests/ (voir backend/docs/api/visits.md). Clés en camelCase. */

export type VisitStatus = 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE' | 'MODIFICATION_PROPOSEE' | 'ANNULEE';

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTEE: 'Acceptée',
  REFUSEE: 'Refusée',
  MODIFICATION_PROPOSEE: 'Modification proposée',
  ANNULEE: 'Annulée',
};

export interface VisitRequest {
  id: string;
  guardian: string;
  guardianId: string;
  guardianName: string;
  student: string;
  studentId: string;
  studentName: string;
  requestedDate: string;
  requestedTime: string;
  message: string;
  status: VisitStatus;
  statusLabel: string;
  decisionDate: string | null;
  decidedBy: string | null;
  decidedByName: string;
  adminNote: string;
  proposedDate: string | null;
  proposedTime: string | null;
  confirmedDate: string | null;
  confirmedTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitCreateInput {
  student: string;
  requestedDate: string;
  requestedTime: string;
  message: string;
}

export interface VisitFilters {
  status: VisitStatus | '';
  dateAfter: string;
  dateBefore: string;
  search: string;
}
