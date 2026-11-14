import type { NewsPost } from '../../../../types/site';

export const NEWS_LIMITS = { title: 200, summary: 300, body: 20000 } as const;

export interface NewsForm {
  title: string;
  summary: string;
  body: string;
  publishedOn: string;
  isPublished: boolean;
}

export type NewsErrors = Partial<Record<'title' | 'summary' | 'body' | 'publishedOn', string>>;

/** Date locale du jour au format aaaa-mm-jj. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const emptyNewsForm = (now?: Date): NewsForm => ({
  title: '', summary: '', body: '', publishedOn: todayIso(now), isPublished: true,
});

export const toNewsForm = (n: NewsPost): NewsForm => ({
  title: n.title ?? '', summary: n.summary ?? '', body: n.body ?? '',
  publishedOn: (n.publishedOn ?? '').slice(0, 10), isPublished: n.isPublished,
});

/** Contrôles avant envoi (le serveur revalide). */
export function validateNews(f: NewsForm): NewsErrors {
  const e: NewsErrors = {};
  if (!f.title.trim()) e.title = 'Le titre est obligatoire.';
  else if (f.title.trim().length > NEWS_LIMITS.title) e.title = `Le titre ne doit pas dépasser ${NEWS_LIMITS.title} caractères.`;
  if (f.summary.trim().length > NEWS_LIMITS.summary) e.summary = `Le résumé ne doit pas dépasser ${NEWS_LIMITS.summary} caractères.`;
  if (f.body.trim().length > NEWS_LIMITS.body) e.body = `Le texte ne doit pas dépasser ${NEWS_LIMITS.body} caractères.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.publishedOn) || Number.isNaN(new Date(`${f.publishedOn}T00:00:00`).getTime())) {
    e.publishedOn = 'Choisissez une date valide.';
  }
  return e;
}
