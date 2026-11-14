import { http } from '../lib/api';
import { saveBlob } from '../lib/format';
import type { AppNotification, Student } from '../types';
import type { AttendanceRecord } from '../types/attendance';
import type { ParentDashboard, ParentPayment } from '../types/parent';
import { fetchPdf } from './documents';
import { getAll, getPage } from './params';

/** Tableau de bord du parent : enfants, dernières leçons/révisions/évaluations, présences sur 30 jours. */
export const getParentDashboard = () => http.get<ParentDashboard>('/dashboard/').then(r => r.data);

/** Les enfants du parent (le serveur ne renvoie que ses enfants, vue réduite aux informations familiales). */
export const listMyChildren = () => getAll<Student>('/students/', { ordering: 'first_name' });

/** Pointages d'un enfant depuis une date (lecture seule). */
export const listChildAttendance = (studentId: string, dateAfter: string) =>
  getPage<AttendanceRecord>('/attendance/', { student: studentId, dateAfter, ordering: '-date', pageSize: 100 }).then(p => p.results);

/** Paiements de l'enfant, en lecture seule. */
export const listChildPayments = (studentId: string) =>
  getPage<ParentPayment>('/finance/my-children-payments/', { student: studentId, pageSize: 50 }).then(p => p.results);

export const listUnreadNotifications = () =>
  getPage<AppNotification>('/notifications/', { unread: 'true', pageSize: 5 });

export const markAllNotificationsRead = () => http.post<{ updated: number }>('/notifications/read-all/').then(r => r.data);

/** Carte talibé courante (PDF) : récupérée avec le jeton puis enregistrée. 404 si aucune carte n'a été générée. */
export async function downloadChildCard(studentId: string, registrationNumber: string) {
  const blob = await fetchPdf(`/students/${studentId}/card/`);
  saveBlob(blob, `carte-talibe-${registrationNumber || studentId}.pdf`);
}
