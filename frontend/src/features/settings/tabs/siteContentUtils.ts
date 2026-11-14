import type { SiteContent, SocialLink, TeamMember, TitledText } from '../../../types/site';

export const LIMITS = {
  values: 30, activities: 30, team: 50, longText: 10000, tagline: 255, itemTitle: 150, itemText: 1000, address: 255,
  teachings: 12, boarding: 12, approach: 8, socialLinks: 8, heroText: 600, boardingIntro: 3000, legalText: 20000, linkUrl: 1000,
} as const;

/** Formulaire : les coordonnées restent des chaînes de saisie. */
export interface SiteForm {
  tagline: string;
  history: string;
  mission: string;
  vision: string;
  admissionInfo: string;
  values: TitledText[];
  activities: TitledText[];
  team: TeamMember[];
  heroText: string;
  teachings: TitledText[];
  boardingIntro: string;
  boarding: TitledText[];
  approach: TitledText[];
  socialLinks: SocialLink[];
  legalNotice: string;
  privacyPolicy: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  latitude: string;
  longitude: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** Contenu reçu du serveur → valeurs du formulaire. */
export function toSiteForm(c: SiteContent): SiteForm {
  return {
    tagline: str(c.tagline), history: str(c.history), mission: str(c.mission), vision: str(c.vision),
    admissionInfo: str(c.admissionInfo),
    values: (c.values ?? []).map(v => ({ title: str(v.title), text: str(v.text) })),
    activities: (c.activities ?? []).map(v => ({ title: str(v.title), text: str(v.text) })),
    team: (c.team ?? []).map(m => ({ name: str(m.name), role: str(m.role) })),
    heroText: str(c.heroText), boardingIntro: str(c.boardingIntro),
    teachings: (c.teachings ?? []).map(v => ({ title: str(v.title), text: str(v.text) })),
    boarding: (c.boarding ?? []).map(v => ({ title: str(v.title), text: str(v.text) })),
    approach: (c.approach ?? []).map(v => ({ title: str(v.title), text: str(v.text) })),
    socialLinks: (c.socialLinks ?? []).map(l => ({ label: str(l.label), url: str(l.url) })),
    legalNotice: str(c.legalNotice), privacyPolicy: str(c.privacyPolicy),
    contactPhone: str(c.contactPhone), contactEmail: str(c.contactEmail), address: str(c.address),
    latitude: str(c.latitude), longitude: str(c.longitude),
  };
}

export type SiteErrors = Partial<Record<keyof SiteForm, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseCoord = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Adresse web absolue en http(s), sans espace, avec un nom d'hôte. */
export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v) || !/^https?:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Réseaux sociaux : lignes entièrement vides ignorées ; libellé et adresse http(s) exigés sinon. */
export function validateSocialLinks(links: SocialLink[]): string | undefined {
  const filled = links.filter(l => l.label.trim() || l.url.trim());
  if (filled.length > LIMITS.socialLinks) return `${LIMITS.socialLinks} liens au maximum.`;
  for (const [i, l] of filled.entries()) {
    if (!l.label.trim()) return `Lien ${i + 1} : indiquez un libellé.`;
    if (!isHttpUrl(l.url)) return `Lien ${i + 1} : l'adresse doit commencer par http:// ou https://.`;
  }
  return undefined;
}

/** Contrôles avant envoi (le serveur revalide). */
export function validateSite(f: SiteForm): SiteErrors {
  const e: SiteErrors = {};
  if (f.contactEmail.trim() && !EMAIL_RE.test(f.contactEmail.trim())) e.contactEmail = 'Adresse e-mail invalide.';
  const lat = parseCoord(f.latitude);
  const lng = parseCoord(f.longitude);
  if (Number.isNaN(lat)) e.latitude = 'Latitude invalide.';
  else if (lat !== null && (lat < -90 || lat > 90)) e.latitude = 'La latitude doit être comprise entre -90 et 90.';
  if (Number.isNaN(lng)) e.longitude = 'Longitude invalide.';
  else if (lng !== null && (lng < -180 || lng > 180)) e.longitude = 'La longitude doit être comprise entre -180 et 180.';
  if (!e.latitude && !e.longitude && (lat === null) !== (lng === null)) {
    e[lat === null ? 'latitude' : 'longitude'] = 'Renseignez la latitude et la longitude, ou laissez les deux vides.';
  }
  if (f.values.length > LIMITS.values) e.values = `${LIMITS.values} valeurs au maximum.`;
  if (f.activities.length > LIMITS.activities) e.activities = `${LIMITS.activities} activités au maximum.`;
  if (f.team.length > LIMITS.team) e.team = `${LIMITS.team} membres au maximum.`;
  if (f.teachings.length > LIMITS.teachings) e.teachings = `${LIMITS.teachings} enseignements au maximum.`;
  if (f.boarding.length > LIMITS.boarding) e.boarding = `${LIMITS.boarding} éléments au maximum.`;
  if (f.approach.length > LIMITS.approach) e.approach = `${LIMITS.approach} étapes au maximum.`;
  const links = validateSocialLinks(f.socialLinks);
  if (links) e.socialLinks = links;
  return e;
}

/** Retire les lignes dont le premier champ est vide (le serveur les refuse). */
export const cleanTitled = (items: TitledText[]): TitledText[] =>
  items.map(i => ({ title: i.title.trim(), text: i.text.trim() })).filter(i => i.title);
export const cleanLinks = (items: SocialLink[]): SocialLink[] =>
  items.map(l => ({ label: l.label.trim(), url: l.url.trim() })).filter(l => l.label || l.url);
export const cleanTeam = (items: TeamMember[]): TeamMember[] =>
  items.map(m => ({ name: m.name.trim(), role: m.role.trim() })).filter(m => m.name);

/** Corps du PATCH : coordonnées au format décimal du serveur (6 décimales) ou null. */
export function buildSitePatch(f: SiteForm): Partial<SiteContent> {
  const lat = parseCoord(f.latitude);
  const lng = parseCoord(f.longitude);
  return {
    tagline: f.tagline.trim(), history: f.history.trim(), mission: f.mission.trim(), vision: f.vision.trim(),
    admissionInfo: f.admissionInfo.trim(),
    values: cleanTitled(f.values), activities: cleanTitled(f.activities), team: cleanTeam(f.team),
    heroText: f.heroText.trim(), boardingIntro: f.boardingIntro.trim(),
    teachings: cleanTitled(f.teachings), boarding: cleanTitled(f.boarding), approach: cleanTitled(f.approach),
    socialLinks: cleanLinks(f.socialLinks), legalNotice: f.legalNotice.trim(), privacyPolicy: f.privacyPolicy.trim(),
    contactPhone: f.contactPhone.trim(), contactEmail: f.contactEmail.trim(), address: f.address.trim(),
    latitude: lat === null || Number.isNaN(lat) ? null : lat.toFixed(6),
    longitude: lng === null || Number.isNaN(lng) ? null : lng.toFixed(6),
  };
}

/** Déplace un élément d'une liste (haut / bas) sans modifier l'original. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= items.length) return items;
  const out = [...items];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Entête arabe : une ligne par ligne d'en-tête, lignes vides ignorées. */
export const headerLines = (nameAr: string): string[] => nameAr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

/** Valeur enregistrée pour `nameAr` : lignes nettoyées, séparées par un retour à la ligne. */
export const normalizeNameAr = (nameAr: string): string => headerLines(nameAr).join('\n');

export const NAME_AR_MAX = 300;
