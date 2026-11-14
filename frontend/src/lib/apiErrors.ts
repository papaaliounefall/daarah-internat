import type { AxiosError } from 'axios';
import { errorMessage } from './api';

/**
 * Message d'erreur sans noms de champs techniques : « La chambre est complète (4 places). »
 * plutôt que « room : La chambre est complète (4 places). ». Les messages du serveur sont déjà en français.
 */
export function plainErrorMessage(err: unknown, fallback?: string): string {
  const e = err as AxiosError<unknown>;
  const data = e?.response?.data;
  if (e?.response && e.response.status !== 403 && e.response.status !== 429 && data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === 'string') return d.detail;
    const parts: string[] = [];
    for (const v of Object.values(d)) {
      if (Array.isArray(v)) parts.push(...v.filter((x): x is string => typeof x === 'string'));
      else if (typeof v === 'string') parts.push(v);
    }
    if (parts.length) return parts.join(' ');
  }
  return errorMessage(err, fallback);
}

/** Un motif d'annulation / de refus doit comporter au moins 3 caractères (règle du serveur). */
export const MIN_REASON_LENGTH = 3;
export const isValidReason = (reason: string) => reason.trim().length >= MIN_REASON_LENGTH;
