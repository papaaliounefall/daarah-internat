/** Social, parrainages et dons. */
import type { PaymentMethod } from './finance';
import type { StudentStatus } from './index';

export type SponsorKind = 'PARRAIN' | 'PARTENAIRE' | 'DONATEUR';
export type SponsorshipStatus = 'ACTIF' | 'SUSPENDU' | 'TERMINE';

export const SPONSOR_KIND_LABEL: Record<SponsorKind, string> = {
  PARRAIN: 'Parrain',
  PARTENAIRE: 'Partenaire',
  DONATEUR: 'Donateur',
};
export const SPONSORSHIP_STATUS_LABEL: Record<SponsorshipStatus, string> = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
  TERMINE: 'Terminé',
};

export interface Sponsor {
  id: string;
  name: string;
  kind: SponsorKind;
  phone: string;
  email: string;
  country: string;
  notes: string;
  activeSponsorships: number;
  createdAt: string;
}

export interface Sponsorship {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  studentStatus: StudentStatus;
  sponsor: string;
  sponsorName: string;
  sponsorPhone: string;
  sponsorEmail: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
  status: SponsorshipStatus;
  notes: string;
  createdAt: string;
}

export interface Donation {
  id: string;
  receiptNumber: string;
  sponsor: string | null;
  sponsorName: string;
  donorName: string;
  donorPhone: string;
  amount: number;
  date: string;
  purpose: string;
  method: PaymentMethod;
  attachmentUrl: string | null;
  recordedByName: string;
  isCancelled: boolean;
  cancelReason: string;
  cancelledByName: string;
  cancelledAt: string | null;
  createdAt: string;
}

export interface OverviewSponsor {
  sponsorshipId: string;
  sponsorId: string;
  sponsorName: string;
  monthlyAmount: number;
  startDate: string;
}

export interface OverviewStatusChange {
  fromStatus: StudentStatus;
  toStatus: StudentStatus;
  reason: string;
  effectiveDate: string;
  changedByName: string;
}

export interface OverviewStudent {
  id: string;
  registrationNumber: string;
  fullName: string;
  status: StudentStatus;
  sponsors: OverviewSponsor[];
  statusChanges: OverviewStatusChange[];
}

export interface OverviewSummary {
  socialCount: number;
  payingCount: number;
  sponsoredSocialCount: number;
  socialWithoutSponsorCount: number;
  activeSponsorships: number;
  totalMonthlySponsorship: number;
}

export interface SocialOverview {
  count: number;
  next: string | null;
  previous: string | null;
  summary: OverviewSummary;
  results: OverviewStudent[];
}
