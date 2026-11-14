import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, BookOpen, Download, Volume2 } from 'lucide-react';
import { Button, useToast } from '../../components/ui';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, initials } from '../../lib/format';
import { downloadChildCard } from '../../services/parent';
import type { Student } from '../../types';
import type { ParentChild } from '../../types/parent';
import { readerPath } from '../quran/quranUtils';
import { formatScore } from '../memorization/memorizationUtils';
import { versesLabel } from './parentUtils';

interface Props {
  student: Student;
  /** Données du tableau de bord (dernières leçons, etc.) ; absentes si leur chargement a échoué. */
  summary: ParentChild | null;
}

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-ink">{children}</dd>
  </div>
);

/** Identité, progression coranique, dernières évaluations (appréciations) et carte de l'enfant. */
export const ChildProfile: React.FC<Props> = ({ student, summary }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const hasProgress = !!student.currentSurahNumber;

  const downloadCard = async () => {
    setBusy(true);
    try {
      await downloadChildCard(student.id, student.registrationNumber);
    } catch (e) {
      toast.error(plainErrorMessage(e, "La carte n'a pas pu être téléchargée."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4" aria-label="Identité">
        <div className="flex items-start gap-3">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
          ) : (
            <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-brand-50 text-lg font-semibold text-brand-800">
              {initials(student.firstName, student.lastName)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{student.fullName}</h2>
            <p className="text-sm text-slate-500">Matricule {student.registrationNumber}</p>
          </div>
        </div>
        <dl className="mt-3 divide-y divide-line">
          <Line label="Classe">{student.className || 'Non affecté'}</Line>
          <Line label="Maître coranique">{student.teacherName || 'Non renseigné'}</Line>
          {student.isBoarding && (
            <Line label="Internat">
              <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4 text-slate-400" aria-hidden />{student.roomName}{student.bedNumber ? `, lit ${student.bedNumber}` : ''}</span>
            </Line>
          )}
        </dl>
        <div className="mt-3">
          <Button variant="secondary" size="sm" loading={busy} onClick={downloadCard}>
            <Download className="h-4 w-4" aria-hidden /> Télécharger la carte talibé
          </Button>
        </div>
      </section>

      <section className="panel p-4" aria-label="Progression coranique">
        <h3 className="text-base font-semibold text-ink">Progression coranique</h3>
        {hasProgress ? (
          <>
            <p className="mt-1 text-sm text-slate-700">
              Dernière leçon : <strong>{student.currentSurahName}</strong>, verset {student.currentAyah}
              {student.currentJuz ? ` · juz ${student.currentJuz}` : ''}{student.currentHizb ? ` · hizb ${student.currentHizb}` : ''}
            </p>
            {student.lastProgressDate && <p className="text-xs text-slate-500">Mise à jour le {formatDate(student.lastProgressDate)}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={readerPath({ surah: student.currentSurahNumber!, ayah: student.currentAyah, student: student.id })}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-800 px-4 text-sm font-medium text-white hover:bg-brand-900"
              >
                <BookOpen className="h-4 w-4" aria-hidden /> Lire la sourate
              </Link>
              <Link
                to={readerPath({ surah: student.currentSurahNumber!, ayah: student.currentAyah, student: student.id, play: true })}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50"
              >
                <Volume2 className="h-4 w-4" aria-hidden /> Écouter la récitation
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Aucune leçon n'est encore enregistrée pour cet enfant.</p>
        )}
      </section>

      <section className="panel p-4" aria-label="Derniers suivis">
        <h3 className="text-base font-semibold text-ink">Derniers suivis</h3>
        {!summary ? (
          <p className="mt-1 text-sm text-slate-500">Le résumé n'est pas disponible pour le moment.</p>
        ) : (
          <div className="mt-2 divide-y divide-line">
            <Entry
              title="Dernière leçon"
              empty="Aucune leçon enregistrée."
              value={summary.lastLesson && { date: summary.lastLesson.date, main: `${summary.lastLesson.surahName}, ${versesLabel(summary.lastLesson.ayahStart, summary.lastLesson.ayahEnd)}`, note: summary.lastLesson.appreciation }}
            />
            <Entry
              title="Dernière révision"
              empty="Aucune révision enregistrée."
              value={summary.lastRevision && { date: summary.lastRevision.date, main: `${summary.lastRevision.surahName}, ${versesLabel(summary.lastRevision.ayahStart, summary.lastRevision.ayahEnd)}`, note: summary.lastRevision.appreciation }}
            />
            <Entry
              title="Dernière évaluation"
              empty="Aucune évaluation enregistrée."
              value={summary.lastEvaluation && {
                date: summary.lastEvaluation.date,
                main: summary.lastEvaluation.overallScore !== null ? `Note moyenne : ${formatScore(summary.lastEvaluation.overallScore)} / 20` : 'Évaluation enregistrée',
                note: summary.lastEvaluation.appreciation,
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
};

const Entry: React.FC<{ title: string; empty: string; value: { date: string; main: string; note: string } | null }> = ({ title, empty, value }) => (
  <div className="py-2.5">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    {value ? (
      <>
        <p className="text-sm font-medium text-ink">{value.main} <span className="font-normal text-slate-500">· {formatDate(value.date)}</span></p>
        {value.note && <p className="text-sm text-slate-600">{value.note}</p>}
      </>
    ) : (
      <p className="text-sm text-slate-500">{empty}</p>
    )}
  </div>
);
