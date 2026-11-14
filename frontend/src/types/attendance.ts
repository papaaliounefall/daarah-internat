/** Formes de /attendance/* (voir backend/docs/api/attendance.md). Clés en camelCase. */

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'RETARD' | 'EXCUSE';
export type AttendancePeriod = 'MATIN' | 'SOIR';

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  RETARD: 'En retard',
  EXCUSE: 'Excusé',
};

export const PERIOD_LABEL: Record<AttendancePeriod, string> = { MATIN: 'Matin', SOIR: 'Soir' };

export interface AttendanceRecord {
  id: string;
  student: string;
  studentId: string;
  studentName: string;
  registrationNumber: string;
  classroom: string | null;
  classId: string | null;
  className: string;
  date: string;
  period: AttendancePeriod;
  status: AttendanceStatus;
  reason: string;
  recordedBy: string | null;
  recordedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface BulkRecordInput {
  student: string;
  status: AttendanceStatus;
  reason?: string;
}

export interface BulkResult {
  created: number;
  updated: number;
  unchanged: number;
  records: AttendanceRecord[];
}

export interface DayStat {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total?: number;
  attendanceRate: number | null;
}

export interface ClassStat {
  classroom: string;
  className: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number | null;
}

export interface AttendanceStats {
  month: string;
  classroom: string | null;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number | null;
  byDay: DayStat[];
  byClassroom?: ClassStat[];
}

export interface MonthlyStudentRow {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  attendanceRate: number | null;
}

export interface MonthlyReport {
  classroom: string;
  className: string;
  month: string;
  daysRecorded: number;
  students: MonthlyStudentRow[];
  totals: {
    present: number; absent: number; late: number; excused: number; total: number; attendanceRate: number | null;
  };
}

export interface AttendanceFilters {
  date: string;
  dateAfter: string;
  dateBefore: string;
  classroom: string;
  status: AttendanceStatus | '';
  period: AttendancePeriod | '';
  search: string;
}

export const EMPTY_ATTENDANCE_FILTERS: AttendanceFilters = {
  date: '', dateAfter: '', dateBefore: '', classroom: '', status: '', period: '', search: '',
};
