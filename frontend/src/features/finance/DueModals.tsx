import React, { useState } from 'react';
import { createDue, generateDues } from '../../services/finance';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import { FEE_KIND_LABEL, type FeeKind, type GenerateDuesResult } from '../../types/finance';
import type { AcademicYear } from '../../types';
import { isoDate, parseAmount } from './financeUtils';

interface CommonProps { years: AcademicYear[]; defaultYear: string; onClose: () => void }

/** Frais ponctuel (exceptionnel, inscription tardive…) pour un talibé. */
export const DueFormModal: React.FC<CommonProps & { onSaved: () => void }> = ({ years, defaultYear, onClose, onSaved }) => {
  const toast = useToast();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [year, setYear] = useState(defaultYear);
  const [kind, setKind] = useState<FeeKind>('EXCEPTIONNEL');
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState(isoDate());
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAmount(amount);
  const amountError = amount && (!(parsed > 0)) ? 'Saisissez un montant entier supérieur à 0.' : undefined;
  const valid = Boolean(student && year && label.trim() && dueDate && parsed > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !student) return;
    setBusy(true);
    setError(null);
    try {
      await createDue({ student: student.id, academicYear: year, kind, label: label.trim(), dueDate, amount: parsed });
      toast.success('Frais ajouté.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Ajouter un frais ponctuel" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="due-form" loading={busy} disabled={!valid}>Ajouter le frais</Button>
      </>
    }>
      <form id="due-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <StudentSelect value={student} onChange={setStudent} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Année scolaire" value={year} onChange={e => setYear(e.target.value)} required>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </SelectField>
          <SelectField label="Nature" value={kind} onChange={e => setKind(e.target.value as FeeKind)}>
            {(Object.keys(FEE_KIND_LABEL) as FeeKind[]).map(k => <option key={k} value={k}>{FEE_KIND_LABEL[k]}</option>)}
          </SelectField>
        </div>
        <TextField label="Libellé" required value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex. : Tenue de fête" maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Montant (FCFA)" inputMode="numeric" required value={amount} onChange={e => setAmount(e.target.value)} error={amountError} />
          <TextField label="Date d'échéance" type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
};

/** Génération (idempotente) des échéances de l'année à partir de la grille de frais. */
export const GenerateDuesModal: React.FC<CommonProps & { onDone: () => void }> = ({ years, defaultYear, onClose, onDone }) => {
  const toast = useToast();
  const [year, setYear] = useState(defaultYear);
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateDuesResult | null>(null);
  const windowError = fromMonth && toMonth && fromMonth > toMonth ? 'Le mois de début doit précéder le mois de fin.' : undefined;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await generateDues({ academicYear: year, fromMonth, toMonth });
      setResult(r);
      onDone();
      toast.success(`${r.created} échéance(s) créée(s).`);
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Échéances générées" onClose={onClose} footer={<Button onClick={onClose}>Fermer</Button>}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Créées</dt><dd className="text-right font-medium tabular-nums">{result.created}</dd>
          <dt className="text-slate-500">Déjà existantes</dt><dd className="text-right tabular-nums">{result.alreadyExisting}</dd>
          <dt className="text-slate-500">Ignorées (montant nul après réduction)</dt><dd className="text-right tabular-nums">{result.zeroAmountSkipped}</dd>
          <dt className="text-slate-500">Talibés concernés</dt><dd className="text-right tabular-nums">{result.students}</dd>
          <dt className="text-slate-500">Grilles appliquées</dt><dd className="text-right tabular-nums">{result.schedules}</dd>
          <dt className="text-slate-500">Mois couverts</dt><dd className="text-right tabular-nums">{result.months.length}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-500">La génération peut être relancée sans risque de doublon : une échéance déjà générée n'est jamais recréée ni modifiée.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Générer les échéances" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={run} loading={busy} disabled={!year || Boolean(windowError)}>Générer les échéances</Button>
      </>
    }>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Crée les mensualités, frais d'inscription et frais exceptionnels des talibés inscrits, selon la grille de frais active
          (réductions comprises). Les échéances déjà générées ne sont pas modifiées.
        </p>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <SelectField label="Année scolaire" value={year} onChange={e => setYear(e.target.value)}>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Du mois (facultatif)" type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)} />
          <TextField label="Au mois (facultatif)" type="month" value={toMonth} onChange={e => setToMonth(e.target.value)} error={windowError} />
        </div>
        <p className="text-xs text-slate-500">Sans fenêtre de mois, toute l'année scolaire est couverte.</p>
      </div>
    </Modal>
  );
};
