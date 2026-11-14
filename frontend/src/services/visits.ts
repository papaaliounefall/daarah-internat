import { http, type Page } from '../lib/api';
import { getPage } from './params';
import type { VisitCreateInput, VisitFilters, VisitRequest } from '../types/visits';

const BASE = '/visit-requests/';

export const listVisits = (filters: Partial<VisitFilters>, page = 1, pageSize = 50): Promise<Page<VisitRequest>> =>
  getPage<VisitRequest>(BASE, { ...filters, page, pageSize, ordering: '-requested_date,-requested_time' });

export const createVisit = (input: VisitCreateInput) => http.post<VisitRequest>(BASE, input).then(r => r.data);

const act = (id: string, action: string, body?: Record<string, unknown>) =>
  http.post<VisitRequest>(`${BASE}${id}/${action}/`, body).then(r => r.data);

// Administration (directeur, assistant)
export const acceptVisit = (id: string, note?: string) => act(id, 'accept', note ? { reason: note } : {});
export const refuseVisit = (id: string, reason: string) => act(id, 'refuse', { reason });
export const proposeVisit = (id: string, proposedDate: string, proposedTime: string, reason?: string) =>
  act(id, 'propose', { proposedDate, proposedTime, ...(reason ? { reason } : {}) });

// Parent
export const cancelVisit = (id: string) => act(id, 'cancel');
export const acceptProposal = (id: string) => act(id, 'accept-proposal');
export const declineProposal = (id: string) => act(id, 'decline-proposal');
