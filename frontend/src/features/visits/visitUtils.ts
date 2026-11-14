import type { VisitRequest, VisitStatus } from '../../types/visits';

/** « 10:00:00 » ou « 10:00 » → « 10:00 ». */
export function formatTime(value: string | null | undefined): string {
  const m = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** Date locale AAAA-MM-JJ. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Le créneau (date + heure) est-il déjà passé ? Date ou heure manquante : non. */
export function isSlotPast(date: string, time: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, mo, d] = date.split('-').map(Number);
  const t = /^(\d{1,2}):(\d{2})/.exec(time);
  const slot = new Date(y, mo - 1, d, t ? Number(t[1]) : 23, t ? Number(t[2]) : 59, 59);
  return slot.getTime() < now.getTime();
}

export interface VisitFormErrors { student?: string; date?: string; time?: string }

/** Validation de la demande d'un parent : enfant, date non passée, heure. */
export function validateVisit(v: { student: string; date: string; time: string }, now: Date = new Date()): VisitFormErrors {
  const e: VisitFormErrors = {};
  if (!v.student) e.student = 'Choisissez un enfant.';
  if (!v.date) e.date = 'Choisissez une date.';
  else if (v.date < todayIso(now)) e.date = 'La date ne peut pas être dans le passé.';
  if (!v.time) e.time = 'Indiquez une heure.';
  else if (v.date && !e.date && isSlotPast(v.date, v.time, now)) e.time = "Ce créneau est déjà passé.";
  return e;
}

/** Le parent peut annuler tant que la demande n'est pas acceptée. */
export const parentCanCancel = (s: VisitStatus) => s === 'EN_ATTENTE' || s === 'MODIFICATION_PROPOSEE';
export const parentCanAnswerProposal = (s: VisitStatus) => s === 'MODIFICATION_PROPOSEE';

export interface AdminActions { accept: boolean; refuse: boolean; propose: boolean }

/** Actions possibles pour l'administration selon le statut (voir la table des transitions de l'API). */
export function adminActions(s: VisitStatus): AdminActions {
  return {
    accept: s === 'EN_ATTENTE',
    refuse: s === 'EN_ATTENTE' || s === 'ACCEPTEE',
    propose: s === 'EN_ATTENTE' || s === 'MODIFICATION_PROPOSEE' || s === 'ACCEPTEE',
  };
}

/** Créneau « qui compte » : confirmé si accepté, proposé si une modification est en cours, sinon demandé. */
export function effectiveSlot(v: VisitRequest): { date: string; time: string; label: string } {
  if (v.status === 'ACCEPTEE' && v.confirmedDate) return { date: v.confirmedDate, time: v.confirmedTime ?? v.requestedTime, label: 'Visite confirmée' };
  if (v.status === 'MODIFICATION_PROPOSEE' && v.proposedDate) return { date: v.proposedDate, time: v.proposedTime ?? v.requestedTime, label: 'Créneau proposé' };
  return { date: v.requestedDate, time: v.requestedTime, label: 'Créneau demandé' };
}

export const STATUS_TONE: Record<VisitStatus, 'warning' | 'success' | 'danger' | 'info' | 'neutral'> = {
  EN_ATTENTE: 'warning', ACCEPTEE: 'success', REFUSEE: 'danger', MODIFICATION_PROPOSEE: 'info', ANNULEE: 'neutral',
};
