import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { createPayment, listStudentDues } from '../../services/finance';
import { openReceipt } from '../../services/documents';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, formatFcfa } from '../../lib/format';
import { Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import {
  FEE_KIND_LABEL, METHOD_LABEL, type Due, type FeeKind, type Payment, type PaymentMethod,
} from '../../types/finance';
import { isoDate, parseAmount, payableDues, paymentAmountError, remainingBalance } from './financeUtils';

interface Props {
  /** Échéance à encaisser (le talibé est alors fixé). */
  initialDue?: Due;
  onClose: () => void;
  onSaved: () => void;
}

/** Saisie d'un paiement : talibé, échéance liée (facultative), mode, référence saisie, montant ≤ solde restant. */
export const PaymentFormModal: React.FC<Props> = ({ initialDue, onClose, onSaved }) => {
  const toast = useToast();
  const [student, setStudent] = useState<PickedStudent | null>(
    initialDue ? { id: initialDue.student, fullName: initialDue.studentName, registrationNumber: initialDue.registrationNumber } : null,
  );
  const [dues, setDues] = useState<Due[]>(initialDue ? [initialDue] : []);
  const [duesLoading, setDuesLoading] = useState(false);
  const [dueId, setDueId] = useState(initialDue?.id ?? '');
  const [amount, setAmount] = useState(initialDue ? String(remainingBalance(initialDue)) : '');
  const [method, setMethod] = useState<PaymentMethod>('ESPECES');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(isoDate());
  const [notes, setNotes] = useState('');
  const [feeKind, setFeeKind] = useState<FeeKind>('MENSUALITE');
  const [periodLabel, setPeriodLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Payment | null>(null);
  const [printing, setPrinting] = useState(false);

  // Échéances encaissables du talibé choisi.
  useEffect(() => {
    if (initialDue || !student) { if (!initialDue) { setDues([]); setDueId(''); } return; }
    let live = true;
    setDuesLoading(true);
    listStudentDues(student.id)
      .then(list => { if (live) { setDues(payableDues(list)); setDueId(''); } })
      .catch(e => { if (live) toast.error(plainErrorMessage(e)); })
      .finally(() => { if (live) setDuesLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  const due = dues.find(d => d.id === dueId) ?? null;
  const balance = due ? remainingBalance(due) : null;
  const parsed = parseAmount(amount);
  const amountError = amount ? paymentAmountError(parsed, balance, formatFcfa) : null;
  const canSubmit = Boolean(student) && Boolean(amount) && !amountError && Boolean(date);

  const chooseDue = (id: string) => {
    setDueId(id);
    const d = dues.find(x => x.id === id);
    if (d) setAmount(String(remainingBalance(d)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !student) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createPayment({
        student: student.id,
        due: dueId || undefined,
        amount: parsed,
        method,
        date,
        reference,
        notes,
        ...(dueId ? {} : { feeKind, periodLabel }),
      });
      setSaved(p);
      onSaved();
      toast.success(`Paiement enregistré (reçu ${p.receiptNumber}).`);
    } catch (err) {
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const printReceipt = async () => {
    if (!saved) return;
    setPrinting(true);
    try { await openReceipt(saved.id, saved.receiptNumber); } catch (e) { toast.error(plainErrorMessage(e)); } finally { setPrinting(false); }
  };

  if (saved) {
    return (
      <Modal title="Paiement enregistré" onClose={onClose} footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button onClick={printReceipt} loading={printing}><Printer className="h-4 w-4" aria-hidden /> Ouvrir le reçu PDF</Button>
        </>
      }>
        <p className="text-sm">
          Reçu <strong>{saved.receiptNumber}</strong> — {formatFcfa(saved.amount)} versés par {saved.studentName} le {formatDate(saved.date)} ({METHOD_LABEL[saved.method]}).
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Enregistrer un paiement"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="payment-form" loading={busy} disabled={!canSubmit}>Enregistrer le paiement</Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <StudentSelect value={student} onChange={setStudent} required disabled={Boolean(initialDue)} />
        {student && (
          <SelectField
            label="Échéance payée"
            value={dueId}
            onChange={e => chooseDue(e.target.value)}
            disabled={Boolean(initialDue) || duesLoading}
            hint={duesLoading ? 'Chargement des échéances…' : dues.length === 0 ? 'Aucune échéance à solder : le paiement sera libre (acompte, inscription…).' : undefined}
          >
            <option value="">Paiement libre (sans échéance)</option>
            {dues.map(d => (
              <option key={d.id} value={d.id}>
                {d.label}{d.period ? ` — ${d.period}` : ''} — échéance {formatDate(d.dueDate)} — reste {formatFcfa(remainingBalance(d))}
              </option>
            ))}
          </SelectField>
        )}
        {student && !dueId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Nature du paiement" value={feeKind} onChange={e => setFeeKind(e.target.value as FeeKind)}>
              {(Object.keys(FEE_KIND_LABEL) as FeeKind[]).map(k => <option key={k} value={k}>{FEE_KIND_LABEL[k]}</option>)}
            </SelectField>
            <TextField label="Période concernée" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="Ex. : Novembre 2026" maxLength={60} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Montant versé (FCFA)"
            inputMode="numeric"
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
            error={amountError ?? undefined}
            hint={balance !== null && !amountError ? `Solde restant de l'échéance : ${formatFcfa(balance)}` : undefined}
          />
          <TextField label="Date du paiement" type="date" required value={date} max={isoDate()} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Mode de paiement" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </SelectField>
          <TextField
            label="Référence de la transaction"
            value={reference}
            onChange={e => setReference(e.target.value)}
            maxLength={80}
            hint={method === 'ESPECES' ? 'Facultative pour un paiement en espèces.' : 'À recopier depuis le message de confirmation ou le relevé.'}
          />
        </div>
        <TextAreaField label="Remarques" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </form>
    </Modal>
  );
};
