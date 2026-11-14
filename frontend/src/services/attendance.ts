import { http, type Page } from '../lib/api';
import { cleanParams, getPage } from './params';
import type {
  AttendanceFilters, AttendancePeriod, AttendanceRecord, AttendanceStats, BulkRecordInput, BulkResult, MonthlyReport,
} from '../types/attendance';

export interface AttendanceQuery { filters: AttendanceFilters; page: number; pageSize: number }

export const listAttendance = ({ filters, page, pageSize }: AttendanceQuery): Promise<Page<AttendanceRecord>> =>
  getPage<AttendanceRecord>('/attendance/', { ...filters, page, pageSize, ordering: '-date,student__last_name' });

/** Pointages existants d'un créneau (pré-remplissage de la saisie du jour). */
export const listSlotRecords = (classroom: string, date: string, period: AttendancePeriod) =>
  getPage<AttendanceRecord>('/attendance/', { classroom, date, period, pageSize: 500 }).then(p => p.results);

export const saveBulk = (body: { date: string; period: AttendancePeriod; classroom: string; records: BulkRecordInput[] }) =>
  http.post<BulkResult>('/attendance/bulk/', body).then(r => r.data);

export const getAttendanceStats = (month: string, classroom?: string) =>
  http.get<AttendanceStats>('/attendance/stats/', { params: cleanParams({ month, classroom }) }).then(r => r.data);

export const getMonthlyReport = (classroom: string, month: string) =>
  http.get<MonthlyReport>('/attendance/monthly-report/', { params: { classroom, month } }).then(r => r.data);
