/**
 * Formes de /lessons, /revisions, /evaluations, /memorization/timeline (voir backend/docs/api/memorization.md).
 * Les champs « internes » (observations, notes internes…) sont absents de la vue famille : ils sont optionnels ici.
 * Les décimaux (notes) arrivent en chaîne depuis DRF : `Decimalish`.
 */

export type Decimalish = string | number;

export interface QualityLevel {
  id: string;
  code: string;
  label: string;
  labelAr: string;
  rank: number;
  isActive: boolean;
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  maxScore: Decimalish;
  weight: Decimalish;
  order: number;
  isActive: boolean;
}

interface EntryBase {
  id: string;
  student: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  date: string;
  appreciation: string;
  createdAt: string;
  // vue staff seulement
  teacher?: string | null;
  teacherId?: string | null;
  isCurrent?: boolean;
  supersedes?: string | null;
  correctionReason?: string;
}

interface Quality {
  quality: string;
  qualityLabel: string;
  qualityLabelAr: string;
}

interface SurahRange {
  surah: number;
  surahNumber: number;
  surahName: string;
  surahNameArabic: string;
  ayahStart: number;
  ayahEnd: number;
}

export interface Lesson extends EntryBase, Quality, SurahRange {
  juz: number;
  hizb: number;
  page: number;
  className: string;
  classId?: string | null;
  observations?: string;
}

export interface Revision extends EntryBase, Quality, SurahRange {
  ayahRange: string;
  difficulties?: string;
  recommendations?: string;
}

export interface EvaluationScore {
  criterion: string;
  criterionName: string;
  score: Decimalish;
  maxScore: Decimalish;
}

export interface Evaluation extends EntryBase {
  scope: string;
  surahEvaluated: string;
  scores: EvaluationScore[];
  overallScore: Decimalish | null;
  internalNotes?: string;
}

export type TimelineType = 'LESSON' | 'REVISION' | 'EVALUATION';

export type TimelineEntry =
  | (Lesson & { type: 'LESSON' })
  | (Revision & { type: 'REVISION' })
  | (Evaluation & { type: 'EVALUATION' });

export interface TimelineFilters {
  /** Vide = tous les types. */
  types: TimelineType[];
  dateAfter: string;
  dateBefore: string;
  surah: string;
  teacher: string;
  includeHistory: boolean;
}

export const EMPTY_TIMELINE_FILTERS: TimelineFilters = {
  types: [], dateAfter: '', dateBefore: '', surah: '', teacher: '', includeHistory: false,
};

export const TIMELINE_TYPE_LABEL: Record<TimelineType, string> = {
  LESSON: 'Nouvelle leçon',
  REVISION: 'Révision',
  EVALUATION: 'Évaluation',
};

// ---- Valeurs des formulaires (chaînes saisies) ----
export interface RangeValues { surah: string; ayahStart: string; ayahEnd: string }

export interface LessonValues extends RangeValues {
  quality: string;
  appreciation: string;
  observations: string;
  date: string;
}

export interface RevisionValues extends RangeValues {
  quality: string;
  difficulties: string;
  recommendations: string;
  appreciation: string;
  date: string;
}

export interface EvaluationValues {
  scope: string;
  appreciation: string;
  internalNotes: string;
  date: string;
  /** Note saisie par identifiant de critère ; vide = critère non noté. */
  scores: Record<string, string>;
}
