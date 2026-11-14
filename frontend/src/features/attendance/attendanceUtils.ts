import type { AttendanceRecord, AttendanceStatus, BulkRecordInput, DayStat } from '../../types/attendance';

export interface Mark { status: AttendanceStatus; reason: string }
export type Marks = Record<string, Mark>;

/** Tout le monde « présent » par défaut ; un pointage déjà enregistré pour le créneau est repris tel quel. */
export function initialMarks(studentIds: string[], existing: AttendanceRecord[]): Marks {
  const byStudent = new Map(existing.map(r => [r.studentId ?? r.student, r]));
  const marks: Marks = {};
  for (const id of studentIds) {
    const rec = byStudent.get(id);
    marks[id] = rec ? { status: rec.status, reason: rec.reason ?? '' } : { status: 'PRESENT', reason: '' };
  }
  return marks;
}

/** Un tap sur le statut déjà actif revient à « présent » ; sinon le nouveau statut est choisi. */
export function toggleStatus(current: AttendanceStatus, clicked: AttendanceStatus): AttendanceStatus {
  return current === clicked ? 'PRESENT' : clicked;
}

export interface Counts { present: number; absent: number; late: number; excused: number }

export function countMarks(marks: Marks): Counts {
  const c: Counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of Object.values(marks)) {
    if (m.status === 'PRESENT') c.present += 1;
    else if (m.status === 'ABSENT') c.absent += 1;
    else if (m.status === 'RETARD') c.late += 1;
    else c.excused += 1;
  }
  return c;
}

/** Corps de l'enregistrement en lot : le motif n'est transmis que pour un statut autre que « présent ». */
export function buildRecords(studentIds: string[], marks: Marks): BulkRecordInput[] {
  return studentIds.map(id => {
    const m = marks[id] ?? { status: 'PRESENT' as const, reason: '' };
    const reason = m.status === 'PRESENT' ? '' : m.reason.trim();
    return reason ? { student: id, status: m.status, reason } : { student: id, status: m.status };
  });
}

/** Date locale AAAA-MM-JJ. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Mois AAAA-MM d'une date (ou du jour). */
export const monthOf = (iso?: string, now: Date = new Date()) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : todayIso(now).slice(0, 7));

/** « 84,5 % » ou « — » quand aucun pointage n'existe. */
export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export interface DayBar { day: string; date: string; present: number; late: number; excused: number; absent: number }

/** Données du graphique journalier (jour du mois en abscisse). */
export function dayBars(days: DayStat[]): DayBar[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ day: String(Number(d.date.slice(8, 10))), date: d.date, present: d.present, late: d.late, excused: d.excused, absent: d.absent }));
}

/** Les mois au format AAAA-MM sont valides ? */
export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
