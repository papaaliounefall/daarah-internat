import type {
  Decimalish, EvaluationCriterion, EvaluationValues, LessonValues, QualityLevel, RangeValues, RevisionValues, TimelineEntry,
} from '../../types/memorization';
import type { Evaluation, Lesson, Revision } from '../../types/memorization';

export const MIN_REASON = 3;

/** Date locale du jour au format AAAA-MM-JJ (champ <input type="date">). */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Nombre décimal saisi avec virgule ou point ; NaN si invalide. */
export function parseDecimal(v: Decimalish | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const t = v.trim().replace(',', '.');
  return t === '' || !/^-?\d+(\.\d+)?$/.test(t) ? NaN : Number(t);
}

/** « 16,5 » ; chaîne vide si la valeur est absente. */
export function formatScore(v: Decimalish | null | undefined): string {
  const n = parseDecimal(v);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** « 1 à 6 » ou « 4 ». */
export const ayahRangeLabel = (start: number, end: number) => (start === end ? `${start}` : `${start} à ${end}`);

// ---------------------------------------------------------------- plage de versets ----------

export interface RangeErrors { surah?: string; ayahStart?: string; ayahEnd?: string }

const isInt = (s: string) => /^\d+$/.test(s.trim());

/**
 * Valide une plage de versets avant l'envoi. `versesCount` = nombre de versets de la sourate (fourni par l'API,
 * null tant que la liste n'est pas chargée). Le serveur revalide de toute façon.
 */
export function validateRange(v: RangeValues, versesCount: number | null): RangeErrors {
  const errors: RangeErrors = {};
  if (!v.surah) errors.surah = 'Choisissez une sourate.';
  if (!isInt(v.ayahStart) || Number(v.ayahStart) < 1) errors.ayahStart = 'Indiquez un numéro de verset (1 au minimum).';
  if (!isInt(v.ayahEnd) || Number(v.ayahEnd) < 1) errors.ayahEnd = 'Indiquez un numéro de verset (1 au minimum).';
  if (errors.ayahStart || errors.ayahEnd || !v.surah) return errors;
  const start = Number(v.ayahStart);
  const end = Number(v.ayahEnd);
  if (end < start) errors.ayahEnd = 'Le verset de fin doit être égal ou supérieur au verset de début.';
  if (versesCount !== null) {
    if (start > versesCount) errors.ayahStart = `Cette sourate compte ${versesCount} versets.`;
    if (end > versesCount) errors.ayahEnd = `Cette sourate compte ${versesCount} versets.`;
  }
  return errors;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;

/** Après une leçon enregistrée jusqu'au verset `end`, propose le verset suivant (ou rien si la sourate est finie). */
export function nextStart(end: number, versesCount: number): number | null {
  return end < versesCount ? end + 1 : null;
}

/**
 * Suggestion de départ pour la prochaine leçon : même sourate que la dernière, verset suivant (si la sourate
 * n'est pas terminée). Aucune valeur n'est inventée : sans progression connue, tout reste vide.
 */
export function suggestStart(
  currentSurah: number | null | undefined,
  currentAyah: number | null | undefined,
  versesCountOf: (surah: number) => number | null,
): { surah: string; ayahStart: string } {
  if (!currentSurah) return { surah: '', ayahStart: '' };
  const count = versesCountOf(currentSurah);
  const next = (currentAyah ?? 0) + 1;
  return { surah: String(currentSurah), ayahStart: count !== null && next <= count ? String(next) : '' };
}

// ---------------------------------------------------------------- notes ----------------------

export interface ScoreErrors { byCriterion: Record<string, string>; global?: string }

/** Au moins un critère noté ; chaque note entre 0 et la note maximale du critère. Champ vide = critère non noté. */
export function validateScores(scores: Record<string, string>, criteria: EvaluationCriterion[]): ScoreErrors {
  const byCriterion: Record<string, string> = {};
  let noted = 0;
  for (const c of criteria) {
    const raw = (scores[c.id] ?? '').trim();
    if (raw === '') continue;
    const n = parseDecimal(raw);
    const max = parseDecimal(c.maxScore);
    if (Number.isNaN(n)) byCriterion[c.id] = 'Note invalide.';
    else if (n < 0 || n > max) byCriterion[c.id] = `La note doit être comprise entre 0 et ${formatScore(max)}.`;
    else noted += 1;
  }
  const errors: ScoreErrors = { byCriterion };
  if (noted === 0 && Object.keys(byCriterion).length === 0) errors.global = 'Notez au moins un critère.';
  return errors;
}

export const scoresValid = (e: ScoreErrors) => !e.global && Object.keys(e.byCriterion).length === 0;

// ---------------------------------------------------------------- formulaires ----------------

export const emptyLesson = (): LessonValues => ({
  surah: '', ayahStart: '', ayahEnd: '', quality: '', appreciation: '', observations: '', date: todayIso(),
});
export const emptyRevision = (): RevisionValues => ({
  surah: '', ayahStart: '', ayahEnd: '', quality: '', difficulties: '', recommendations: '', appreciation: '', date: todayIso(),
});
export const emptyEvaluation = (): EvaluationValues => ({ scope: '', appreciation: '', internalNotes: '', date: todayIso(), scores: {} });

export const lessonFromEntry = (e: Lesson): LessonValues => ({
  surah: String(e.surahNumber), ayahStart: String(e.ayahStart), ayahEnd: String(e.ayahEnd), quality: e.quality,
  appreciation: e.appreciation ?? '', observations: e.observations ?? '', date: e.date,
});
export const revisionFromEntry = (e: Revision): RevisionValues => ({
  surah: String(e.surahNumber), ayahStart: String(e.ayahStart), ayahEnd: String(e.ayahEnd), quality: e.quality,
  difficulties: e.difficulties ?? '', recommendations: e.recommendations ?? '', appreciation: e.appreciation ?? '', date: e.date,
});
export const evaluationFromEntry = (e: Evaluation): EvaluationValues => ({
  scope: e.scope ?? '', appreciation: e.appreciation ?? '', internalNotes: e.internalNotes ?? '', date: e.date,
  scores: Object.fromEntries(e.scores.map(s => [s.criterion, String(parseDecimal(s.score))])),
});

const rangeBody = (v: RangeValues) => ({ surah: Number(v.surah), ayahStart: Number(v.ayahStart), ayahEnd: Number(v.ayahEnd) });

export const lessonBody = (v: LessonValues) => ({
  ...rangeBody(v), quality: v.quality, date: v.date, appreciation: v.appreciation.trim(), observations: v.observations.trim(),
});
export const revisionBody = (v: RevisionValues) => ({
  ...rangeBody(v), quality: v.quality, date: v.date, appreciation: v.appreciation.trim(),
  difficulties: v.difficulties.trim(), recommendations: v.recommendations.trim(),
});
export function evaluationBody(v: EvaluationValues, criteria: EvaluationCriterion[]) {
  const scores = criteria
    .filter(c => (v.scores[c.id] ?? '').trim() !== '')
    .map(c => ({ criterion: c.id, score: parseDecimal(v.scores[c.id]) }));
  return { scope: v.scope.trim(), date: v.date, appreciation: v.appreciation.trim(), internalNotes: v.internalNotes.trim(), scores };
}

// ---------------------------------------------------------------- chronologie ----------------

export interface DayGroup { date: string; entries: TimelineEntry[] }

/** Regroupe par date en conservant l'ordre du serveur (date décroissante puis création décroissante). */
export function groupByDate(entries: TimelineEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else groups.push({ date: e.date, entries: [e] });
  }
  return groups;
}

/** Une entrée est « remplacée » lorsqu'une correction l'a supplantée (visible seulement avec l'historique). */
export const isSuperseded = (e: TimelineEntry) => e.isCurrent === false;

/** Libellé court de la plage ou de la portée d'une entrée de chronologie. */
export function entrySummary(e: TimelineEntry): string {
  if (e.type === 'EVALUATION') return e.scope || 'Évaluation';
  return `${e.surahName}, ${e.ayahStart === e.ayahEnd ? 'verset' : 'versets'} ${ayahRangeLabel(e.ayahStart, e.ayahEnd)}`;
}

/** Ton visuel d'un niveau de qualité selon son rang (0 = meilleur). */
export function qualityTone(code: string, levels: QualityLevel[]): 'success' | 'info' | 'warning' | 'neutral' {
  const i = levels.findIndex(l => l.code === code);
  if (i < 0 || levels.length === 0) return 'neutral';
  const ratio = levels.length === 1 ? 0 : i / (levels.length - 1);
  return ratio <= 0.25 ? 'success' : ratio <= 0.6 ? 'info' : 'warning';
}
