/** Finances : montants en FCFA (entiers), identifiants UUID, clés en camelCase (conversion automatique). */

export type FeeKind = 'INSCRIPTION' | 'MENSUALITE' | 'EXCEPTIONNEL';
export type AppliesTo = 'TOUS' | 'PAYANT' | 'SOCIAL';
export type PaymentMethod = 'ESPECES' | 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT' | 'AUTRE';
export type PaymentStatus = 'PAYE' | 'ANNULE';
export type DueStatus = 'IMPAYEE' | 'PARTIELLE' | 'PAYEE' | 'ANNULEE';
export type DiscountKind = 'MONTANT' | 'POURCENT';
export type ExpenseCategory = 'ALIMENTATION' | 'SANTE' | 'ENTRETIEN' | 'SALAIRES' | 'ENERGIE' | 'FOURNITURES' | 'AUTRE';
export type ExpenseStatus = 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE' | 'ANNULEE';

export const FEE_KIND_LABEL: Record<FeeKind, string> = {
  INSCRIPTION: "Frais d'inscription",
  MENSUALITE: 'Mensualité',
  EXCEPTIONNEL: 'Frais exceptionnel',
};
export const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  TOUS: 'Tous les talibés',
  PAYANT: 'Talibés payants',
  SOCIAL: 'Talibés sociaux',
};
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  ESPECES: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  VIREMENT: 'Virement bancaire',
  AUTRE: 'Autre',
};
export const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  IMPAYEE: 'Impayée',
  PARTIELLE: 'Partielle',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ALIMENTATION: 'Alimentation',
  SANTE: 'Santé',
  ENTRETIEN: 'Entretien',
  SALAIRES: 'Salaires',
  ENERGIE: 'Énergie / eau',
  FOURNITURES: 'Fournitures',
  AUTRE: 'Autre',
};
export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  EN_ATTENTE: 'En attente de validation',
  VALIDEE: 'Validée',
  REFUSEE: 'Refusée',
  ANNULEE: 'Annulée',
};

export interface FeeSchedule {
  id: string;
  academicYear: string;
  academicYearName: string;
  name: string;
  kind: FeeKind;
  amount: number;
  appliesTo: AppliesTo;
  dueDay: number | null;
  isActive: boolean;
}

export interface StudentDiscount {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  academicYear: string;
  label: string;
  kind: DiscountKind;
  value: number;
  reason: string;
  approvedByName: string;
  isActive: boolean;
}

export interface Due {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  academicYear: string;
  feeSchedule: string | null;
  kind: FeeKind;
  label: string;
  period: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: DueStatus;
  isOverdue: boolean;
  isCancelled: boolean;
}

export interface GenerateDuesResult {
  academicYear: string;
  created: number;
  alreadyExisting: number;
  zeroAmountSkipped: number;
  students: number;
  schedules: number;
  /** Mois couverts (« AAAA-MM »). */
  months: string[];
}

export interface ArrearsRow {
  student: string;
  studentName: string;
  registrationNumber: string;
  studentStatus: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  overdueCount: number;
  oldestDueDate: string | null;
  dues?: Due[];
}

export interface ArrearsReport {
  count: number;
  totalBalance: number;
  academicYear: string | null;
  results: ArrearsRow[];
}

export interface Payment {
  id: string;
  receiptNumber: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  due: string | null;
  feeKind: FeeKind;
  periodLabel: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  status: PaymentStatus;
  recordedByName: string;
  notes: string;
  cancelledByName: string;
  cancelledAt: string | null;
  cancelReason: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  paidTo: string;
  reference: string;
  attachmentUrl: string | null;
  status: ExpenseStatus;
  requiresApproval: boolean;
  createdByName: string;
  approvedByName: string;
  decidedAt: string | null;
  decisionNote: string;
  cancelReason: string;
  cancelledByName: string;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BreakdownRow { key: string; label: string; amount: number; count: number }
export interface MonthlyRow { month: string; payments: number; donations: number; revenue: number; expenses: number; balance: number }

export interface FinanceSummary {
  from: string;
  to: string;
  totalPayments: number;
  totalDonations: number;
  totalRevenue: number;
  totalExpenses: number;
  balance: number;
  outstanding: number;
  outstandingDuesCount: number;
  studentsInArrears: number;
  pendingExpensesCount: number;
  pendingExpensesAmount: number;
  revenueByType: BreakdownRow[];
  revenueByMethod: BreakdownRow[];
  monthly: MonthlyRow[];
}
