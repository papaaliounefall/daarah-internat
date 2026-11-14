import { http } from '../lib/api';
import { toFormData } from '../lib/case';
import { getAll, getPage } from './params';
import type { StaffDocument, StaffFormValues, StaffMember, StaffPosition } from '../types/staff';

export interface StaffQuery { page?: number; pageSize?: number; search?: string; category?: string; status?: string }
export const listStaff = (q: StaffQuery) => getPage<StaffMember>('/staff/', { ordering: 'full_name', ...q });
/** Liste de référence (choix d'un responsable de chambre, par exemple). */
export const listAllStaff = () => getAll<StaffMember>('/staff/', { ordering: 'full_name' });

export const getStaff = (id: string) => http.get<StaffMember>(`/staff/${id}/`).then(r => r.data);

/** Champs vides facultatifs : null pour le compte lié, chaîne vide ailleurs. */
export function staffBody(v: StaffFormValues): Record<string, unknown> {
  return { ...v, user: v.user || null, hireDate: v.hireDate || null };
}
export const saveStaff = (id: string | null, v: StaffFormValues) =>
  (id ? http.patch<StaffMember>(`/staff/${id}/`, staffBody(v)) : http.post<StaffMember>('/staff/', staffBody(v))).then(r => r.data);

export const leaveStaff = (id: string, endDate: string) =>
  http.post<StaffMember>(`/staff/${id}/leave/`, endDate ? { endDate } : {}).then(r => r.data);

export const listPositions = (id: string) => getAll<StaffPosition>(`/staff/${id}/positions/`);
export const addPosition = (id: string, roleTitle: string, startDate: string, note: string) =>
  http.post<StaffPosition>(`/staff/${id}/positions/`, { roleTitle, startDate: startDate || undefined, note }).then(r => r.data);

export const listDocuments = (id: string) => getAll<StaffDocument>(`/staff/${id}/documents/`);
export const addDocument = (id: string, title: string, file: File) =>
  http.post<StaffDocument>(`/staff/${id}/documents/`, toFormData({ title, file })).then(r => r.data);
