/** Personnel. L'assistant ne reçoit que les champs non sensibles : les autres sont donc facultatifs. */

export type StaffCategory = 'MAITRE' | 'ADMIN' | 'AUTRE';
export type StaffStatus = 'ACTIF' | 'CONGE' | 'PARTI';

export const STAFF_CATEGORY_LABEL: Record<StaffCategory, string> = {
  MAITRE: 'Maître coranique',
  ADMIN: 'Administration',
  AUTRE: 'Autre',
};
export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIF: 'En poste',
  CONGE: 'En congé',
  PARTI: 'Parti',
};

export interface StaffMember {
  id: string;
  fullName: string;
  category: StaffCategory;
  roleTitle: string;
  phone: string;
  status: StaffStatus;
  // Dossier complet (directeur uniquement) :
  user?: string | null;
  userName?: string;
  email?: string;
  address?: string;
  hireDate?: string;
  endDate?: string | null;
  idNumber?: string;
  notes?: string;
  createdAt?: string;
}

export interface StaffPosition {
  id: string;
  staff: string;
  roleTitle: string;
  startDate: string;
  endDate: string | null;
  note: string;
}

export interface StaffDocument {
  id: string;
  staff: string;
  title: string;
  fileUrl: string | null; // URL signée temporaire
  createdAt: string;
}

export interface StaffFormValues {
  fullName: string;
  category: StaffCategory;
  roleTitle: string;
  phone: string;
  email: string;
  address: string;
  hireDate: string;
  status: StaffStatus;
  idNumber: string;
  notes: string;
  user: string;
}
