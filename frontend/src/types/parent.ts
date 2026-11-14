/** Espace parent : GET /dashboard/ (rôle PARENT), /finance/my-children-payments/. Clés en camelCase. */

export interface ChildLastLesson {
  date: string;
  surahNumber: number;
  surahName: string;
  ayahStart: number;
  ayahEnd: number;
  appreciation: string;
}

export interface ChildLastRevision {
  date: string;
  surahName: string;
  ayahStart: number;
  ayahEnd: number;
  appreciation: string;
}

export interface ChildLastEvaluation {
  date: string;
  overallScore: number | null;
  appreciation: string;
}

export interface ChildAttendance30 {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** Un enfant du parent : uniquement des informations destinées aux familles (jamais d'observations internes). */
export interface ParentChild {
  studentId: string;
  studentName: string;
  lastLesson: ChildLastLesson | null;
  lastRevision: ChildLastRevision | null;
  lastEvaluation: ChildLastEvaluation | null;
  attendance30Days: ChildAttendance30;
}

export interface ParentDashboard {
  role: 'PARENT';
  today: string;
  academicYear: { id: string; name: string } | null;
  children: ParentChild[];
  unreadNotifications: number;
}

export type PaymentMethod = 'ESPECES' | 'WAVE' | 'ORANGE_MONEY' | 'VIREMENT' | 'AUTRE';

export interface ParentPayment {
  id: string;
  receiptNumber: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  feeKind: string;
  periodLabel: string;
  amount: number;
  date: string;
  method: PaymentMethod | string;
  status: 'PAYE' | 'ANNULE' | string;
}
