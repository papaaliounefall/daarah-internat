import React, { useMemo } from 'react';
import { Async } from '../../components/ops/Async';
import { Badge } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { formatDate } from '../../lib/format';
import { listChildAttendance } from '../../services/parent';
import { PERIOD_LABEL, STATUS_LABEL } from '../../types/attendance';
import type { ChildAttendance30 } from '../../types/parent';
import { STATUS_TONE, attendanceTotal, daysAgoIso, presenceRate } from './parentUtils';

interface Props {
  studentId: string;
  /** Totaux sur 30 jours fournis par le tableau de bord (facultatif). */
  summary?: ChildAttendance30;
}

const Count: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-md border border-line px-3 py-2 text-center">
    <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
    <p className="text-xs text-slate-500">{label}</p>
  </div>
);

/** Présences et absences des 30 derniers jours (lecture seule). */
export const ChildAttendance: React.FC<Props> = ({ studentId, summary }) => {
  const since = useMemo(() => daysAgoIso(30), []);
  const state = useFetch(() => listChildAttendance(studentId, since), [studentId, since]);
  const rate = summary ? presenceRate(summary) : null;

  return (
    <section className="panel p-4" aria-label="Présences des 30 derniers jours">
      <h3 className="text-base font-semibold text-ink">Présences des 30 derniers jours</h3>
      {summary && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Count label="Présent" value={summary.present} />
            <Count label="Absent" value={summary.absent} />
            <Count label="Retard" value={summary.late} />
            <Count label="Excusé" value={summary.excused} />
          </div>
          {attendanceTotal(summary) > 0 && rate !== null && (
            <p className="mt-2 text-sm text-slate-600">Taux de présence : <strong>{rate.toLocaleString('fr-FR')} %</strong></p>
          )}
        </>
      )}
      <div className="mt-3">
        <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucun pointage sur cette période">
          {rows => {
            const notable = rows.filter(r => r.status !== 'PRESENT');
            return notable.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune absence ni retard sur la période.</p>
            ) : (
              <ul className="divide-y divide-line">
                {notable.map(r => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{formatDate(r.date)} · {PERIOD_LABEL[r.period]}</span>
                    <span className="flex items-center gap-2">
                      {r.reason && <span className="text-xs text-slate-500">{r.reason}</span>}
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            );
          }}
        </Async>
      </div>
    </section>
  );
};
