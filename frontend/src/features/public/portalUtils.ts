import type { PublicContent } from '../../types/site';

export const hasText = (v: string | null | undefined): v is string => Boolean(v && v.trim());

export type SectionId = 'histoire' | 'mission' | 'vision' | 'valeurs' | 'activites' | 'equipe' | 'admission';

export interface Section { id: SectionId; label: string }

/** Sections institutionnelles RENSEIGNÉES, dans l'ordre d'affichage. Une section vide n'est jamais affichée. */
export function visibleSections(c: PublicContent): Section[] {
  const out: Section[] = [];
  if (hasText(c.history)) out.push({ id: 'histoire', label: 'Notre histoire' });
  if (hasText(c.mission)) out.push({ id: 'mission', label: 'Mission' });
  if (hasText(c.vision)) out.push({ id: 'vision', label: 'Vision' });
  if (c.values?.some(v => hasText(v.title))) out.push({ id: 'valeurs', label: 'Valeurs' });
  if (c.activities?.some(v => hasText(v.title))) out.push({ id: 'activites', label: 'Activités' });
  if (c.team?.some(m => hasText(m.name))) out.push({ id: 'equipe', label: 'Équipe' });
  if (hasText(c.admissionInfo)) out.push({ id: 'admission', label: 'Admission' });
  return out;
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LETTERS = /\p{L}/gu;

/** Vrai si la majorité des lettres du texte sont arabes. */
export function isMostlyArabic(text: string): boolean {
  const letters = text.match(LETTERS)?.length ?? 0;
  if (letters === 0) return false;
  return (text.match(ARABIC)?.length ?? 0) / letters > 0.5;
}

/** Attributs à poser sur un bloc de texte : police arabe et sens de lecture si le texte est en arabe. `base` : classes communes. */
export function textProps(text: string, base = ''): { dir?: 'rtl'; lang?: 'ar'; className: string } {
  return isMostlyArabic(text)
    ? { dir: 'rtl', lang: 'ar', className: `${base} font-arabic text-lg leading-relaxed`.trim() }
    : { className: base };
}

/** Lien OpenStreetMap vers un point (aucun script tiers n'est chargé). */
export function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export const toCoord = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Numéro composable (« tel: ») : chiffres et « + » uniquement. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

// --- Formulaire de demande d'information --------------------------------------------------------
export interface ContactValues { name: string; phone: string; email: string; message: string }
export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

const PHONE_RE = /^[0-9+()./\-\s]{6,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contrôles de saisie (mêmes règles que le serveur, qui revalide). */
export function validateContact(v: ContactValues): ContactErrors {
  const e: ContactErrors = {};
  const name = v.name.trim();
  if (!name) e.name = 'Merci d\'indiquer votre nom.';
  else if (name.length < 2) e.name = 'Le nom est trop court.';
  else if (name.length > 150) e.name = 'Le nom est trop long (150 caractères maximum).';

  const phone = v.phone.trim();
  const email = v.email.trim();
  if (phone && !PHONE_RE.test(phone)) e.phone = 'Numéro de téléphone invalide.';
  if (email && !EMAIL_RE.test(email)) e.email = 'Adresse e-mail invalide.';
  if (!phone && !email) e.phone = 'Indiquez un numéro de téléphone ou une adresse e-mail pour être recontacté.';

  const message = v.message.trim();
  if (!message) e.message = 'Merci de saisir votre message.';
  else if (message.length < 10) e.message = 'Votre message est trop court (10 caractères minimum).';
  else if (message.length > 3000) e.message = 'Votre message est trop long (3000 caractères maximum).';
  return e;
}

/** Erreurs par champ renvoyées par le serveur (400) ; `general` pour le reste. */
export function serverContactErrors(data: unknown): { fields: ContactErrors; general: string | null } {
  const fields: ContactErrors = {};
  let general: string | null = null;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const text = (x: unknown) => (Array.isArray(x) ? x.filter(i => typeof i === 'string').join(' ') : typeof x === 'string' ? x : '');
    for (const key of ['name', 'phone', 'email', 'message'] as const) {
      const m = text(d[key]);
      if (m) fields[key] = m;
    }
    const other = text(d.detail) || text(d.nonFieldErrors);
    if (other) general = other;
  }
  return { fields, general };
}
