import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';

export interface FetchState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Remplace la donnée localement (mise à jour optimiste après une mutation). */
  setData: (d: T) => void;
}

/** Charge une ressource ; gère chargement, erreur lisible, rechargement et courses de requêtes. */
export function useFetch<T>(fetcher: () => Promise<T>, deps: DependencyList = []): FetchState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    fetcher()
      .then(d => { if (id === seq.current) { setData(d); setLoading(false); } })
      .catch(e => { if (id === seq.current) { setError(errorMessage(e)); setLoading(false); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, reload, setData };
}
