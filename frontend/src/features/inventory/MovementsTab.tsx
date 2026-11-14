import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listActiveItems, listStockMovements, listSuppliers } from '../../services/inventory';
import { formatDate } from '../../lib/format';
import { Badge, Button, SelectField, TextField } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { MOVEMENT_KIND_LABEL, type MovementKind } from '../../types/inventory';
import { formatQuantity } from './inventoryUtils';
import { MovementModal } from './MovementModal';

const PAGE_SIZE = 25;
const kindTone = (k: MovementKind) => (k === 'ENTREE' ? 'success' : k === 'SORTIE' ? 'warning' : 'info');

export const MovementsTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [item, setItem] = useState('');
  const [kind, setKind] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  useEffect(() => { setPage(1); }, [dSearch, item, kind, dateFrom, dateTo]);

  const refs = useFetch(async () => ({ items: await listActiveItems(), suppliers: await listSuppliers() }), []);
  const list = useFetch(
    () => listStockMovements({ page, pageSize: PAGE_SIZE, search: dSearch, item, kind, dateFrom, dateTo }),
    [page, dSearch, item, kind, dateFrom, dateTo],
  );

  return (
    <div>
      <FilterBar actions={<Button onClick={() => setCreating(true)} disabled={!refs.data}><Plus className="h-4 w-4" aria-hidden /> Enregistrer un mouvement</Button>}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Article ou motif" className="min-w-48" />
        <SelectField label="Article" value={item} onChange={e => setItem(e.target.value)}>
          <option value="">Tous</option>
          {(refs.data?.items ?? []).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </SelectField>
        <SelectField label="Type" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(MOVEMENT_KIND_LABEL) as MovementKind[]).map(k => <option key={k} value={k}>{MOVEMENT_KIND_LABEL[k]}</option>)}
        </SelectField>
        <TextField label="Du" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField label="Au" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </FilterBar>

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun mouvement" emptyHint="Aucun mouvement de stock ne correspond à ces critères.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[52rem]">
              <thead><tr><th>Date</th><th>Article</th><th>Type</th><th className="text-right">Quantité</th><th className="text-right">Stock avant / après</th><th>Motif</th><th>Saisi par</th></tr></thead>
              <tbody>
                {data.results.map(m => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatDate(m.date)}</td>
                    <td className="font-medium">{m.itemName}{m.supplierName && <div className="text-xs font-normal text-slate-500">{m.supplierName}</div>}</td>
                    <td><Badge tone={kindTone(m.kind)}>{MOVEMENT_KIND_LABEL[m.kind].split(' ')[0]}</Badge></td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(m.quantity, m.unit)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(m.quantityBefore)} → {formatQuantity(m.quantityAfter, m.unit)}</td>
                    <td>{m.reason || '—'}</td>
                    <td>{m.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {creating && refs.data && (
        <MovementModal items={refs.data.items} suppliers={refs.data.suppliers} onClose={() => setCreating(false)} onSaved={() => { list.reload(); refs.reload(); }} />
      )}
    </div>
  );
};
