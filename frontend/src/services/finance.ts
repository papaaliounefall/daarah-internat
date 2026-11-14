import { http } from '../lib/api';
import { toFormData } from '../lib/case';
import { cleanParams, getAll, getPage } from './params';
import type {
  ArrearsReport, Due, Expense, ExpenseCategory, FeeKind, FeeSchedule, FinanceSummary, GenerateDuesResult,
  Payment, PaymentMethod, StudentDiscount, DiscountKind, AppliesTo,
} from '../types/finance';

/* --- Synthèse --- */
export const getSummary = (from: string, to: string) =>
  http.get<FinanceSummary>('/finance/summary/', { params: { from, to } }).then(r => r.data);

/* --- Grille de frais --- */
export const listFees = (academicYear?: string) => getAll<FeeSchedule>('/finance/fees/', { academicYear });

export interface FeeInput { academicYear: string; name: string; kind: FeeKind; amount: number; appliesTo: AppliesTo; dueDay: number | null; isActive: boolean }
export const saveFee = (id: string | null, input: Partial<FeeInput>) =>
  (id ? http.patch<FeeSchedule>(`/finance/fees/${id}/`, input) : http.post<FeeSchedule>('/finance/fees/', input)).then(r => r.data);

/* --- Réductions --- */
export const listDiscounts = (academicYear?: string) => getAll<StudentDiscount>('/finance/discounts/', { academicYear });

export interface DiscountInput { student: string; academicYear: string; label: string; kind: DiscountKind; value: number; reason: string }
export const createDiscount = (input: DiscountInput) => http.post<StudentDiscount>('/finance/discounts/', input).then(r => r.data);
export const setDiscountActive = (id: string, isActive: boolean) =>
  http.patch<StudentDiscount>(`/finance/discounts/${id}/`, { isActive }).then(r => r.data);

/* --- Échéances --- */
export interface DueQuery {
  page?: number; pageSize?: number; student?: string; academicYear?: string; status?: string; overdue?: string;
  search?: string; isCancelled?: string;
}
export const listDues = (q: DueQuery) => getPage<Due>('/finance/dues/', { ordering: 'due_date', ...q });
export const listStudentDues = (student: string) =>
  getAll<Due>('/finance/dues/', { student, isCancelled: 'false', ordering: 'due_date' });

export interface DueInput { student: string; academicYear: string; kind: FeeKind; label: string; dueDate: string; amount: number }
export const createDue = (input: DueInput) => http.post<Due>('/finance/dues/', input).then(r => r.data);
export const cancelDue = (id: string, reason: string) => http.post<Due>(`/finance/dues/${id}/cancel/`, { reason }).then(r => r.data);

export interface GenerateInput { academicYear?: string; fromMonth?: string; toMonth?: string }
export const generateDues = (input: GenerateInput) =>
  http.post<GenerateDuesResult>('/finance/dues/generate/', cleanParams(input as Record<string, unknown>)).then(r => r.data);

export interface ArrearsQuery { academicYear?: string; overdueOnly?: boolean; minBalance?: number; student?: string }
export const getArrears = (q: ArrearsQuery) =>
  http.get<ArrearsReport>('/finance/arrears/', {
    params: cleanParams({ academicYear: q.academicYear, overdueOnly: q.overdueOnly === undefined ? undefined : String(q.overdueOnly), minBalance: q.minBalance, student: q.student }),
  }).then(r => r.data);

/* --- Paiements --- */
export interface PaymentQuery { page?: number; pageSize?: number; search?: string; status?: string; method?: string; dateFrom?: string; dateTo?: string }
export const listPayments = (q: PaymentQuery) => getPage<Payment>('/payments/', { ordering: '-date,-created_at', ...q });

export interface PaymentInput {
  student?: string; due?: string; amount: number; method: PaymentMethod; date: string; reference?: string; notes?: string;
  feeKind?: FeeKind; periodLabel?: string;
}
export const createPayment = (input: PaymentInput) => http.post<Payment>('/payments/', cleanParams(input as unknown as Record<string, unknown>)).then(r => r.data);
export const cancelPayment = (id: string, reason: string) => http.post<Payment>(`/payments/${id}/cancel/`, { reason }).then(r => r.data);

/* --- Dépenses --- */
export interface ExpenseQuery { page?: number; pageSize?: number; search?: string; category?: string; status?: string; dateFrom?: string; dateTo?: string }
export const listExpenses = (q: ExpenseQuery) => getPage<Expense>('/expenses/', { ordering: '-date,-created_at', ...q });

export interface ExpenseInput { category: ExpenseCategory; title: string; amount?: number; date?: string; paidTo: string; reference: string }
export const saveExpense = (id: string | null, input: ExpenseInput, attachment: File | null) => {
  const body = attachment ? toFormData({ ...input, attachment }) : input;
  return (id ? http.patch<Expense>(`/expenses/${id}/`, body) : http.post<Expense>('/expenses/', body)).then(r => r.data);
};
export const approveExpense = (id: string, note: string) => http.post<Expense>(`/expenses/${id}/approve/`, { note }).then(r => r.data);
export const rejectExpense = (id: string, reason: string) => http.post<Expense>(`/expenses/${id}/reject/`, { reason }).then(r => r.data);
export const cancelExpense = (id: string, reason: string) => http.post<Expense>(`/expenses/${id}/cancel/`, { reason }).then(r => r.data);
