import { http, listAll } from '../lib/api';
import type { Ayah, Reciter, Surah, SurahAudio, SurahDetail } from '../types/quran';

/**
 * Le corpus est global et en lecture seule ; l'API envoie ETag + Cache-Control (24 h) que le navigateur
 * revalide. On garde en plus les réponses en mémoire pour la session (aucun stockage persistant du texte).
 */
let surahsCache: Promise<Surah[]> | null = null;
const detailCache = new Map<number, Promise<SurahDetail>>();

export function listSurahs(): Promise<Surah[]> {
  if (!surahsCache) {
    const p = listAll<Surah>('/quran/surahs/').then(rows => [...rows].sort((a, b) => a.number - b.number));
    surahsCache = p;
    p.catch(() => { if (surahsCache === p) surahsCache = null; });
  }
  return surahsCache;
}

export function getSurah(n: number): Promise<SurahDetail> {
  let p = detailCache.get(n);
  if (!p) {
    const q = http.get<SurahDetail>(`/quran/surahs/${n}/`).then(r => r.data);
    p = q;
    detailCache.set(n, q);
    q.catch(() => { if (detailCache.get(n) === q) detailCache.delete(n); });
  }
  return p;
}

/** Plage de versets d'une sourate (la basmala affichée en tête vient de l'API : sourate 1, verset 1). */
export const getAyahRange = (n: number, from: number, to: number): Promise<Ayah[]> =>
  http.get<SurahDetail>(`/quran/surahs/${n}/`, { params: { from, to } }).then(r => r.data.ayat);

let basmalaCache: Promise<Ayah | null> | null = null;
/** Basmala d'en-tête : le verset 1:1 tel que fourni par l'API (jamais saisi côté client). Null si indisponible. */
export function getBasmala(): Promise<Ayah | null> {
  if (!basmalaCache) {
    const p = getAyahRange(1, 1, 1).then(a => a[0] ?? null).catch(() => null);
    basmalaCache = p;
  }
  return basmalaCache;
}

export const listReciters = () => listAll<Reciter>('/quran/reciters/');

export const getSurahAudio = (n: number, reciter?: string) =>
  http.get<SurahAudio>(`/quran/surahs/${n}/audio/`, { params: reciter ? { reciter } : {} }).then(r => r.data);

/** Vide les caches mémoire (bouton « Réessayer »). */
export function resetQuranCache() {
  surahsCache = null;
  detailCache.clear();
  basmalaCache = null;
}
