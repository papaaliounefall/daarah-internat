import type { AcademicYear, Enrollment } from '../../types';

export type YearState = 'CURRENT' | 'CLOSED' | 'UPCOMING';

export const yearState = (y: Pick<AcademicYear, 'isCurrent' | 'isClosed'>): YearState =>
  y.isClosed ? 'CLOSED' : y.isCurrent ? 'CURRENT' : 'UPCOMING';

export const YEAR_STATE_LABEL: Record<YearState, string> = {
  CURRENT: 'En cours',
  CLOSED: 'Clôturée',
  UPCOMING: 'Non activée',
};

/** « 2025-2026 » à partir des dates ; « 2025 » si elles tombent la même année ; vide si invalides. */
export function suggestYearName(startDate: string, endDate: string): string {
  const a = Number(startDate.slice(0, 4));
  const b = Number(endDate.slice(0, 4));
  if (!a || !b || b < a) return '';
  return a === b ? String(a) : `${a}-${b}`;
}

/** Talibés de l'année précédente (hors retraits) qui ne sont pas encore inscrits dans l'année cible. */
export function studentsToReenroll(previous: Enrollment[], target: Enrollment[]): Enrollment[] {
  const already = new Set(target.map(e => e.student));
  const seen = new Set<string>();
  return previous.filter(e => {
    if (e.status === 'RETIREE' || already.has(e.student) || seen.has(e.student)) return false;
    seen.add(e.student);
    return true;
  });
}

/** Une année ne peut être clôturée que si l'on a tapé exactement son nom. */
export const closeConfirmed = (typed: string, year: Pick<AcademicYear, 'name'>) => typed.trim() === year.name.trim();

/** Texte lisible d'une erreur DRF (chaîne, liste ou dictionnaire de listes). */
export function skipReason(error: unknown): string {
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) return error.map(skipReason).join(' ');
  if (error && typeof error === 'object') return Object.values(error).map(skipReason).join(' ');
  return 'Raison inconnue.';
}
