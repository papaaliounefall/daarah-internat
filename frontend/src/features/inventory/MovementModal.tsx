import React, { useState } from 'react';
import { createStockMovement } from '../../services/inventory';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { isoDate } from '../finance/financeUtils';
import { MOVEMENT_KIND_LABEL, type InventoryItem, type MovementKind, type Supplier } from '../../types/inventory';
import { formatQuantity, movementError, parseQuantity, quantityAfter } from './inventoryUtils';

interface Props {
  items: InventoryItem[];
  suppliers: Supplier[];
  /** Article présélectionné (depuis la liste ou les alertes). */
  itemId?: string;
  kind?: MovementKind;
  onClose: () => void;
  onSaved: () => void;
}

/** Mouvement de stock : entrée, sortie, ou ajustement (quantité comptée, motif obligatoire). */
export const MovementModal: React.FC<Props> = ({ items, suppliers, itemId = '', kind: initialKind = 'ENTREE', onClose, onSaved }) => {
  const toast = useToast();
  const [item, setItem] = useState(itemId);
  const [kind, setKind] = useState<MovementKind>(initialKind);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(isoDate());
  const [supplier, setSupplier] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = items.find(i => i.id === item);
  const qty = parseQuantity(quantity);
  const problem = current && quantity ? movementError(kind, qty, current.quantity, reason, current.unit) : null;
  const quantityIssue = quantity && Number.isNaN(qty) ? 'Saisissez une quantité valide (deux décimales au plus).' : problem && !/motif/i.test(problem) ? problem : undefined;
  const reasonIssue = kind === 'AJUSTEMENT' && reason.length > 0 && reason.trim().length < 3 ? 'Au moins 3 caractères.' : undefined;
  const valid = Boolean(current) && quantity !== '' && !Number.isNaN(qty) && !movementError(kind, qty, current?.quantity ?? 0, reason, current?.unit ?? '') && Boolean(date);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !current) return;
    setBusy(true);
    setError(null);
    try {
      const m = await createStockMovement({ item: current.id, kind, quantity: qty, date, supplier: kind === 'ENTREE' && supplier ? supplier : null, reason: reason.trim() });
      toast.success(`${MOVEMENT_KIND_LABEL[kind].split(' ')[0]} enregistrée : ${current.name}, stock ${formatQuantity(m.quantityAfter, m.unit)}.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Enregistrer un mouvement de stock" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="movement-form" loading={busy} disabled={!valid}>Enregistrer le mouvement</Button>
      </>
    }>
      <form id="movement-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <SelectField label="Article" required value={item} onChange={e => setItem(e.target.value)}>
          <option value="">Choisir un article…</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name} — {formatQuantity(i.quantity, i.unit)}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type de mouvement" value={kind} onChange={e => setKind(e.target.value as MovementKind)}>
            {(Object.keys(MOVEMENT_KIND_LABEL) as MovementKind[]).map(k => <option key={k} value={k}>{MOVEMENT_KIND_LABEL[k]}</option>)}
          </SelectField>
          <TextField
            label={kind === 'AJUSTEMENT' ? `Quantité comptée${current?.unit ? ` (${current.unit})` : ''}` : `Quantité${current?.unit ? ` (${current.unit})` : ''}`}
            inputMode="decimal"
            required
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            error={quantityIssue}
            hint={current && !Number.isNaN(qty) && quantity && !quantityIssue
              ? `Stock après le mouvement : ${formatQuantity(quantityAfter(kind, current.quantity, qty), current.unit)}`
              : kind === 'AJUSTEMENT' ? "Indiquez la quantité réellement comptée lors de l'inventaire." : undefined}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date" type="date" required value={date} max={isoDate()} onChange={e => setDate(e.target.value)} />
          {kind === 'ENTREE' && (
            <SelectField label="Fournisseur" value={supplier} onChange={e => setSupplier(e.target.value)}>
              <option value="">Non précisé</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
          )}
        </div>
        <TextField
          label={kind === 'AJUSTEMENT' ? 'Motif (obligatoire)' : 'Motif ou destination'}
          required={kind === 'AJUSTEMENT'}
          value={reason}
          onChange={e => setReason(e.target.value)}
          error={reasonIssue}
          placeholder={kind === 'SORTIE' ? 'Ex. : cuisine, distribution…' : kind === 'AJUSTEMENT' ? 'Ex. : inventaire de fin de mois' : 'Ex. : achat au marché'}
        />
        <p className="text-xs text-slate-500">Un mouvement ne se modifie ni ne se supprime : en cas d'erreur, enregistrez un ajustement.</p>
      </form>
    </Modal>
  );
};
