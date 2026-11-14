/** Portail public, contenu institutionnel et établissement. */

export interface TitledText { title: string; text: string }
export interface TeamMember { name: string; role: string }
/** Lien vers un réseau social (URL en http ou https). */
export interface SocialLink { label: string; url: string }

/** Actualité telle que publiée sur le portail public. */
export interface PublicNews { id: string; title: string; summary: string; body: string; imageUrl: string | null; publishedOn: string }
/** Image de la galerie publique. */
export interface PublicGalleryItem { id: string; imageUrl: string; caption: string }

export interface PublicEstablishment { name: string; slug: string; city: string; country: string }

export interface PublicContent {
  tagline: string;
  history: string;
  mission: string;
  vision: string;
  values: TitledText[];
  activities: TitledText[];
  team: TeamMember[];
  admissionInfo: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  // Page d'accueil enrichie : toute section vide n'est pas affichée.
  heroImageUrl?: string | null;
  heroText?: string;
  teachings?: TitledText[];
  boardingIntro?: string;
  boarding?: TitledText[];
  approach?: TitledText[];
  socialLinks?: SocialLink[];
  legalNotice?: string;
  privacyPolicy?: string;
}

/** Réponse de GET /public/site/ (liste blanche côté serveur : aucune donnée de talibé). */
export interface PublicSite {
  establishment: PublicEstablishment;
  content: PublicContent;
  news?: PublicNews[];
  gallery?: PublicGalleryItem[];
}

/** Corps de POST /public/contact/. `website` est le piège à robots : doit rester vide. */
export interface ContactPayload {
  name: string;
  phone: string;
  email: string;
  message: string;
  website: string;
}

/** Contenu éditable (GET/PATCH /site-content/). Latitude/longitude arrivent en chaîne (décimal). */
export interface SiteContent {
  tagline: string;
  history: string;
  mission: string;
  vision: string;
  values: TitledText[];
  activities: TitledText[];
  team: TeamMember[];
  admissionInfo: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  heroImageUrl: string | null;
  heroText: string;
  teachings: TitledText[];
  boardingIntro: string;
  boarding: TitledText[];
  approach: TitledText[];
  socialLinks: SocialLink[];
  legalNotice: string;
  privacyPolicy: string;
  updatedAt?: string;
}

/** Actualité (GET/POST/PATCH /news-posts/). `image` n'existe qu'en écriture (multipart). */
export interface NewsPost {
  id: string;
  title: string;
  summary: string;
  body: string;
  imageUrl: string | null;
  publishedOn: string;
  isPublished: boolean;
  createdAt?: string;
}

/** Image de la galerie (GET/POST/PATCH /gallery-images/). */
export interface GalleryImage {
  id: string;
  imageUrl: string | null;
  caption: string;
  order: number;
  isPublished: boolean;
}

/** Nature d'une demande reçue : question générale ou demande de visite. */
export type ContactKind = 'INFO' | 'VISITE';

export interface ContactRequest {
  id: string;
  kind: ContactKind;
  name: string;
  childName: string;
  /** Date souhaitée de la visite (aaaa-mm-jj), vide pour une demande d'information. */
  desiredDate: string | null;
  phone: string;
  email: string;
  message: string;
  isProcessed: boolean;
  processedAt: string | null;
  processedByName: string;
  createdAt: string;
}

/** GET/PATCH /establishment/ (le directeur seul modifie). */
export interface Establishment {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  city: string;
  country: string;
  address: string;
  phone: string;
  email: string;
}
