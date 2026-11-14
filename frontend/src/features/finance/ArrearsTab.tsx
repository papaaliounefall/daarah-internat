import React, { useMemo, useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { getArrears } from '../../services/finance';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, Modal, SelectField, TextField } from '../../components/ui';
import { Async, FilterBar, Stat, TableWrap } from '../../components/ops/Async';
import { DUE_STATUS_LABEL, type ArrearsRow, type Due } from '../../types/finance';
import { dueStatusTone, parseAmount, remainingBalance } from './financeUtils';
import { PaymentFormModal } from './PaymentFormModal';
import { useYears } from './useYears';

/** Détail des échéances restant dues d'un talibé, avec encaissement direct. */
const ArrearsDetail: React.FC<{ row: ArrearsRow; yearId: string; onClose: () => void; onPay: (d: Due) => void }> = ({ row, yearId, onClose, onPay }) => {
  const state = useFetch(() => getArrears({ academicYear: yearId, overdueOnly: false, student: row.student }), [row.student, yearId]);
  const dues = state.data?.results[0]?.dues ?? [];
  return (
    <Modal title={`Échéances restant dues — ${row.studentName}`} size="lg" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      <Async state={state} isEmpty={() => dues.length === 0} emptyTitle="Aucune échéance restant due">
        {() => (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[34rem]">
              <thead><tr><th>Frais</th><th>Échéance</th><th className="text-right">Reste</th><th>Statut</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {dues.map(d => (
                  <tr key={d.id}>
                    <td>{d.label}{d.period ? <div className="text-xs text-slate-500">{d.period}</div> : null}</td>
                    <td className="whitespace-nowrap">{formatDate(d.dueDate)}{d.isOverdue && <div className="text-xs text-danger">En retard</div>}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(remainingBalance(d))}</td>
                    <td><Badge tone={dueStatusTone(d.status)}>{DUE_STATUS_LABEL[d.status]}</Badge></td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => onPay(d)}>Encaisser</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </Modal>
  );
};

export const ArrearsTab: React.FC = () => {
  const { years, currentId } = useYears();
  const [year, setYear] = useState<string | null>(null);
  const yearId = year ?? currentId;
  const [overdueOnly, setOverdueOnly] = useState(true);
  const [minBalance, setMinBalance] = useState('');
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState<ArrearsRow | null>(null);
  const [paying, setPaying] = useState<Due | null>(null);

  const min = parseAmount(minBalance);
  const state = useFetch(
    () => getArrears({ academicYear: yearId || undefined, overdueOnly, minBalance: Number.isNaN(min) ? undefined : min }),
    [yearId, overdueOnly, minBalance],
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = state.data?.results ?? [];
    return q ? all.filter(r => r.studentName.toLowerCase().includes(q) || r.registrationNumber.toLowerCase().includes(q)) : all;
  }, [state.data, filter]);

  return (
    <div>
      <FilterBar>
        <SelectField label="Année scolaire" value={yearId} onChange={e => setYear(e.target.value)}>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (en cours)' : ''}</option>)}
          <option value="all">Toutes les années</option>
        </SelectField>
        <TextField label="Reste minimum (FCFA)" inputMode="numeric" value={minBalance} onChange={e => setMinBalance(e.target.value)} className="w-40" />
        <TextField label="Filtrer par nom" type="search" value={filter} onChange={e => setFilter(e.target.value)} className="min-w-48" />
        <label className="flex min-h-10 items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Échéances échues seulement
        </label>
      </FilterBar>

      <Async state={state} isEmpty={d => d.results.length === 0} emptyTitle="Aucun impayé" emptyHint="Aucun talibé n'a de solde dû avec ces critères.">
        {data => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="Total des impayés" value={formatFcfa(data.totalBalance)} tone="danger" />
              <Stat label="Talibés concernés" value={data.count} />
            </div>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Aucun résultat pour « {filter} ».</p>
            ) : (
              <TableWrap>
                <table className="table-base min-w-[48rem]">
                  <thead>
                    <tr><th>Talibé</th><th className="text-right">Total dû</th><th className="text-right">Payé</th><th className="text-right">Reste</th><th className="text-right">Échues</th><th>Plus ancienne</th><th><span className="sr-only">Action</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.student}>
                        <td>
                          <div className="font-medium">{r.studentName}</div>
                          <div className="text-xs text-slate-500"><span className="font-mono">{r.registrationNumber}</span> · {r.studentStatus === 'SOCIAL' ? 'Social' : 'Payant'}</div>
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(r.totalDue)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(r.totalPaid)}</td>
                        <td className="whitespace-nowrap text-right font-medium tabular-nums text-danger">{formatFcfa(r.balance)}</td>
                        <td className="text-right tabular-nums">{r.overdueCount}</td>
                        <td className="whitespace-nowrap">{formatDate(r.oldestDueDate)}</td>
                        <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Voir le détail</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </div>
        )}
      </Async>

      {detail && !paying && <ArrearsDetail row={detail} yearId={yearId} onClose={() => setDetail(null)} onPay={setPaying} />}
      {paying && <PaymentFormModal initialDue={paying} onClose={() => setPaying(null)} onSaved={state.reload} />}
    </div>
  );
};
