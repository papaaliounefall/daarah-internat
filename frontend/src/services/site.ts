import { http, listAll, type Page } from '../lib/api';
import { toFormData } from '../lib/case';
import type {
  ContactPayload, ContactRequest, Establishment, GalleryImage, NewsPost, PublicSite, SiteContent,
} from '../types/site';

// --- Public (sans connexion) -------------------------------------------------------------------
export const getPublicSite = () => http.get<PublicSite>('/public/site/').then(r => r.data);

export const sendContact = (body: ContactPayload) =>
  http.post<{ detail: string }>('/public/contact/', body).then(r => r.data);

// --- Administration (directeur) ----------------------------------------------------------------
export const getSiteContent = () => http.get<SiteContent>('/site-content/').then(r => r.data);

export const saveSiteContent = (body: Partial<SiteContent>) =>
  http.patch<SiteContent>('/site-content/', body).then(r => r.data);

/** Photo d'accueil (directeur) : multipart, champ `image`. Renvoie le contenu à jour. */
export const uploadHeroImage = (image: File) =>
  http.post<SiteContent>('/site-content/hero-image/', toFormData({ image })).then(r => r.data);

export const removeHeroImage = () => http.delete<SiteContent>('/site-content/hero-image/').then(r => r.data);

// --- Actualités (directeur et assistant) -------------------------------------------------------
export interface NewsInput {
  title: string;
  summary: string;
  body: string;
  publishedOn: string;
  isPublished: boolean;
  /** Nouveau fichier ; `null` retire l'image existante ; `undefined` la conserve. */
  image?: File | null;
}

const newsBody = (b: NewsInput) =>
  toFormData({
    title: b.title, summary: b.summary, body: b.body, publishedOn: b.publishedOn, isPublished: b.isPublished,
    image: b.image === null ? '' : b.image,
  });

export const listNews = (q: { page: number; pageSize: number; search?: string }) =>
  http.get<Page<NewsPost>>('/news-posts/', { params: { page: q.page, pageSize: q.pageSize, ...(q.search?.trim() ? { search: q.search.trim() } : {}) } }).then(r => r.data);

export const createNews = (b: NewsInput) => http.post<NewsPost>('/news-posts/', newsBody(b)).then(r => r.data);
export const updateNews = (id: string, b: NewsInput) => http.patch<NewsPost>(`/news-posts/${id}/`, newsBody(b)).then(r => r.data);
export const deleteNews = (id: string) => http.delete(`/news-posts/${id}/`).then(() => undefined);

// --- Galerie (directeur et assistant) ----------------------------------------------------------
export const listGallery = () => listAll<GalleryImage>('/gallery-images/');

export const addGalleryImage = (b: { image: File; caption: string; order: number; isPublished: boolean }) =>
  http.post<GalleryImage>('/gallery-images/', toFormData(b)).then(r => r.data);

export const updateGalleryImage = (id: string, b: Partial<Pick<GalleryImage, 'caption' | 'order' | 'isPublished'>>) =>
  http.patch<GalleryImage>(`/gallery-images/${id}/`, b).then(r => r.data);

export const deleteGalleryImage = (id: string) => http.delete(`/gallery-images/${id}/`).then(() => undefined);

export interface ContactQuery {
  page: number;
  pageSize: number;
  /** true : traitées ; false : à traiter ; absent : toutes. */
  processed?: boolean;
  search?: string;
}

export const listContactRequests = (q: ContactQuery) => {
  const params: Record<string, unknown> = { page: q.page, pageSize: q.pageSize };
  if (q.processed !== undefined) params.isProcessed = q.processed;
  if (q.search?.trim()) params.search = q.search.trim();
  return http.get<Page<ContactRequest>>('/contact-requests/', { params }).then(r => r.data);
};

export const markContactProcessed = (id: string, processed: boolean) =>
  http.post<ContactRequest>(`/contact-requests/${id}/mark-processed/`, { processed }).then(r => r.data);

// --- Établissement -----------------------------------------------------------------------------
export const getEstablishment = () => http.get<Establishment>('/establishment/').then(r => r.data);

export const saveEstablishment = (body: Partial<Pick<Establishment, 'name' | 'nameAr' | 'address' | 'phone' | 'email' | 'city'>>) =>
  http.patch<Establishment>('/establishment/', body).then(r => r.data);
