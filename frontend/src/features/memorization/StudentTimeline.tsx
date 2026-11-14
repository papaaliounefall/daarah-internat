import React, { useEffect, useMemo, useState } from 'react';
import { Async } from '../../components/ops/Async';
import { Pagination } from '../../components/ui/Pagination';
import { SelectField, TextField } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { formatDate } from '../../lib/format';
import { getTimeline } from '../../services/memorization';
import { useAuth } from '../../stores/authStore';
import {
  EMPTY_TIMELINE_FILTERS, TIMELINE_TYPE_LABEL, type TimelineEntry, type TimelineFilters, type TimelineType,
} from '../../types/memorization';
import { CorrectionDialog } from './CorrectionDialog';
import { TimelineEntryCard } from './TimelineEntryCard';
import { groupByDate } from './memorizationUtils';
import { useReferenceData, type ReferenceData } from './useReferenceData';

const PAGE_SIZE = 20;
const TYPES: TimelineType[] = ['LESSON', 'REVISION', 'EVALUATION'];

interface Props {
  studentId: string;
  /** Données de référence déjà chargées (évite un second chargement) ; sinon le composant les charge. */
  reference?: ReferenceData;
  /** Forcer l'affichage/masquage du bouton « Corriger » (par défaut : directeur et maître). */
  canCorrect?: boolean;
  /** Incrémenté par le parent pour recharger après une saisie. */
  refreshKey?: number;
  onChanged?: () => void;
}

/**
 * Historique chronologique d'un talibé : leçons, révisions, évaluations, avec filtres (période, sourate, maître, type)
 * et correction tracée. Réutilisable dans la fiche talibé : `<StudentTimeline studentId={id} />`.
 */
export const StudentTimeline: React.FC<Props> = ({ studentId, reference, canCorrect, refreshKey = 0, onChanged }) => {
  const role = useAuth(s => s.user?.role);
  const staff = role !== 'PARENT';
  const mayCorrect = canCorrect ?? (role === 'DIRECTEUR' || role === 'MAITRE');

  const own = useReferenceData(!reference);
  const ref = reference ?? own.data;

  const [filters, setFilters] = useState<TimelineFilters>(EMPTY_TIMELINE_FILTERS);
  const [page, setPage] = useState(1);
  const [correcting, setCorrecting] = useState<TimelineEntry | null>(null);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());

  useEffect(() => { setFilters(EMPTY_TIMELINE_FILTERS); setPage(1); setTeachers(new Map()); }, [studentId]);

  const state = useFetch(
    () => getTimeline({ studentId, filters, page, pageSize: PAGE_SIZE }),
    [studentId, filters, page, refreshKey],
  );

  // Maîtres rencontrés dans l'historique : sert d'options au filtre (pas d'annuaire exposé aux autres rôles).
  useEffect(() => {
    if (!state.data || !staff) return;
    setTeachers(prev => {
      const next = new Map(prev);
      for (const e of state.data!.results) if (e.teacherId && e.teacherName) next.set(e.teacherId, e.teacherName);
      return next.size === prev.size ? prev : next;
    });
  }, [state.data, staff]);

  const update = (patch: Partial<TimelineFilters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); };
  const toggleType = (t: TimelineType) =>
    update({ types: filters.types.includes(t) ? filters.types.filter(x => x !== t) : [...filters.types, t] });
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_TIMELINE_FILTERS);
  const groups = useMemo(() => groupByDate(state.data?.results ?? []), [state.data]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Types d'entrées">
        <button
          type="button" aria-pressed={filters.types.length === 0} onClick={() => update({ types: [] })}
          className={chip(filters.types.length === 0)}
        >Tout</button>
        {TYPES.map(t => (
          <button key={t} type="button" aria-pressed={filters.types.includes(t)} onClick={() => toggleType(t)} className={chip(filters.types.includes(t))}>
            {TIMELINE_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <details className="mb-4 rounded-md border border-line bg-white">
        <summary className="min-h-10 cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Filtres{filtered ? ' (actifs)' : ''}</summary>
        <div className="grid gap-3 border-t border-line p-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Du" type="date" value={filters.dateAfter} max={filters.dateBefore || undefined} onChange={e => update({ dateAfter: e.target.value })} />
          <TextField label="Au" type="date" value={filters.dateBefore} min={filters.dateAfter || undefined} onChange={e => update({ dateBefore: e.target.value })} />
          <SelectField label="Sourate" value={filters.surah} onChange={e => update({ surah: e.target.value })} hint="Exclut les évaluations.">
            <option value="">Toutes</option>
            {(ref?.surahs ?? []).map(s => <option key={s.number} value={s.number}>{s.number}. {s.nameSimple}</option>)}
          </SelectField>
          {staff && (
            <SelectField label="Maître" value={filters.teacher} onChange={e => update({ teacher: e.target.value })}>
              <option value="">Tous</option>
              {[...teachers.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </SelectField>
          )}
          {staff && (
            <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={filters.includeHistory} onChange={e => update({ includeHistory: e.target.checked })} />
              Afficher aussi les versions remplacées par une correction
            </label>
          )}
          {filtered && (
            <button type="button" className="text-left text-sm font-medium text-brand-800 underline" onClick={() => { setFilters(EMPTY_TIMELINE_FILTERS); setPage(1); }}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </details>

      <Async
        state={state}
        isEmpty={d => d.results.length === 0}
        emptyTitle={filtered ? 'Aucune entrée pour ces filtres' : "Aucun suivi enregistré pour l'instant"}
        emptyHint={filtered ? 'Modifiez ou réinitialisez les filtres.' : 'Les leçons, révisions et évaluations apparaîtront ici.'}
      >
        {data => (
          <>
            <div className="space-y-4">
              {groups.map(g => (
                <section key={g.date} aria-label={formatDate(g.date)}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDate(g.date)}</h3>
                  <ul className="space-y-2">
                    {g.entries.map(e => (
                      <TimelineEntryCard
                        key={`${e.type}-${e.id}`}
                        entry={e}
                        levels={ref?.levels ?? []}
                        staff={staff}
                        canCorrect={mayCorrect && !!ref}
                        onCorrect={setCorrecting}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="mt-4 panel">
              <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
            </div>
          </>
        )}
      </Async>

      {correcting && ref && (
        <CorrectionDialog
          entry={correcting}
          reference={ref}
          onClose={() => setCorrecting(null)}
          onDone={() => { state.reload(); onChanged?.(); }}
        />
      )}
    </div>
  );
};

const chip = (on: boolean) =>
  `min-h-10 rounded-md border px-3 text-sm font-medium ${on ? 'border-brand-800 bg-brand-800 text-white' : 'border-line bg-white text-ink hover:bg-brand-50'}`;

export default StudentTimeline;
