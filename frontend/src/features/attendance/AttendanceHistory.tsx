import React, { useState } from 'react';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { Badge, SelectField, TextField } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFetch } from '../../hooks/useFetch';
import { formatDate } from '../../lib/format';
import { listAttendance } from '../../services/attendance';
import type { ClassRoom } from '../../types';
import {
  EMPTY_ATTENDANCE_FILTERS, PERIOD_LABEL, STATUS_LABEL, type AttendanceFilters, type AttendanceStatus,
} from '../../types/attendance';
import { todayIso } from './attendanceUtils';

const PAGE_SIZE = 25;
const TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = { PRESENT: 'success', ABSENT: 'danger', RETARD: 'warning', EXCUSE: 'info' };

interface Props {
  classes: ClassRoom[];
  /** Le parent ne voit que ses enfants (le serveur filtre) : pas de filtre par classe ni de recherche. */
  readOnlyParent?: boolean;
}

/** Historique filtrable des pointages (période, classe, statut, créneau, recherche). */
export const AttendanceHistory: React.FC<Props> = ({ classes, readOnlyParent }) => {
  const [filters, setFilters] = useState<AttendanceFilters>(EMPTY_ATTENDANCE_FILTERS);
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(filters.search);
  const effective = { ...filters, search };
  const state = useFetch(() => listAttendance({ filters: effective, page, pageSize: PAGE_SIZE }), [JSON.stringify(effective), page]);
  const set = (p: Partial<AttendanceFilters>) => { setFilters(f => ({ ...f, ...p })); setPage(1); };
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_ATTENDANCE_FILTERS);

  return (
    <div>
      <FilterBar>
        <TextField label="Du" type="date" value={filters.dateAfter} max={filters.dateBefore || todayIso()} onChange={e => set({ dateAfter: e.target.value })} />
        <TextField label="Au" type="date" value={filters.dateBefore} min={filters.dateAfter || undefined} max={todayIso()} onChange={e => set({ dateBefore: e.target.value })} />
        {!readOnlyParent && (
          <SelectField label="Classe" value={filters.classroom} onChange={e => set({ classroom: e.target.value })}>
            <option value="">Toutes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
        )}
        <SelectField label="Statut" value={filters.status} onChange={e => set({ status: e.target.value as AttendanceStatus | '' })}>
          <option value="">Tous</option>
          {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </SelectField>
        <SelectField label="Créneau" value={filters.period} onChange={e => set({ period: e.target.value as AttendanceFilters['period'] })}>
          <option value="">Tous</option>
          <option value="MATIN">{PERIOD_LABEL.MATIN}</option>
          <option value="SOIR">{PERIOD_LABEL.SOIR}</option>
        </SelectField>
        {!readOnlyParent && (
          <TextField label="Talibé" type="search" placeholder="Nom ou matricule" value={filters.search} onChange={e => set({ search: e.target.value })} />
        )}
        {active && (
          <button type="button" className="min-h-10 text-sm font-medium text-brand-800 underline" onClick={() => { setFilters(EMPTY_ATTENDANCE_FILTERS); setPage(1); }}>
            Réinitialiser
          </button>
        )}
      </FilterBar>

      <Async
        state={state}
        isEmpty={d => d.results.length === 0}
        emptyTitle={active ? 'Aucun pointage pour ces filtres' : 'Aucun pointage enregistré'}
        emptyHint={active ? 'Modifiez ou réinitialisez les filtres.' : undefined}
      >
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Date</th><th scope="col">Créneau</th><th scope="col">Talibé</th>
                  <th scope="col">Classe</th><th scope="col">Statut</th><th scope="col">Motif</th>
                  {!readOnlyParent && <th scope="col">Saisi par</th>}
                </tr>
              </thead>
              <tbody>
                {data.results.map(r => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                    <td>{PERIOD_LABEL[r.period]}</td>
                    <td className="font-medium">{r.studentName}</td>
                    <td>{r.className}</td>
                    <td><Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                    <td className="text-slate-600">{r.reason}</td>
                    {!readOnlyParent && <td className="text-slate-600">{r.recordedByName}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
    </div>
  );
};
