import type { Enrollment } from '../../types';

/** Lien vers le lecteur du Coran positionné sur la progression du talibé. */
export function quranLink(surah: number, ayah: number | null | undefined, studentName: string): string {
  const p = new URLSearchParams({ surah: String(surah) });
  if (ayah) p.set('ayah', String(ayah));
  if (studentName) p.set('student', studentName);
  return `/app/coran?${p.toString()}`;
}

export const ENROLLMENT_STATUS_LABEL: Record<Enrollment['status'], string> = {
  ACTIVE: 'En cours',
  RETIREE: 'Retiré en cours d\'année',
  TERMINEE: 'Année terminée',
};

export const ENROLLMENT_KIND_LABEL: Record<Enrollment['kind'], string> = {
  INSCRIPTION: 'Inscription',
  REINSCRIPTION: 'Réinscription',
};

/** Inscription de l'année donnée (l'année active en pratique), si elle existe. */
export function enrollmentForYear(enrollments: Enrollment[], yearId: string | undefined): Enrollment | undefined {
  return yearId ? enrollments.find(e => e.academicYear === yearId) : undefined;
}
