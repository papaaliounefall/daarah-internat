import React, { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { getAlerts, listActiveItems, listSuppliers } from '../../services/inventory';
import { formatDate } from '../../lib/format';
import { Badge, Button } from '../../components/ui';
import { Async, TableWrap } from '../../components/ops/Async';
import { STOCK_LEVEL_LABEL, formatQuantity, stockLevel } from './inventoryUtils';
import { MovementModal } from './MovementModal';
import { levelTone } from './ItemsTab';

/** Articles actifs dont la quantité est au seuil d'alerte ou en dessous. */
export const AlertsTab: React.FC = () => {
  const alerts = useFetch(getAlerts, []);
  const refs = useFetch(async () => ({ items: await listActiveItems(), suppliers: await listSuppliers() }), []);
  const [restock, setRestock] = useState<string | null>(null);

  return (
    <div>
      <Async state={alerts} isEmpty={d => d.results.length === 0} emptyTitle="Aucune alerte" emptyHint="Tous les articles actifs sont au-dessus de leur seuil.">
        {data => (
          <>
            <p className="mb-3 text-sm text-slate-600">{data.count} article{data.count > 1 ? 's' : ''} à réapprovisionner, du plus urgent au moins urgent.</p>
            <TableWrap>
              <table className="table-base min-w-[40rem]">
                <thead><tr><th>Article</th><th>Catégorie</th><th className="text-right">En stock</th><th className="text-right">Seuil</th><th>Niveau</th><th>Dernière entrée</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>
                  {data.results.map(i => (
                    <tr key={i.id}>
                      <td className="font-medium">{i.name}</td>
                      <td>{i.categoryName || '—'}</td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatQuantity(i.quantity, i.unit)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(i.minThreshold, i.unit)}</td>
                      <td><Badge tone={levelTone(i)}>{STOCK_LEVEL_LABEL[stockLevel(i)]}</Badge></td>
                      <td className="whitespace-nowrap">{formatDate(i.lastRestocked) || '—'}</td>
                      <td className="text-right"><Button variant="ghost" size="sm" disabled={!refs.data} onClick={() => setRestock(i.id)}>Enregistrer une entrée</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </Async>
      {restock && refs.data && (
        <MovementModal items={refs.data.items} suppliers={refs.data.suppliers} itemId={restock} kind="ENTREE" onClose={() => setRestock(null)} onSaved={() => { alerts.reload(); refs.reload(); }} />
      )}
    </div>
  );
};
