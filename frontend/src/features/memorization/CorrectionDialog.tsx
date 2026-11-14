import React, { useState } from 'react';
import { Button, Modal, TextAreaField, useToast } from '../../components/ui';
import { isValidReason, plainErrorMessage } from '../../lib/apiErrors';
import { correctEntry } from '../../services/memorization';
import type { EvaluationCriterion, EvaluationValues, LessonValues, RevisionValues, TimelineEntry } from '../../types/memorization';
import { EvaluationFields } from './EvaluationForm';
import { LessonFields } from './LessonForm';
import { RevisionFields } from './RevisionForm';
import type { ReferenceData } from './useReferenceData';
import {
  evaluationBody, evaluationFromEntry, hasErrors, lessonBody, lessonFromEntry, revisionBody, revisionFromEntry, scoresValid,
  validateRange, validateScores,
} from './memorizationUtils';

interface Props {
  entry: TimelineEntry;
  reference: ReferenceData;
  onClose: () => void;
  onDone: () => void;
}

const TITLE = { LESSON: 'Corriger la leçon', REVISION: 'Corriger la révision', EVALUATION: "Corriger l'évaluation" } as const;

/**
 * Correction d'une entrée : le serveur crée une nouvelle version, l'ancienne est conservée (jamais d'écrasement).
 * Le motif est obligatoire.
 */
export const CorrectionDialog: React.FC<Props> = ({ entry, reference, onClose, onDone }) => {
  const toast = useToast();
  const [lesson, setLesson] = useState<LessonValues | null>(entry.type === 'LESSON' ? lessonFromEntry(entry) : null);
  const [revision, setRevision] = useState<RevisionValues | null>(entry.type === 'REVISION' ? revisionFromEntry(entry) : null);
  const [evaluation, setEvaluation] = useState<EvaluationValues | null>(entry.type === 'EVALUATION' ? evaluationFromEntry(entry) : null);
  const [reason, setReason] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Critères proposés : les critères actifs + ceux déjà notés sur cette version (même désactivés depuis).
  const criteria = React.useMemo<EvaluationCriterion[]>(() => {
    if (entry.type !== 'EVALUATION') return reference.criteria;
    const known = new Set(reference.criteria.map(c => c.id));
    const extra = entry.scores
      .filter(sc => !known.has(sc.criterion))
      .map((sc, i) => ({ id: sc.criterion, name: sc.criterionName, maxScore: sc.maxScore, weight: 1, order: 1000 + i, isActive: false }));
    return [...reference.criteria, ...extra];
  }, [entry, reference.criteria]);
  const initialScores = React.useMemo(() => (entry.type === 'EVALUATION' ? evaluationFromEntry(entry).scores : {}), [entry]);

  const versesOf = (surah: string) => reference.surahs.find(s => String(s.number) === surah)?.versesCount ?? null;

  const validate = (): boolean => {
    if (!isValidReason(reason)) return false;
    if (lesson) return !hasErrors(validateRange(lesson, versesOf(lesson.surah))) && !!lesson.quality && !!lesson.date;
    if (revision) return !hasErrors(validateRange(revision, versesOf(revision.surah))) && !!revision.quality && !!revision.date;
    if (evaluation) return scoresValid(validateScores(evaluation.scores, criteria)) && !!evaluation.date;
    return false;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      let base: Record<string, unknown>;
      if (lesson) base = lessonBody(lesson);
      else if (revision) base = revisionBody(revision);
      else {
        base = evaluationBody(evaluation!, criteria);
        // Notes inchangées : on ne renvoie pas `scores`, le serveur les recopie telles quelles sur la nouvelle version.
        const unchanged = criteria.every(c => (evaluation!.scores[c.id] ?? '').trim() === (initialScores[c.id] ?? '').trim());
        if (unchanged) delete base.scores;
      }
      await correctEntry(entry.type, entry.id, { ...base, correctionReason: reason.trim() });
      toast.success('Correction enregistrée. La version précédente reste consultable dans l\'historique.');
      onDone();
      onClose();
    } catch (err) {
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={TITLE[entry.type]}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="correction-form" loading={busy}>Enregistrer la correction</Button>
        </>
      }
    >
      <form id="correction-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          La saisie d'origine n'est jamais effacée : la correction crée une nouvelle version, et l'ancienne reste visible dans l'historique.
        </p>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {lesson && <LessonFields values={lesson} onChange={p => setLesson(v => ({ ...v!, ...p }))} reference={reference} showErrors={show} />}
        {revision && <RevisionFields values={revision} onChange={p => setRevision(v => ({ ...v!, ...p }))} reference={reference} showErrors={show} />}
        {evaluation && <EvaluationFields values={evaluation} onChange={p => setEvaluation(v => ({ ...v!, ...p }))} criteria={criteria} showErrors={show} />}
        <TextAreaField
          label="Motif de la correction" required rows={2} maxLength={255} value={reason} onChange={e => setReason(e.target.value)}
          hint="Au moins 3 caractères. Conservé avec la nouvelle version."
          error={show && !isValidReason(reason) ? 'Indiquez le motif de la correction.' : undefined}
        />
      </form>
    </Modal>
  );
};
