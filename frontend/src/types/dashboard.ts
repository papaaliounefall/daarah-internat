/** Forme de GET /dashboard/ (voir backend/apps/dashboard/views.py). Clés en camelCase. */
import type { Role } from './index';

export interface AttendanceToday {
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number | null;
}

export interface ClassCount {
  classId: string;
  className: string;
  count: number;
  capacity: number;
  teacherName: string;
}

export interface FinanceBlock {
  monthRevenue: number;
  monthExpenses: number;
  monthBalance: number;
  arrearsTotal: number;
  pendingExpenses: number;
}

export interface DashboardBase {
  role: Role;
  today: string;
  academicYear: { id: string; name: string } | null;
}

export interface DirectorDashboard extends DashboardBase {
  studentsTotal: number;
  studentsByStatus: { PAYANT: number; SOCIAL: number };
  classes: ClassCount[];
  teachersCount: number;
  attendanceToday: AttendanceToday;
  enrollmentEvolution: { year: string; count: number }[];
  boarding: { capacity: number; occupied: number };
  visitsPending: number;
  alerts: { lowStockItems: number; incompleteFiles: number; pendingExpenses?: number; overdueAmount?: number };
  finance?: FinanceBlock;
}

export interface AssistantDashboard extends DashboardBase {
  recentEnrollments: { id: string; studentId: string; studentName: string; kind: string; className: string; enrolledOn: string }[];
  renewalsCount: number;
  incompleteFiles: { studentId: string; studentName: string; registrationNumber: string; missing: string[] }[];
  incompleteFilesCount: number;
  classes: ClassCount[];
  cardsToGenerate: number;
  visitsPending: number;
  finance?: FinanceBlock;
}

export interface TeacherDashboard extends DashboardBase {
  classes: ClassCount[];
  studentsCount: number;
  recentLessons: { id: string; studentId: string; studentName: string; date: string; surahNumber: number; surahName: string; ayahStart: number; ayahEnd: number; quality: string }[];
  recentRevisions: { id: string; studentId: string; studentName: string; date: string; surahName: string; ayahStart: number; ayahEnd: number; quality: string }[];
  toEvaluate: { studentId: string; studentName: string }[];
  toEvaluateCount: number;
  attendanceToday: AttendanceToday;
}

export type Dashboard = DirectorDashboard | AssistantDashboard | TeacherDashboard;
