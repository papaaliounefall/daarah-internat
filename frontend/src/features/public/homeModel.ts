import type { HomeContent, TextItem } from './publicApi';
import { hasText } from './portalUtils';

/**
 * Textes par défaut de la page d'accueil : ceux rédigés par la direction dans le plan du site.
 * Dès que le Daara renseigne ses propres textes (Paramètres → Portail public), ils les remplacent.
 */
export const DEFAULTS = {
  kicker: 'KAHONE · KAOLACK · SÉNÉGAL',
  tagline: "Former aujourd'hui, guider pour demain.",
  heroText:
    "Un cadre d'apprentissage et de vie dédié à l'éducation coranique, à la mémorisation du Saint Coran et à l'épanouissement des apprenants.",
  presentationTitle: 'Notre Daara, une mission éducative et spirituelle',
  presentation:
    "Le Daara Internat Shaykh Aliou Fatima est un établissement d'enseignement coranique situé à Kahone, dans la région de Kaolack. " +
    "Il œuvre à offrir aux apprenants un environnement propice à l'apprentissage, à la mémorisation du Saint Coran et à leur développement personnel.",
  teachings: [
    { title: 'Apprentissage du Coran', text: 'Lecture, récitation et apprentissage des règles de lecture.' },
    { title: 'Mémorisation', text: 'Progression structurée dans la mémorisation du Saint Coran.' },
    { title: 'Révision et évaluation', text: 'Suivi régulier des acquis et accompagnement pédagogique.' },
    { title: 'Éducation et discipline', text: 'Développement des valeurs, de la discipline et du respect.' },
  ] as TextItem[],
  approach: [
    { title: 'Accueil et inscription', text: "Intégration de l'apprenant et constitution de son dossier." },
    { title: 'Évaluation du niveau', text: 'Identification de ses acquis et de ses besoins.' },
    { title: 'Apprentissage et mémorisation', text: 'Programme adapté et suivi pédagogique.' },
    { title: 'Révision et évaluation', text: 'Contrôle régulier de la progression.' },
  ] as TextItem[],
};

const filled = (items: TextItem[]) => items.filter(i => hasText(i.title));

export const teachingsOf = (c: HomeContent) => (filled(c.teachings).length ? filled(c.teachings) : DEFAULTS.teachings);
export const approachOf = (c: HomeContent) => (filled(c.approach).length ? filled(c.approach) : DEFAULTS.approach);
export const boardingOf = (c: HomeContent) => filled(c.boarding);
export const hasBoarding = (c: HomeContent) => boardingOf(c).length > 0 || hasText(c.boardingIntro);

export interface NavLink { href: string; label: string }

/** Liens de navigation : une section absente n'a pas de lien. */
export function navLinks(c: HomeContent, hasNews: boolean): NavLink[] {
  const links: NavLink[] = [
    { href: '#accueil', label: 'Accueil' },
    { href: '#daara', label: 'Notre Daara' },
    { href: '#enseignement', label: 'Enseignement' },
  ];
  if (hasBoarding(c)) links.push({ href: '#internat', label: "Vie à l'internat" });
  if (hasNews) links.push({ href: '#actualites', label: 'Actualités' });
  links.push({ href: '#contact', label: 'Contact' });
  return links;
}

/** Date lisible « 12 novembre 2026 ». */
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Aujourd'hui au format AAAA-MM-JJ (champ date : pas de visite dans le passé). */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Données structurées « école » pour le référencement (uniquement des faits renseignés). */
export function schoolJsonLd(name: string, city: string, country: string, c: HomeContent) {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'School', name,
    address: { '@type': 'PostalAddress', addressLocality: city, addressCountry: country || 'SN' },
  };
  if (hasText(c.contactPhone)) ld.telephone = c.contactPhone;
  if (hasText(c.contactEmail)) ld.email = c.contactEmail;
  if (c.latitude !== null && c.longitude !== null) ld.geo = { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude };
  const same = c.socialLinks.map(l => l.url).filter(Boolean);
  if (same.length) ld.sameAs = same;
  return ld;
}
