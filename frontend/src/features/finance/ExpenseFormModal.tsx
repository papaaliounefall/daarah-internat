import React, { useState } from 'react';
import { saveExpense } from '../../services/finance';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatFcfa } from '../../lib/format';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { EXPENSE_CATEGORY_LABEL, type Expense, type ExpenseCategory } from '../../types/finance';
import { isoDate, parseAmount } from './financeUtils';

/** Saisie / correction limitée d'une dépense : le montant et la date ne se modifient plus après création. */
export const ExpenseFormModal: React.FC<{ expense: Expense | null; onClose: () => void; onSaved: () => void }> = ({ expense, onClose, onSaved }) => {
  const toast = useToast();
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'AUTRE');
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [date, setDate] = useState(expense?.date ?? isoDate());
  const [paidTo, setPaidTo] = useState(expense?.paidTo ?? '');
  const [reference, setReference] = useState(expense?.reference ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseAmount(amount);
  const amountError = !expense && amount && !(parsed > 0) ? 'Saisissez un montant entier supérieur à 0.' : undefined;
  const valid = Boolean(title.trim()) && (expense !== null || (parsed > 0 && Boolean(date)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const base = { category, title: title.trim(), paidTo: paidTo.trim(), reference: reference.trim() };
      const saved = await saveExpense(expense?.id ?? null, expense ? base : { ...base, amount: parsed, date }, file);
      toast.success(
        expense ? 'Dépense modifiée.'
          : saved.status === 'EN_ATTENTE' ? 'Dépense enregistrée : en attente de validation par le directeur.'
          : 'Dépense enregistrée.',
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={expense ? 'Modifier la dépense' : 'Saisir une dépense'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="expense-form" loading={busy} disabled={!valid}>{expense ? 'Enregistrer les modifications' : 'Enregistrer la dépense'}</Button>
      </>
    }>
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Intitulé" required value={title} onChange={e => setTitle(e.target.value)} maxLength={255} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Catégorie" value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>
            {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </SelectField>
          <TextField label="Bénéficiaire" value={paidTo} onChange={e => setPaidTo(e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Montant (FCFA)" inputMode="numeric" required value={amount} onChange={e => setAmount(e.target.value)}
            disabled={expense !== null} error={amountError}
            hint={expense ? `Montant non modifiable (${formatFcfa(expense.amount)}). En cas d'erreur, annulez la dépense et saisissez-en une nouvelle.` : undefined}
          />
          <TextField label="Date de la dépense" type="date" required value={date} max={isoDate()} disabled={expense !== null} onChange={e => setDate(e.target.value)} />
        </div>
        <TextField label="Référence (facture, bon…)" value={reference} onChange={e => setReference(e.target.value)} maxLength={80} />
        <div>
          <label htmlFor="expense-file" className="mb-1 block text-sm font-medium">Justificatif (PDF ou image)</label>
          <input id="expense-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {expense?.attachmentUrl && !file && <p className="mt-1 text-xs text-slate-500">Un justificatif est déjà joint ; en choisir un nouveau le remplace.</p>}
        </div>
      </form>
    </Modal>
  );
};
