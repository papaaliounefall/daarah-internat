import { useFetch } from '../../hooks/useFetch';
import { currentYearOf, listYears } from '../../services/academics';
import type { AcademicYear } from '../../types';

/** Années scolaires + identifiant de l'année en cours (ou la plus récente à défaut). */
export function useYears() {
  const f = useFetch(listYears, []);
  const years: AcademicYear[] = f.data ?? [];
  const currentId = (currentYearOf(years) ?? years[0])?.id ?? '';
  return { years, currentId, loading: f.loading, error: f.error, reload: f.reload };
}
