import { http, type Page } from '../lib/api';
import { cleanParams, getAll, getPage } from './params';
import { currentYearOf, listClasses, listYears } from './academics';
import type { ClassRoom } from '../types';
import type {
  Evaluation, EvaluationCriterion, Lesson, QualityLevel, Revision, TimelineEntry, TimelineFilters,
} from '../types/memorization';

export type EntryKind = 'LESSON' | 'REVISION' | 'EVALUATION';

const BASE: Record<EntryKind, string> = { LESSON: '/lessons/', REVISION: '/revisions/', EVALUATION: '/evaluations/' };

/** Niveaux de qualité actifs, du meilleur au plus faible. */
export const listQualityLevels = () =>
  getAll<QualityLevel>('/quality-levels/', { ordering: 'rank' })
    .then(rows => rows.filter(q => q.isActive).sort((a, b) => a.rank - b.rank));

/** Critères d'évaluation actifs, dans l'ordre configuré. */
export const listCriteria = () =>
  getAll<EvaluationCriterion>('/evaluation-criteria/', { ordering: 'order' })
    .then(rows => rows.filter(c => c.isActive).sort((a, b) => a.order - b.order));

export const createLesson = (body: Record<string, unknown>) => http.post<Lesson>(BASE.LESSON, body).then(r => r.data);
export const createRevision = (body: Record<string, unknown>) => http.post<Revision>(BASE.REVISION, body).then(r => r.data);
export const createEvaluation = (body: Record<string, unknown>) => http.post<Evaluation>(BASE.EVALUATION, body).then(r => r.data);

/** Correction : crée une nouvelle ligne, l'ancienne est conservée (jamais d'écrasement). Motif obligatoire. */
export const correctEntry = (kind: EntryKind, id: string, body: Record<string, unknown>) =>
  http.post(`${BASE[kind]}${id}/correct/`, body).then(r => r.data as Lesson | Revision | Evaluation);

export interface TimelineQuery { studentId: string; filters: TimelineFilters; page: number; pageSize: number }

export function timelineParams({ studentId, filters, page, pageSize }: TimelineQuery): Record<string, unknown> {
  return cleanParams({
    student: studentId,
    type: filters.types.length ? filters.types.join(',') : '',
    dateAfter: filters.dateAfter,
    dateBefore: filters.dateBefore,
    surah: filters.surah,
    teacher: filters.teacher,
    includeHistory: filters.includeHistory ? 'true' : '',
    page,
    pageSize,
  });
}

export const getTimeline = (q: TimelineQuery): Promise<Page<TimelineEntry>> =>
  getPage<TimelineEntry>('/memorization/timeline/', timelineParams(q));

/** Classes de l'année en cours (périmètre appliqué par le serveur : un maître ne reçoit que les siennes). */
export async function listWorkingClasses(): Promise<ClassRoom[]> {
  const years = await listYears();
  const current = currentYearOf(years);
  return listClasses(current?.id);
}
