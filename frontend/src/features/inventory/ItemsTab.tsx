import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listActiveItems, listCategories, listItems, listSuppliers, saveItem } from '../../services/inventory';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate } from '../../lib/format';
import { Badge, Button, ConfirmDialog, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import type { InventoryCategory, InventoryItem, MovementKind, Supplier } from '../../types/inventory';
import { STOCK_LEVEL_LABEL, formatQuantity, parseQuantity, stockLevel } from './inventoryUtils';
import { MovementModal } from './MovementModal';

const PAGE_SIZE = 20;
export const levelTone = (i: InventoryItem) => { const l = stockLevel(i); return l === 'out' ? 'danger' : l === 'low' ? 'warning' : 'success'; };

const ItemModal: React.FC<{ item: InventoryItem | null; categories: InventoryCategory[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }> = ({ item, categories, suppliers, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [threshold, setThreshold] = useState(item ? String(item.minThreshold) : '0');
  const [supplier, setSupplier] = useState(item?.defaultSupplier ?? '');
  const [initial, setInitial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const th = parseQuantity(threshold);
  const init = initial === '' ? 0 : parseQuantity(initial);
  const valid = Boolean(name.trim() && unit.trim()) && !Number.isNaN(th) && !Number.isNaN(init);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveItem(item?.id ?? null, {
        name: name.trim(), category: category || null, unit: unit.trim(), minThreshold: th, defaultSupplier: supplier || null,
        ...(item ? {} : { initialQuantity: init }),
      });
      toast.success(item ? 'Article modifié.' : 'Article créé.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Modifier l'article" : 'Nouvel article'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="item-form" loading={busy} disabled={!valid}>Enregistrer</Button>
      </>
    }>
      <form id="item-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom de l'article" required value={name} onChange={e => setName(e.target.value)} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Catégorie" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Sans catégorie</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <TextField label="Unité" required value={unit} onChange={e => setUnit(e.target.value)} placeholder="kg, sac, litre, pièce…" maxLength={30} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Seuil d'alerte" inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} error={Number.isNaN(th) ? 'Quantité invalide.' : undefined} hint="Une alerte apparaît quand le stock atteint ce seuil." />
          {!item && <TextField label="Stock initial" inputMode="decimal" value={initial} onChange={e => setInitial(e.target.value)} error={Number.isNaN(init) ? 'Quantité invalide.' : undefined} hint="Enregistré comme première entrée." />}
        </div>
        <SelectField label="Fournisseur habituel" value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">Aucun</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
        {item && <p className="text-xs text-slate-500">La quantité en stock ne se modifie que par un mouvement.</p>}
      </form>
    </Modal>
  );
};

export const ItemsTab: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [category, setCategory] = useState('');
  const [low, setLow] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const [moving, setMoving] = useState<{ itemId: string; kind: MovementKind } | null>(null);
  const [toDisable, setToDisable] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPage(1); }, [dSearch, category, low, active]);

  const refs = useFetch(async () => {
    const [categories, suppliers, items] = await Promise.all([listCategories(), listSuppliers(), listActiveItems()]);
    return { categories, suppliers, items };
  }, []);
  const list = useFetch(() => listItems({ page, pageSize: PAGE_SIZE, search: dSearch, category, low, isActive: active }), [page, dSearch, category, low, active]);
  const reloadAll = () => { list.reload(); refs.reload(); };

  const toggleActive = async (item: InventoryItem, isActive: boolean) => {
    setBusy(true);
    try {
      await saveItem(item.id, { name: item.name, category: item.category, unit: item.unit, minThreshold: item.minThreshold, defaultSupplier: item.defaultSupplier, isActive });
      toast.success(isActive ? 'Article réactivé.' : 'Article désactivé.');
      setToDisable(null);
      reloadAll();
    } catch (e) {
      toast.error(plainErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const categories = refs.data?.categories ?? [];
  const suppliers = refs.data?.suppliers ?? [];

  return (
    <div>
      <FilterBar actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouvel article</Button>}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom ou catégorie" className="min-w-52" />
        <SelectField label="Catégorie" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Toutes</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField label="Niveau" value={low} onChange={e => setLow(e.target.value)}>
          <option value="">Tous</option><option value="true">Stock bas ou rupture</option>
        </SelectField>
        <SelectField label="Statut" value={active} onChange={e => setActive(e.target.value)}>
          <option value="true">Actifs</option><option value="false">Désactivés</option><option value="">Tous</option>
        </SelectField>
      </FilterBar>

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun article" emptyHint="Créez les articles du magasin pour suivre leurs quantités.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[52rem]">
              <thead><tr><th>Article</th><th>Catégorie</th><th className="text-right">En stock</th><th className="text-right">Seuil</th><th>Niveau</th><th>Dernier réapprovisionnement</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.results.map(i => (
                  <tr key={i.id} className={i.isActive ? '' : 'text-slate-500'}>
                    <td className="font-medium">{i.name}{i.supplierName && <div className="text-xs font-normal text-slate-500">Fournisseur : {i.supplierName}</div>}</td>
                    <td>{i.categoryName || '—'}</td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatQuantity(i.quantity, i.unit)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatQuantity(i.minThreshold, i.unit)}</td>
                    <td>{i.isActive ? <Badge tone={levelTone(i)}>{STOCK_LEVEL_LABEL[stockLevel(i)]}</Badge> : <Badge>Désactivé</Badge>}</td>
                    <td className="whitespace-nowrap">{formatDate(i.lastRestocked) || '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      {i.isActive ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setMoving({ itemId: i.id, kind: 'ENTREE' })}>Mouvement</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>Modifier</Button>
                          <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setToDisable(i)}>Désactiver</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void toggleActive(i, true)}>Réactiver</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {editing && <ItemModal item={editing === 'new' ? null : editing} categories={categories} suppliers={suppliers} onClose={() => setEditing(null)} onSaved={reloadAll} />}
      {moving && <MovementModal items={refs.data?.items ?? []} suppliers={suppliers} itemId={moving.itemId} kind={moving.kind} onClose={() => setMoving(null)} onSaved={reloadAll} />}
      {toDisable && (
        <ConfirmDialog
          title="Désactiver l'article"
          message={<>« {toDisable.name} » n'acceptera plus de mouvement. Son historique est conservé et vous pourrez le réactiver.</>}
          confirmLabel="Désactiver l'article"
          danger
          loading={busy}
          onConfirm={() => void toggleActive(toDisable, false)}
          onCancel={() => setToDisable(null)}
        />
      )}
    </div>
  );
};
