import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Pencil } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { TIMELINE_TYPE_LABEL, type QualityLevel, type TimelineEntry } from '../../types/memorization';
import { readerPath } from '../quran/quranUtils';
import { entrySummary, formatScore, isSuperseded, parseDecimal, qualityTone } from './memorizationUtils';

interface Props {
  entry: TimelineEntry;
  levels: QualityLevel[];
  /** Vue du personnel : champs internes et correction. */
  staff: boolean;
  canCorrect: boolean;
  onCorrect: (e: TimelineEntry) => void;
}

const Internal: React.FC<{ label: string; text?: string }> = ({ label, text }) =>
  text ? <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-700">{label} :</span> {text}</p> : null;

/** Une entrée de la chronologie : leçon, révision ou évaluation (version courante ou remplacée). */
export const TimelineEntryCard: React.FC<Props> = ({ entry, levels, staff, canCorrect, onCorrect }) => {
  const superseded = isSuperseded(entry);
  const corrected = !!entry.supersedes;

  return (
    <li className={`rounded-md border border-line bg-white px-3 py-3 ${superseded ? 'bg-slate-50 opacity-75' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={entry.type === 'LESSON' ? 'success' : entry.type === 'REVISION' ? 'info' : 'gold'}>{TIMELINE_TYPE_LABEL[entry.type]}</Badge>
        {entry.type !== 'EVALUATION' && <Badge tone={qualityTone(entry.quality, levels)}>{entry.qualityLabel || entry.quality}</Badge>}
        {superseded && <Badge tone="neutral">Version remplacée</Badge>}
        {corrected && !superseded && <Badge tone="warning">Corrigée</Badge>}
        <span className="ml-auto text-xs text-slate-500">{formatDate(entry.date)}</span>
      </div>

      <p className="mt-1.5 font-medium text-ink">
        {entrySummary(entry)}
        {entry.type === 'LESSON' && entry.surahNameArabic && (
          <span lang="ar" dir="rtl" className="font-arabic ml-2 text-lg text-slate-500">{entry.surahNameArabic}</span>
        )}
      </p>

      {entry.type === 'LESSON' && (
        <p className="text-xs text-slate-500">Juz {entry.juz} · hizb {entry.hizb} · page {entry.page}{entry.className ? ` · ${entry.className}` : ''}</p>
      )}

      {entry.type === 'EVALUATION' && (
        <div className="mt-1">
          {!Number.isNaN(parseDecimal(entry.overallScore)) && (
            <p className="text-sm"><span className="font-semibold tabular-nums">{formatScore(entry.overallScore)}</span> / 20 <span className="text-xs text-slate-500">(note moyenne)</span></p>
          )}
          {entry.scores?.length > 0 && (
            <ul className="mt-1 grid gap-x-4 text-sm text-slate-600 sm:grid-cols-2">
              {entry.scores.map(s => (
                <li key={s.criterion} className="flex justify-between gap-2">
                  <span>{s.criterionName}</span>
                  <span className="tabular-nums">{formatScore(s.score)} / {formatScore(s.maxScore)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {entry.appreciation && <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Appréciation :</span> {entry.appreciation}</p>}
      {staff && entry.type === 'LESSON' && <Internal label="Observations internes" text={entry.observations} />}
      {staff && entry.type === 'REVISION' && (
        <>
          <Internal label="Difficultés" text={entry.difficulties} />
          <Internal label="Recommandations" text={entry.recommendations} />
        </>
      )}
      {staff && entry.type === 'EVALUATION' && <Internal label="Notes internes" text={entry.internalNotes} />}
      {staff && corrected && entry.correctionReason && <p className="mt-1 text-sm text-amber-800">Motif de la correction : {entry.correctionReason}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {entry.teacherName && <span className="text-xs text-slate-500">Maître : {entry.teacherName}</span>}
        <span className="ml-auto flex gap-2">
          {entry.type !== 'EVALUATION' && (
            <Link
              to={readerPath({ surah: entry.surahNumber, ayah: entry.ayahStart, to: entry.ayahEnd, student: entry.studentId })}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              <BookOpen className="h-4 w-4" aria-hidden /> Lire
            </Link>
          )}
          {canCorrect && !superseded && (
            <Button variant="secondary" size="sm" onClick={() => onCorrect(entry)}><Pencil className="h-3.5 w-3.5" aria-hidden /> Corriger</Button>
          )}
        </span>
      </div>
    </li>
  );
};
