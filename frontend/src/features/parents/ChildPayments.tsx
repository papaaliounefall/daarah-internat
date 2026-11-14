import React from 'react';
import { Async } from '../../components/ops/Async';
import { Badge } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { formatDate, formatFcfa } from '../../lib/format';
import { listChildPayments } from '../../services/parent';
import { feeKindLabel, methodLabel } from './parentUtils';

/** Paiements de l'enfant, en lecture seule. */
export const ChildPayments: React.FC<{ studentId: string }> = ({ studentId }) => {
  const state = useFetch(() => listChildPayments(studentId), [studentId]);
  return (
    <section className="panel p-4" aria-label="Paiements">
      <h3 className="text-base font-semibold text-ink">Paiements</h3>
      <div className="mt-2">
        <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucun paiement enregistré" emptyHint="Les paiements enregistrés par le Daara apparaîtront ici.">
          {rows => (
            <ul className="divide-y divide-line">
              {rows.map(p => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink">{feeKindLabel(p.feeKind)}{p.periodLabel ? ` · ${p.periodLabel}` : ''}</p>
                    <p className="text-xs text-slate-500">{formatDate(p.date)} · {methodLabel(p.method)} · reçu {p.receiptNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{formatFcfa(p.amount)}</span>
                    {p.status === 'ANNULE' && <Badge tone="danger">Annulé</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
    </section>
  );
};
