import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../../hooks/useFetch';
import { getInventorySummary } from '../../services/inventory';
import { formatDate, formatNumber } from '../../lib/format';
import { Badge } from '../../components/ui';
import { Async, Stat, TableWrap } from '../../components/ops/Async';
import { MOVEMENT_KIND_LABEL } from '../../types/inventory';
import { formatQuantity } from './inventoryUtils';

export const DashboardTab: React.FC<{ onOpenAlerts: () => void }> = ({ onOpenAlerts }) => {
  const state = useFetch(getInventorySummary, []);
  return (
    <Async state={state}>
      {s => {
        const chart = s.categories.map(c => ({ name: c.name, normal: Math.max(0, c.items - c.lowItems), low: c.lowItems }));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Articles actifs" value={formatNumber(s.activeItems)} hint={`${formatNumber(s.totalItems)} au total`} />
              <Stat label="Stock bas" value={formatNumber(s.lowStockCount)} tone={s.lowStockCount > 0 ? 'danger' : 'default'} hint="Au seuil ou en dessous" />
              <Stat label="En rupture" value={formatNumber(s.outOfStockCount)} tone={s.outOfStockCount > 0 ? 'danger' : 'default'} />
              <Stat label="Mouvements (30 jours)" value={formatNumber(s.last30Days.entries + s.last30Days.exits + s.last30Days.adjustments)} hint={`${s.last30Days.entries} entrées · ${s.last30Days.exits} sorties · ${s.last30Days.adjustments} ajustements`} />
            </div>
            {s.lowStockCount > 0 && (
              <p role="status" className="rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
                {s.lowStockCount} article{s.lowStockCount > 1 ? 's sont' : ' est'} au seuil d'alerte.{' '}
                <button type="button" className="font-medium underline" onClick={onOpenAlerts}>Voir les alertes</button>
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="panel p-4" aria-label="Articles par catégorie">
                <h3 className="mb-3 text-sm font-semibold">Articles par catégorie</h3>
                {chart.length === 0 ? <p className="text-sm text-slate-500">Aucune catégorie.</p> : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} interval={0} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="normal" name="Niveau normal" stackId="a" fill="#176a4d" />
                        <Bar dataKey="low" name="Stock bas" stackId="a" fill="#b3372f" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
              <section className="panel p-4" aria-label="Quantités sur 30 jours">
                <h3 className="mb-3 text-sm font-semibold">30 derniers jours (depuis le {formatDate(s.last30Days.since)})</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Quantité entrée</dt><dd className="text-right tabular-nums">{formatQuantity(s.last30Days.quantityIn)}</dd>
                  <dt className="text-slate-500">Quantité sortie</dt><dd className="text-right tabular-nums">{formatQuantity(s.last30Days.quantityOut)}</dd>
                  <dt className="text-slate-500">Ajustements d'inventaire</dt><dd className="text-right tabular-nums">{s.last30Days.adjustments}</dd>
                </dl>
                <p className="mt-3 text-xs text-slate-500">Quantités cumulées, toutes unités confondues : à lire comme un indicateur d'activité.</p>
              </section>
            </div>
            <section aria-label="Derniers mouvements">
              <h3 className="mb-2 text-sm font-semibold">Derniers mouvements</h3>
              {s.recentMovements.length === 0 ? <p className="text-sm text-slate-500">Aucun mouvement enregistré.</p> : (
                <TableWrap>
                  <table className="table-base min-w-[36rem]">
                    <thead><tr><th>Date</th><th>Article</th><th>Type</th><th className="text-right">Quantité</th><th className="text-right">Stock après</th></tr></thead>
                    <tbody>
                      {s.recentMovements.map(m => (
                        <tr key={m.id}>
                          <td className="whitespace-nowrap">{formatDate(m.date)}</td>
                          <td className="font-medium">{m.itemName}</td>
                          <td><Badge tone={m.kind === 'ENTREE' ? 'success' : m.kind === 'SORTIE' ? 'warning' : 'info'}>{MOVEMENT_KIND_LABEL[m.kind].split(' ')[0]}</Badge></td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(m.quantity, m.unit)}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(m.quantityAfter, m.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </section>
          </div>
        );
      }}
    </Async>
  );
};
