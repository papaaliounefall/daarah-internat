import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button, TextAreaField, TextField, useToast } from '../../components/ui';
import { plainErrorMessage } from '../../lib/apiErrors';
import { createLesson } from '../../services/memorization';
import type { Lesson, LessonValues } from '../../types/memorization';
import { readerPath } from '../quran/quranUtils';
import { QualityPicker } from './QualityPicker';
import { SurahRangeFields } from './SurahRangeFields';
import type { ReferenceData } from './useReferenceData';
import { emptyLesson, hasErrors, lessonBody, nextStart, suggestStart, todayIso, validateRange } from './memorizationUtils';

/** Champs d'une leçon : partagés entre la saisie et la correction. */
export const LessonFields: React.FC<{
  values: LessonValues;
  onChange: (patch: Partial<LessonValues>) => void;
  reference: ReferenceData;
  showErrors: boolean;
}> = ({ values, onChange, reference, showErrors }) => (
  <div className="space-y-4">
    <SurahRangeFields values={values} onChange={onChange} surahs={reference.surahs} showErrors={showErrors} />
    <QualityPicker
      levels={reference.levels} value={values.quality} onChange={quality => onChange({ quality })}
      error={showErrors && !values.quality ? 'Choisissez la qualité de la récitation.' : undefined}
    />
    <TextAreaField
      label="Appréciation pour la famille" rows={2} maxLength={500} value={values.appreciation}
      hint="Visible par les parents." onChange={e => onChange({ appreciation: e.target.value })}
    />
    <TextAreaField
      label="Observations internes" rows={2} value={values.observations}
      hint="Jamais visibles par les parents." onChange={e => onChange({ observations: e.target.value })}
    />
    <TextField label="Date" type="date" max={todayIso()} required value={values.date} onChange={e => onChange({ date: e.target.value })} className="max-w-48" />
  </div>
);

interface Props {
  student: { id: string; fullName: string; currentSurahNumber: number | null; currentAyah: number | null };
  reference: ReferenceData;
  onSaved: () => void;
}

/** Nouvelle leçon : sourate, versets, qualité, appréciation. Juz, hizb et page sont calculés par le serveur. */
export const LessonForm: React.FC<Props> = ({ student, reference, onSaved }) => {
  const toast = useToast();
  const [values, setValues] = useState<LessonValues>(emptyLesson);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Lesson | null>(null);

  // Départ suggéré : la suite de la dernière leçon du talibé (jamais inventé).
  useEffect(() => {
    const s = suggestStart(student.currentSurahNumber, student.currentAyah, n => reference.surahs.find(x => x.number === n)?.versesCount ?? null);
    setValues({ ...emptyLesson(), surah: s.surah, ayahStart: s.ayahStart, ayahEnd: s.ayahStart });
    setShow(false); setError(null); setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const patch = (p: Partial<LessonValues>) => setValues(v => ({ ...v, ...p }));
  const surah = reference.surahs.find(s => String(s.number) === values.surah);
  const invalid = hasErrors(validateRange(values, surah?.versesCount ?? null)) || !values.quality || !values.date;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const lesson = await createLesson({ student: student.id, ...lessonBody(values) });
      setSaved(lesson);
      toast.success('Leçon enregistrée.');
      const next = nextStart(lesson.ayahEnd, surah?.versesCount ?? lesson.ayahEnd);
      setValues({ ...emptyLesson(), surah: String(lesson.surahNumber), ayahStart: next ? String(next) : '', ayahEnd: next ? String(next) : '' });
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
            Enregistré : {saved.surahName}, {saved.ayahStart === saved.ayahEnd ? 'verset' : 'versets'} {saved.ayahStart === saved.ayahEnd ? saved.ayahStart : `${saved.ayahStart} à ${saved.ayahEnd}`} ({saved.qualityLabel}).
          </p>
          <p className="mt-0.5">Juz {saved.juz} · hizb {saved.hizb} · page {saved.page} <span className="text-brand-700/80">(calculés par le serveur)</span></p>
          <Link
            className="mt-1 inline-flex items-center gap-1 font-medium underline"
            to={readerPath({ surah: saved.surahNumber, ayah: saved.ayahStart, to: saved.ayahEnd, student: student.id })}
          >
            <BookOpen className="h-4 w-4" aria-hidden /> Ouvrir dans le lecteur
          </Link>
        </div>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <LessonFields values={values} onChange={patch} reference={reference} showErrors={show} />
      <Button type="submit" loading={busy} className="w-full sm:w-auto">Enregistrer la leçon</Button>
    </form>
  );
};
