import type { AttendanceStatus } from '../../types/attendance';
import type { ChildAttendance30 } from '../../types/parent';

/** Date AAAA-MM-JJ située `days` jours avant `now` (fenêtre « 30 derniers jours »). */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const attendanceTotal = (a: ChildAttendance30) => a.present + a.absent + a.late + a.excused;

/** Taux de présence en % : présents + retards sur l'ensemble des pointages ; null s'il n'y en a aucun. */
export function presenceRate(a: ChildAttendance30): number | null {
  const total = attendanceTotal(a);
  return total === 0 ? null : Math.round(((a.present + a.late) / total) * 1000) / 10;
}

export const STATUS_TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  PRESENT: 'success', ABSENT: 'danger', RETARD: 'warning', EXCUSE: 'info',
};

const METHODS: Record<string, string> = { ESPECES: 'Espèces', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', VIREMENT: 'Virement', AUTRE: 'Autre' };
const KINDS: Record<string, string> = { INSCRIPTION: 'Inscription', MENSUALITE: 'Mensualité', EXCEPTIONNEL: 'Frais exceptionnel', DON: 'Don' };

export const methodLabel = (m: string) => METHODS[m] ?? m;
export const feeKindLabel = (k: string) => KINDS[k] ?? k;

/** « 3 à 5 » ou « 4 » (versets). */
export const versesLabel = (start: number, end: number) => (start === end ? `verset ${start}` : `versets ${start} à ${end}`);
