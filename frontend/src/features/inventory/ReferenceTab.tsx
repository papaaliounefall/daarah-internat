import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { listCategories, listSuppliers, saveCategory, saveSupplier } from '../../services/inventory';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Button, Modal, TextField, useToast } from '../../components/ui';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import type { InventoryCategory, Supplier } from '../../types/inventory';

const CategoryModal: React.FC<{ category: InventoryCategory | null; onClose: () => void; onSaved: () => void }> = ({ category, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveCategory(category?.id ?? null, name.trim());
      toast.success(category ? 'Catégorie modifiée.' : 'Catégorie créée.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={category ? 'Renommer la catégorie' : 'Nouvelle catégorie'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="category-form" loading={busy} disabled={!name.trim()}>Enregistrer</Button>
      </>
    }>
      <form id="category-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom de la catégorie" required value={name} onChange={e => setName(e.target.value)} maxLength={100} />
      </form>
    </Modal>
  );
};

const SupplierModal: React.FC<{ supplier: Supplier | null; onClose: () => void; onSaved: () => void }> = ({ supplier, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveSupplier(supplier?.id ?? null, { name: name.trim(), phone: phone.trim(), address: address.trim() });
      toast.success(supplier ? 'Fournisseur modifié.' : 'Fournisseur ajouté.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="supplier-form" loading={busy} disabled={!name.trim()}>Enregistrer</Button>
      </>
    }>
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom" required value={name} onChange={e => setName(e.target.value)} maxLength={200} />
        <TextField label="Téléphone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        <TextField label="Adresse" value={address} onChange={e => setAddress(e.target.value)} />
      </form>
    </Modal>
  );
};

export const CategoriesTab: React.FC = () => {
  const state = useFetch(listCategories, []);
  const [editing, setEditing] = useState<InventoryCategory | 'new' | null>(null);
  return (
    <div>
      <FilterBar actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouvelle catégorie</Button>}>
        <p className="text-sm text-slate-600">Les catégories regroupent les articles (denrées, fournitures, entretien…).</p>
      </FilterBar>
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucune catégorie" emptyHint="Créez une première catégorie pour classer vos articles.">
        {rows => (
          <TableWrap>
            <table className="table-base min-w-[24rem]">
              <thead><tr><th>Catégorie</th><th className="text-right">Articles</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-right tabular-nums">{c.itemsCount}</td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Renommer</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {editing && <CategoryModal category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </div>
  );
};

export const SuppliersTab: React.FC = () => {
  const state = useFetch(listSuppliers, []);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  return (
    <div>
      <FilterBar actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau fournisseur</Button>}>
        <p className="text-sm text-slate-600">Fournisseurs proposés lors des entrées en stock.</p>
      </FilterBar>
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucun fournisseur" emptyHint="Ajoutez vos fournisseurs habituels.">
        {rows => (
          <TableWrap>
            <table className="table-base min-w-[32rem]">
              <thead><tr><th>Fournisseur</th><th>Téléphone</th><th>Adresse</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td className="whitespace-nowrap">{s.phone || '—'}</td>
                    <td>{s.address || '—'}</td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Modifier</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {editing && <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </div>
  );
};
