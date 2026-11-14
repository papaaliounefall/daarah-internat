import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { camelize, snakeize } from './case';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';
const REFRESH_KEY = 'daara.refresh';

// Le jeton d'accès (15 min) reste en mémoire ; seul le jeton de rafraîchissement
// (rotatif, révocable côté serveur) est conservé pour survivre au rechargement.
let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export const tokens = {
  get access() { return accessToken; },
  set(access: string, refresh?: string) {
    accessToken = access;
    if (refresh) { try { localStorage.setItem(REFRESH_KEY, refresh); } catch { /* stockage indisponible */ } }
  },
  get refresh(): string | null { try { return localStorage.getItem(REFRESH_KEY); } catch { return null; } },
  clear() {
    accessToken = null;
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
  },
};

export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

export const http = axios.create({ baseURL: BASE, timeout: 30000 });

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // JSON : camelCase → snake_case. FormData : laissé tel quel (clés déjà en snake_case via toFormData).
  if (config.data && !(config.data instanceof FormData)) config.data = snakeize(config.data);
  if (config.params) config.params = snakeize(config.params);
  return config;
});

http.interceptors.response.use(
  res => {
    if (res.data && String(res.headers['content-type'] ?? '').includes('application/json')) res.data = camelize(res.data);
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall && tokens.refresh) {
      original._retry = true;
      try {
        await refreshAccess();
        return http(original);
      } catch {
        tokens.clear();
        onAuthLost?.();
      }
    }
    return Promise.reject(error);
  },
);

// Un seul rafraîchissement à la fois, même si plusieurs requêtes échouent en parallèle.
let refreshing: Promise<void> | null = null;
export function refreshAccess(): Promise<void> {
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE}/auth/refresh/`, { refresh: tokens.refresh })
      .then(r => tokens.set(r.data.access, r.data.refresh))
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** Message lisible (français) extrait d'une erreur API. */
export function errorMessage(err: unknown, fallback = "Une erreur est survenue. Veuillez réessayer."): string {
  const e = err as AxiosError<any>;
  if (!e.response) return "Impossible de joindre le serveur. Vérifiez votre connexion Internet.";
  const data = e.response.data;
  if (e.response.status === 429) return "Trop de tentatives. Patientez un instant avant de réessayer.";
  if (e.response.status === 403) return data?.detail || "Vous n'avez pas les droits nécessaires pour cette opération.";
  if (typeof data === 'string') return fallback;
  if (data?.detail) return String(data.detail);
  if (data && typeof data === 'object') {
    const parts = Object.entries(data).map(([k, v]) => {
      const msg = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return k === 'non_field_errors' || k === 'detail' ? msg : `${k.replace(/_/g, ' ')} : ${msg}`;
    });
    if (parts.length) return parts.join(' — ');
  }
  return fallback;
}

/** Réponse paginée DRF. */
export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }

/** Récupère TOUTES les pages d'une liste (pour les listes de référence de taille raisonnable). */
export async function listAll<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const res = await http.get<Page<T> | T[]>(url, { params: { pageSize: 1000, ...params } });
  return Array.isArray(res.data) ? res.data : res.data.results;
}
