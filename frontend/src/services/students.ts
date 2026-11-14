import { http, type Page } from '../lib/api';
import { toFormData } from '../lib/case';
import { saveBlob } from '../lib/format';
import type { Student, StudentStatus } from '../types';
import type { StatusChange, StudentDocument, StudentFormValues } from '../types/students';

export type ArchiveFilter = 'active' | 'archived' | 'all';

export interface StudentQuery {
  page: number;
  pageSize: number;
  search?: string;
  classroom?: string;
  status?: StudentStatus | '';
  boarding?: 'true' | 'false' | '';
  archive?: ArchiveFilter;
}

/** Construit les paramètres de requête ; les filtres vides sont omis. `is_archived` absent = dossiers actifs. */
export function studentParams(q: StudentQuery): Record<string, unknown> {
  const p: Record<string, unknown> = { page: q.page, pageSize: q.pageSize, ordering: 'last_name,first_name' };
  if (q.search?.trim()) p.search = q.search.trim();
  if (q.classroom) p.classroom = q.classroom;
  if (q.status) p.status = q.status;
  if (q.boarding) p.boarding = q.boarding;
  if (q.archive === 'archived') p.isArchived = 'true';
  if (q.archive === 'all') p.isArchived = ''; // paramètre présent mais vide : aucun filtre d'archivage
  return p;
}

export const listStudents = (q: StudentQuery) =>
  http.get<Page<Student>>('/students/', { params: studentParams(q) }).then(r => r.data);

export const getStudent = (id: string) => http.get<Student>(`/students/${id}/`).then(r => r.data);

/** Recherche rapide de talibés (liste de choix). */
export const searchStudents = (search: string) =>
  http.get<Page<Student>>('/students/', { params: { search, pageSize: 20 } }).then(r => r.data.results);

/** Corps de requête : JSON sans photo, multipart (snake_case) avec photo. */
export function buildStudentBody(v: Partial<StudentFormValues>, photo: File | null, creating: boolean): Record<string, unknown> | FormData {
  const body: Record<string, unknown> = { ...v };
  if (!creating) { delete body.status; delete body.classroom; }
  else if (!body.classroom) delete body.classroom;
  if (photo) {
    const flat = { ...body, birthDate: body.birthDate ?? '', photo };
    return toFormData(flat);
  }
  return { ...body, birthDate: body.birthDate || null };
}

export const saveStudent = (id: string | null, v: StudentFormValues, photo: File | null) => {
  const body = buildStudentBody(v, photo, id === null);
  return (id ? http.patch<Student>(`/students/${id}/`, body) : http.post<Student>('/students/', body)).then(r => r.data);
};

export const archiveStudent = (id: string) => http.post<Student>(`/students/${id}/archive/`).then(r => r.data);
export const unarchiveStudent = (id: string) => http.post<Student>(`/students/${id}/unarchive/`).then(r => r.data);

export const changeStudentStatus = (id: string, status: StudentStatus, reason: string) =>
  http.post<Student>(`/students/${id}/change-status/`, { status, reason }).then(r => r.data);

export const statusHistory = (id: string) => http.get<StatusChange[]>(`/students/${id}/status-history/`).then(r => r.data);

export const listDocuments = (id: string) => http.get<StudentDocument[]>(`/students/${id}/documents/`).then(r => r.data);

export const addDocument = (id: string, kind: string, title: string, file: File) =>
  http.post<StudentDocument>(`/students/${id}/documents/`, toFormData({ kind, title, file })).then(r => r.data);

/** Export CSV des talibés filtrés : téléchargé avec le jeton (pas de lien direct). */
export async function exportStudentsCsv(q: StudentQuery) {
  const { page: _p, pageSize: _s, ...rest } = studentParams(q);
  const res = await http.get<Blob>('/students/export/', { params: rest, responseType: 'blob' });
  saveBlob(res.data, 'talibes.csv');
}
