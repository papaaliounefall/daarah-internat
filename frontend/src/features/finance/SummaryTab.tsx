import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../../hooks/useFetch';
import { getSummary } from '../../services/finance';
import { openFinanceReport } from '../../services/documents';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatFcfa } from '../../lib/format';
import { Button, TextField, useToast } from '../../components/ui';
import { Async, FilterBar, Stat } from '../../components/ops/Async';
import { compactFcfa, monthShort, monthToDate, periodError, sharePercent, yearToDate } from './financeUtils';
import type { BreakdownRow, FinanceSummary } from '../../types/finance';

const BRAND = '#176a4d';
const GOLD = '#b08d45';

const Breakdown: React.FC<{ title: string; rows: BreakdownRow[]; total: number }> = ({ title, rows, total }) => (
  <section className="panel p-4" aria-label={title}>
    <h3 className="mb-3 text-sm font-semibold">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-slate-500">Aucune recette sur la période.</p>
    ) : (
      <ul className="space-y-2.5">
        {rows.map(r => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{r.label} <span className="text-xs text-slate-500">({r.count})</span></span>
              <span className="tabular-nums font-medium">{formatFcfa(r.amount)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100" role="presentation">
              <div className="h-full rounded bg-brand-600" style={{ width: `${sharePercent(r.amount, total)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const Content: React.FC<{ s: FinanceSummary }> = ({ s }) => {
  const data = s.monthly.map(m => ({ ...m, label: monthShort(m.month) }));
  const tooltipFmt = (v: unknown) => formatFcfa(Number(v));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recettes" value={formatFcfa(s.totalRevenue)} hint={`Paiements ${formatFcfa(s.totalPayments)} · dons ${formatFcfa(s.totalDonations)}`} />
        <Stat label="Dépenses validées" value={formatFcfa(s.totalExpenses)} hint={s.pendingExpensesCount > 0 ? `${s.pendingExpensesCount} en attente (${formatFcfa(s.pendingExpensesAmount)})` : undefined} />
        <Stat label="Solde" value={formatFcfa(s.balance)} tone={s.balance < 0 ? 'danger' : 'success'} hint="Recettes moins dépenses" />
        <Stat label="Impayés" value={formatFcfa(s.outstanding)} tone={s.outstanding > 0 ? 'danger' : 'default'} hint={`${s.outstandingDuesCount} échéance(s) · ${s.studentsInArrears} talibé(s)`} />
      </div>

      <section className="panel p-4" aria-label="Évolution mensuelle">
        <h3 className="mb-3 text-sm font-semibold">Évolution mensuelle</h3>
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune donnée sur la période.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={compactFcfa} width={56} />
                <Tooltip formatter={tooltipFmt} labelFormatter={l => String(l)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Recettes" fill={BRAND} radius={[2, 2, 0, 0]} />
                <Bar dataKey="expenses" name="Dépenses" fill={GOLD} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {data.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="table-base">
              <caption className="sr-only">Détail mensuel</caption>
              <thead><tr><th>Mois</th><th className="text-right">Paiements</th><th className="text-right">Dons</th><th className="text-right">Dépenses</th><th className="text-right">Solde</th></tr></thead>
              <tbody>
                {data.map(m => (
                  <tr key={m.month}>
                    <td>{m.label}</td>
                    <td className="text-right tabular-nums">{formatFcfa(m.payments)}</td>
                    <td className="text-right tabular-nums">{formatFcfa(m.donations)}</td>
                    <td className="text-right tabular-nums">{formatFcfa(m.expenses)}</td>
                    <td className={`text-right tabular-nums ${m.balance < 0 ? 'text-danger' : ''}`}>{formatFcfa(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="Recettes par nature" rows={s.revenueByType} total={s.totalRevenue} />
        <Breakdown title="Recettes par mode de paiement" rows={s.revenueByMethod} total={s.totalRevenue} />
      </div>
    </div>
  );
};

export const SummaryTab: React.FC = () => {
  const toast = useToast();
  const [period, setPeriod] = useState(yearToDate());
  const [exporting, setExporting] = useState(false);
  const error = periodError(period.from, period.to);
  const state = useFetch<FinanceSummary | null>(
    () => (error ? Promise.resolve(null) : getSummary(period.from, period.to)),
    [period.from, period.to],
  );

  const exportPdf = async () => {
    setExporting(true);
    try {
      await openFinanceReport(period.from, period.to);
    } catch (e) {
      toast.error(plainErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <FilterBar
        actions={<Button variant="secondary" onClick={exportPdf} loading={exporting} disabled={!!error}><Download className="h-4 w-4" aria-hidden /> Exporter le rapport en PDF</Button>}
      >
        <TextField label="Du" type="date" value={period.from} max={period.to || undefined} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} />
        <TextField label="Au" type="date" value={period.to} min={period.from || undefined} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPeriod(yearToDate())}>Année en cours</Button>
          <Button variant="ghost" onClick={() => setPeriod(monthToDate())}>Mois en cours</Button>
        </div>
      </FilterBar>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {!error && (
        <Async state={state}>
          {s => (s ? <Content s={s} /> : null)}
        </Async>
      )}
    </div>
  );
};
