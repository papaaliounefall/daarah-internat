import type { AudioTrack, ReaderLink, Surah, SurahAudio } from '../../types/quran';

/** Minuscules, sans accents latins ni signes diacritiques arabes, sans apostrophes ni traits d'union. */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[’'`´\-_\s]+/g, '')
    .toLowerCase();
}

/** Recherche par numéro, nom translittéré, nom français ou nom arabe. */
export function filterSurahs(surahs: Surah[], query: string): Surah[] {
  const q = normalizeSearch(query);
  if (!q) return surahs;
  return surahs.filter(s =>
    String(s.number) === q ||
    normalizeSearch(s.nameSimple).includes(q) ||
    normalizeSearch(s.nameFrench).includes(q) ||
    normalizeSearch(s.nameArabic).includes(q),
  );
}

/** Entier borné issu d'un paramètre d'URL ; null si absent ou invalide. */
export function parseBounded(value: string | null | undefined, min: number, max: number): number | null {
  if (value === null || value === undefined || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export const clampAyah = (n: number, count: number) => Math.min(Math.max(1, Math.trunc(n) || 1), Math.max(1, count));

/** Lecture des paramètres ?surah=&ayah=&to=&student=&play=. Une valeur hors bornes est ignorée. */
export function parseReaderParams(params: URLSearchParams): ReaderLink | null {
  const surah = parseBounded(params.get('surah'), 1, 114);
  if (surah === null) return null;
  const ayah = parseBounded(params.get('ayah'), 1, 286);
  const to = parseBounded(params.get('to'), 1, 286);
  return {
    surah,
    ayah,
    to: ayah !== null && to !== null && to >= ayah ? to : null,
    student: params.get('student') || null,
    play: params.get('play') === '1',
  };
}

/** Lien vers le lecteur : /app/coran?surah=112&ayah=4&student=… */
export function readerPath(link: ReaderLink): string {
  const p = new URLSearchParams();
  p.set('surah', String(link.surah));
  if (link.ayah) p.set('ayah', String(link.ayah));
  if (link.ayah && link.to && link.to > link.ayah) p.set('to', String(link.to));
  if (link.student) p.set('student', link.student);
  if (link.play) p.set('play', '1');
  return `/app/coran?${p.toString()}`;
}

/** Verset mis en évidence ? (plage `ayah..to`, ou verset unique). */
export function isHighlighted(n: number, ayah: number | null | undefined, to: number | null | undefined): boolean {
  if (!ayah) return false;
  return n >= ayah && n <= (to && to >= ayah ? to : ayah);
}

/** Tailles de texte proposées (rem). La préférence est purement visuelle. */
export const QURAN_FONT_SIZES = [1.5, 1.75, 2, 2.4, 2.9, 3.4] as const;
export const DEFAULT_FONT_INDEX = 2;
export const clampSizeIndex = (i: number) => Math.min(Math.max(0, Math.trunc(i)), QURAN_FONT_SIZES.length - 1);

const SIZE_KEY = 'daara.quran.size';
export function loadSizeIndex(): number {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw !== null && /^\d+$/.test(raw)) return clampSizeIndex(Number(raw));
  } catch { /* stockage indisponible */ }
  return DEFAULT_FONT_INDEX;
}
export function saveSizeIndex(i: number) {
  try { localStorage.setItem(SIZE_KEY, String(i)); } catch { /* ignore */ }
}

/** Chiffres arabo-indiens pour les numéros de versets. */
export const arabicDigits = (n: number) => n.toLocaleString('ar-EG', { useGrouping: false });

export type AudioMode = 'chapter' | 'verses';

/**
 * Liste de lecture : la sourate complète (une seule piste) ou les versets `from..to` dans l'ordre.
 * Uniquement des URL fournies par l'API ; vide si l'audio demandé n'existe pas.
 */
export function buildQueue(audio: SurahAudio | undefined, mode: AudioMode, from: number, to: number): AudioTrack[] {
  if (!audio) return [];
  if (mode === 'chapter') return audio.chapterAudio ? [audio.chapterAudio] : [];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return audio.verses
    .filter(v => v.ayah !== null && v.ayah >= lo && v.ayah <= hi)
    .sort((a, b) => (a.ayah ?? 0) - (b.ayah ?? 0));
}

/** Piste suivante : fin de liste → boucle si répétition, sinon null. */
export function nextIndex(current: number, length: number, repeat: boolean): number | null {
  if (length === 0) return null;
  if (current + 1 < length) return current + 1;
  return repeat ? 0 : null;
}

/** Récitateur par défaut, sinon le premier de la liste. */
export const defaultReciterSlug = (reciters: { slug: string; isDefault: boolean }[]) =>
  (reciters.find(r => r.isDefault) ?? reciters[0])?.slug ?? '';
