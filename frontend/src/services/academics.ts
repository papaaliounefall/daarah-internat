import { http, listAll, type Page } from '../lib/api';
import type { AcademicYear, ClassRoom, Enrollment, Student } from '../types';

export const listYears = () => listAll<AcademicYear>('/academic-years/', { ordering: '-start_date' });

export const currentYearOf = (years: AcademicYear[]) => years.find(y => y.isCurrent);

export const listClasses = (academicYear?: string) =>
  listAll<ClassRoom>('/classes/', academicYear ? { academicYear, ordering: 'name' } : { ordering: 'name' });

export interface ClassInput { name: string; level: string; academicYear: string; teacher: string | null; roomNumber: string; capacity: number }

export const saveClass = (id: string | null, input: ClassInput) =>
  (id ? http.patch<ClassRoom>(`/classes/${id}/`, input) : http.post<ClassRoom>('/classes/', input)).then(r => r.data);

export const listClassStudents = (id: string) => http.get<Student[]>(`/classes/${id}/students/`).then(r => r.data);

export const listEnrollments = (params: Record<string, unknown>) =>
  http.get<Page<Enrollment> | Enrollment[]>('/enrollments/', { params: { pageSize: 200, ...params } })
    .then(r => (Array.isArray(r.data) ? r.data : r.data.results));

export const changeClass = (enrollmentId: string, classroom: string, reason: string) =>
  http.post<Enrollment>(`/enrollments/${enrollmentId}/change-class/`, { classroom, reason }).then(r => r.data);

export interface YearInput { name: string; startDate: string; endDate: string }

export const createYear = (input: YearInput) => http.post<AcademicYear>('/academic-years/', input).then(r => r.data);
export const activateYear = (id: string) => http.post<AcademicYear>(`/academic-years/${id}/activate/`).then(r => r.data);
export const closeYear = (id: string) => http.post<AcademicYear>(`/academic-years/${id}/close/`).then(r => r.data);

export interface ReenrollResult { enrolled: string[]; skipped: { student: string; error: unknown }[] }

export const reenroll = (academicYear: string, students: string[], classroom: string | null) =>
  http.post<ReenrollResult>('/enrollments/reenroll/', { academicYear, students, classroom }).then(r => r.data);

export const enrollStudent = (student: string, academicYear: string, classroom: string | null) =>
  http.post<Enrollment>('/enrollments/', { student, academicYear, classroom }).then(r => r.data);
