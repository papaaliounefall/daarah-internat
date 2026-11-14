import { http } from '../../lib/api';

export interface TextItem { title: string; text: string }

export interface HomeContent {
  tagline: string;
  heroText: string;
  heroImageUrl: string | null;
  history: string;
  mission: string;
  vision: string;
  values: TextItem[];
  activities: TextItem[];
  team: { name: string; role: string }[];
  teachings: TextItem[];
  boardingIntro: string;
  boarding: TextItem[];
  approach: TextItem[];
  socialLinks: { label: string; url: string }[];
  legalNotice: string;
  privacyPolicy: string;
  admissionInfo: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NewsItem { id: string; title: string; summary: string; body: string; imageUrl: string | null; publishedOn: string }
export interface GalleryItem { id: string; imageUrl: string | null; caption: string }

export interface HomeData {
  establishment: { name: string; slug: string; city: string; country: string };
  content: HomeContent;
  news: NewsItem[];
  gallery: GalleryItem[];
}

export const getHome = () => http.get<HomeData>('/public/site/').then(r => r.data);

export interface VisitPayload {
  name: string; phone: string; childName: string; desiredDate: string; message: string; website: string;
}

export const sendVisit = (body: VisitPayload) =>
  http.post<{ detail: string }>('/public/visit-request/', body).then(r => r.data);
