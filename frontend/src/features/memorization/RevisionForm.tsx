import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button, TextAreaField, TextField, useToast } from '../../components/ui';
import { plainErrorMessage } from '../../lib/apiErrors';
import { createRevision } from '../../services/memorization';
import type { Revision, RevisionValues } from '../../types/memorization';
import { readerPath } from '../quran/quranUtils';
import { QualityPicker } from './QualityPicker';
import { SurahRangeFields } from './SurahRangeFields';
import type { ReferenceData } from './useReferenceData';
import { emptyRevision, hasErrors, revisionBody, todayIso, validateRange } from './memorizationUtils';

/** Champs d'une révision : partagés entre la saisie et la correction. */
export const RevisionFields: React.FC<{
  values: RevisionValues;
  onChange: (patch: Partial<RevisionValues>) => void;
  reference: ReferenceData;
  showErrors: boolean;
}> = ({ values, onChange, reference, showErrors }) => (
  <div className="space-y-4">
    <SurahRangeFields values={values} onChange={onChange} surahs={reference.surahs} showErrors={showErrors} />
    <QualityPicker
      levels={reference.levels} value={values.quality} onChange={quality => onChange({ quality })}
      error={showErrors && !values.quality ? 'Choisissez la qualité de la révision.' : undefined}
    />
    <TextAreaField label="Difficultés constatées" rows={2} value={values.difficulties} hint="Interne." onChange={e => onChange({ difficulties: e.target.value })} />
    <TextAreaField label="Recommandations" rows={2} value={values.recommendations} hint="Interne." onChange={e => onChange({ recommendations: e.target.value })} />
    <TextAreaField label="Appréciation pour la famille" rows={2} maxLength={500} value={values.appreciation} hint="Visible par les parents." onChange={e => onChange({ appreciation: e.target.value })} />
    <TextField label="Date" type="date" max={todayIso()} required value={values.date} onChange={e => onChange({ date: e.target.value })} className="max-w-48" />
  </div>
);

interface Props {
  student: { id: string; currentSurahNumber: number | null };
  reference: ReferenceData;
  onSaved: () => void;
}

/** Révision d'un passage déjà mémorisé. */
export const RevisionForm: React.FC<Props> = ({ student, reference, onSaved }) => {
  const toast = useToast();
  const [values, setValues] = useState<RevisionValues>(emptyRevision);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Revision | null>(null);

  useEffect(() => {
    setValues({ ...emptyRevision(), surah: student.currentSurahNumber ? String(student.currentSurahNumber) : '' });
    setShow(false); setError(null); setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const patch = (p: Partial<RevisionValues>) => setValues(v => ({ ...v, ...p }));
  const surah = reference.surahs.find(s => String(s.number) === values.surah);
  const invalid = hasErrors(validateRange(values, surah?.versesCount ?? null)) || !values.quality || !values.date;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const rev = await createRevision({ student: student.id, ...revisionBody(values) });
      setSaved(rev);
      toast.success('Révision enregistrée.');
      setValues({ ...emptyRevision(), surah: String(rev.surahNumber) });
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
          <p className="font-medium">Enregistré : {saved.surahName}, versets {saved.ayahRange} ({saved.qualityLabel}).</p>
          <Link className="mt-1 inline-flex items-center gap-1 font-medium underline" to={readerPath({ surah: saved.surahNumber, ayah: saved.ayahStart, to: saved.ayahEnd, student: student.id })}>
            <BookOpen className="h-4 w-4" aria-hidden /> Ouvrir dans le lecteur
          </Link>
        </div>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <RevisionFields values={values} onChange={patch} reference={reference} showErrors={show} />
      <Button type="submit" loading={busy} className="w-full sm:w-auto">Enregistrer la révision</Button>
    </form>
  );
};
