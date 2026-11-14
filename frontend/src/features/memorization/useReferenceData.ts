import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { listCriteria, listQualityLevels } from '../../services/memorization';
import { listSurahs } from '../../services/quran';
import type { EvaluationCriterion, QualityLevel } from '../../types/memorization';
import type { Surah } from '../../types/quran';

export interface ReferenceData {
  surahs: Surah[];
  levels: QualityLevel[];
  criteria: EvaluationCriterion[];
}

export interface ReferenceState {
  data: ReferenceData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Données de référence du suivi : sourates (corpus), niveaux de qualité et critères configurés.
 * Rien n'est codé en dur : si le corpus n'est pas importé, `data.surahs` est vide.
 */
export function useReferenceData(enabled = true): ReferenceState {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([listSurahs(), listQualityLevels(), listCriteria()])
      .then(([surahs, levels, criteria]) => { if (live) setData({ surahs, levels, criteria }); })
      .catch(e => { if (live) setError(errorMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tick, enabled]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, reload };
}
