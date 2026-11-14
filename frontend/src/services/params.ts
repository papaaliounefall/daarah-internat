import { http, type Page } from '../lib/api';

/** Retire les filtres vides (chaîne vide, null, undefined) pour ne pas les envoyer à l'API. */
export function cleanParams(p: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** GET d'une liste paginée avec filtres nettoyés. */
export const getPage = <T>(url: string, params: object = {}) =>
  http.get<Page<T>>(url, { params: cleanParams(params) }).then(r => r.data);

/** Toutes les pages d'une liste de référence (le serveur plafonne à 1000 lignes par page). */
export const getAll = <T>(url: string, params: object = {}) =>
  http.get<Page<T> | T[]>(url, { params: cleanParams({ pageSize: 1000, ...params }) })
    .then(r => (Array.isArray(r.data) ? r.data : r.data.results));
