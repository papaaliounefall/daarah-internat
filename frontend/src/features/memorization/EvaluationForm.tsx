import React, { useEffect, useState } from 'react';
import { Button, Field, TextAreaField, TextField, useToast } from '../../components/ui';
import { plainErrorMessage } from '../../lib/apiErrors';
import { createEvaluation } from '../../services/memorization';
import type { Evaluation, EvaluationCriterion, EvaluationValues } from '../../types/memorization';
import { emptyEvaluation, evaluationBody, formatScore, parseDecimal, scoresValid, todayIso, validateScores } from './memorizationUtils';

/** Champs d'une évaluation : une note par critère configuré (champ vide = critère non noté). */
export const EvaluationFields: React.FC<{
  values: EvaluationValues;
  onChange: (patch: Partial<EvaluationValues>) => void;
  criteria: EvaluationCriterion[];
  showErrors: boolean;
}> = ({ values, onChange, criteria, showErrors }) => {
  const errors = validateScores(values.scores, criteria);
  return (
    <div className="space-y-4">
      <TextField label="Portée de l'évaluation" value={values.scope} maxLength={120} placeholder="Ex. : sourate An-Nas, juz 30…" onChange={e => onChange({ scope: e.target.value })} />
      <div>
        <p className="mb-1 text-sm font-medium text-ink">Notes par critère</p>
        {criteria.length === 0 && <p className="text-sm text-slate-500">Aucun critère d'évaluation n'est configuré. Le directeur peut les définir dans les paramètres.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {criteria.map(c => (
            <Field key={c.id} label={`${c.name} (sur ${formatScore(c.maxScore)})`} error={showErrors ? errors.byCriterion[c.id] : undefined}>
              {id => (
                <input
                  id={id} inputMode="decimal" className="input" placeholder="Note" value={values.scores[c.id] ?? ''}
                  aria-invalid={!!(showErrors && errors.byCriterion[c.id])}
                  onChange={e => onChange({ scores: { ...values.scores, [c.id]: e.target.value } })}
                />
              )}
            </Field>
          ))}
        </div>
        {showErrors && errors.global && <p role="alert" className="mt-1 text-xs text-danger">{errors.global}</p>}
        <p className="mt-1 text-xs text-slate-500">La note moyenne (sur 20) est calculée par le serveur, selon le poids de chaque critère.</p>
      </div>
      <TextAreaField label="Appréciation pour la famille" rows={2} maxLength={500} value={values.appreciation} hint="Visible par les parents." onChange={e => onChange({ appreciation: e.target.value })} />
      <TextAreaField label="Notes internes" rows={2} value={values.internalNotes} hint="Jamais visibles par les parents." onChange={e => onChange({ internalNotes: e.target.value })} />
      <TextField label="Date" type="date" max={todayIso()} required value={values.date} onChange={e => onChange({ date: e.target.value })} className="max-w-48" />
    </div>
  );
};

interface Props {
  student: { id: string };
  criteria: EvaluationCriterion[];
  onSaved: () => void;
}

export const EvaluationForm: React.FC<Props> = ({ student, criteria, onSaved }) => {
  const toast = useToast();
  const [values, setValues] = useState<EvaluationValues>(emptyEvaluation);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Evaluation | null>(null);

  useEffect(() => { setValues(emptyEvaluation()); setShow(false); setError(null); setSaved(null); }, [student.id]);

  const patch = (p: Partial<EvaluationValues>) => setValues(v => ({ ...v, ...p }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (!scoresValid(validateScores(values.scores, criteria)) || !values.date) return;
    setBusy(true);
    setError(null);
    try {
      const ev = await createEvaluation({ student: student.id, ...evaluationBody(values, criteria) });
      setSaved(ev);
      toast.success('Évaluation enregistrée.');
      setValues(emptyEvaluation());
      setShow(false);
      onSaved();
    } catch (err) {
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {saved && (
        <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <p className="font-medium">
            Évaluation enregistrée{!Number.isNaN(parseDecimal(saved.overallScore)) && <> : note moyenne {formatScore(saved.overallScore)} / 20</>}.
          </p>
          <p className="text-brand-700/80">Calculée par le serveur à partir des critères notés.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <EvaluationFields values={values} onChange={patch} criteria={criteria} showErrors={show} />
      <Button type="submit" loading={busy} disabled={criteria.length === 0} className="w-full sm:w-auto">Enregistrer l'évaluation</Button>
    </form>
  );
};
