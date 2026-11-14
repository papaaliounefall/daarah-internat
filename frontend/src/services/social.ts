import { http } from '../lib/api';
import { toFormData } from '../lib/case';
import { cleanParams, getAll, getPage } from './params';
import type { PaymentMethod } from '../types/finance';
import type { Donation, SocialOverview, Sponsor, SponsorKind, Sponsorship, SponsorshipStatus } from '../types/social';

export interface OverviewQuery { page: number; pageSize: number; status?: string; sponsored?: string; search?: string; includeArchived?: boolean }
export const getOverview = (q: OverviewQuery) =>
  http.get<SocialOverview>('/social/overview/', {
    params: cleanParams({ ...q, includeArchived: q.includeArchived ? 'true' : undefined }),
  }).then(r => r.data);

/* --- Parrains --- */
export interface SponsorQuery { page?: number; pageSize?: number; search?: string; kind?: string }
export const listSponsors = (q: SponsorQuery) => getPage<Sponsor>('/social/sponsors/', { ordering: 'name', ...q });
export const listAllSponsors = () => getAll<Sponsor>('/social/sponsors/', { ordering: 'name' });

export interface SponsorInput { name: string; kind: SponsorKind; phone: string; email: string; country: string; notes: string }
export const saveSponsor = (id: string | null, input: SponsorInput) =>
  (id ? http.patch<Sponsor>(`/social/sponsors/${id}/`, input) : http.post<Sponsor>('/social/sponsors/', input)).then(r => r.data);

/* --- Parrainages --- */
export interface SponsorshipQuery { page?: number; pageSize?: number; search?: string; status?: string; sponsor?: string }
export const listSponsorships = (q: SponsorshipQuery) => getPage<Sponsorship>('/social/sponsorships/', q);

export interface SponsorshipInput {
  student?: string; sponsor?: string; monthlyAmount: number; startDate?: string; endDate?: string | null; status?: SponsorshipStatus; notes: string;
}
export const saveSponsorship = (id: string | null, input: SponsorshipInput) =>
  (id ? http.patch<Sponsorship>(`/social/sponsorships/${id}/`, input) : http.post<Sponsorship>('/social/sponsorships/', input)).then(r => r.data);

/* --- Dons --- */
export interface DonationQuery { page?: number; pageSize?: number; search?: string; method?: string; isCancelled?: string; dateFrom?: string; dateTo?: string }
export const listDonations = (q: DonationQuery) => getPage<Donation>('/social/donations/', { ordering: '-date,-created_at', ...q });

export interface DonationInput {
  donorName: string; donorPhone: string; sponsor?: string; amount: number; date: string; purpose: string; method: PaymentMethod;
}
export const createDonation = (input: DonationInput, attachment: File | null) => {
  const clean = cleanParams(input as unknown as Record<string, unknown>);
  const body = attachment ? toFormData({ ...clean, attachment }) : clean;
  return http.post<Donation>('/social/donations/', body).then(r => r.data);
};
export const cancelDonation = (id: string, reason: string) =>
  http.post<Donation>(`/social/donations/${id}/cancel/`, { reason }).then(r => r.data);
