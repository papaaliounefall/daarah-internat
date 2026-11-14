import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../stores/authStore';
import { createDiscount, listDiscounts, listFees, saveFee, setDiscountActive } from '../../services/finance';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatFcfa } from '../../lib/format';
import { Badge, Button, ConfirmDialog, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import {
  APPLIES_TO_LABEL, FEE_KIND_LABEL, type AppliesTo, type DiscountKind, type FeeKind, type FeeSchedule, type StudentDiscount,
} from '../../types/finance';
import type { AcademicYear } from '../../types';
import { parseAmount } from './financeUtils';
import { useYears } from './useYears';

const Section: React.FC<{ title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, description, actions, children }) => (
  <section className="mb-8">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

/* ------------------------------------------------------------------ Grille de frais */

const FeeModal: React.FC<{ fee: FeeSchedule | null; years: AcademicYear[]; defaultYear: string; onClose: () => void; onSaved: () => void }> = ({ fee, years, defaultYear, onClose, onSaved }) => {
  const toast = useToast();
  const [year, setYear] = useState(fee?.academicYear ?? defaultYear);
  const [name, setName] = useState(fee?.name ?? '');
  const [kind, setKind] = useState<FeeKind>(fee?.kind ?? 'MENSUALITE');
  const [amount, setAmount] = useState(fee ? String(fee.amount) : '');
  const [appliesTo, setAppliesTo] = useState<AppliesTo>(fee?.appliesTo ?? 'TOUS');
  const [dueDay, setDueDay] = useState(fee?.dueDay ? String(fee.dueDay) : '');
  const [active, setActive] = useState(fee?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = amount === '0' ? 0 : parseAmount(amount);
  const day = dueDay ? Number(dueDay) : null;
  const dayError = day !== null && (!Number.isInteger(day) || day < 1 || day > 28) ? 'Un jour entre 1 et 28.' : undefined;
  const valid = Boolean(name.trim() && year) && !Number.isNaN(parsed) && !dayError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveFee(fee?.id ?? null, { academicYear: year, name: name.trim(), kind, amount: parsed, appliesTo, dueDay: day, isActive: active });
      toast.success(fee ? 'Grille modifiée.' : 'Frais ajouté à la grille.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={fee ? 'Modifier un frais' : 'Ajouter un frais à la grille'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="fee-form" loading={busy} disabled={!valid}>Enregistrer</Button>
      </>
    }>
      <form id="fee-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Année scolaire" value={year} onChange={e => setYear(e.target.value)} required>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </SelectField>
          <SelectField label="Nature" value={kind} onChange={e => setKind(e.target.value as FeeKind)}>
            {(Object.keys(FEE_KIND_LABEL) as FeeKind[]).map(k => <option key={k} value={k}>{FEE_KIND_LABEL[k]}</option>)}
          </SelectField>
        </div>
        <TextField label="Intitulé" required value={name} onChange={e => setName(e.target.value)} maxLength={120} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Montant (FCFA)" inputMode="numeric" required value={amount} onChange={e => setAmount(e.target.value)} error={amount && Number.isNaN(parsed) ? 'Montant entier attendu.' : undefined} />
          <SelectField label="S'applique à" value={appliesTo} onChange={e => setAppliesTo(e.target.value as AppliesTo)}>
            {(Object.keys(APPLIES_TO_LABEL) as AppliesTo[]).map(a => <option key={a} value={a}>{APPLIES_TO_LABEL[a]}</option>)}
          </SelectField>
        </div>
        <TextField label="Jour d'échéance du mois (1 à 28)" inputMode="numeric" value={dueDay} onChange={e => setDueDay(e.target.value)} error={dayError} hint="Facultatif ; le 1er du mois par défaut." />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Grille active (prise en compte à la prochaine génération)
        </label>
        {fee && <p className="text-xs text-slate-500">Modifier un montant ne change pas les échéances déjà générées.</p>}
      </form>
    </Modal>
  );
};

const FeesSection: React.FC<{ isDirector: boolean; years: AcademicYear[]; yearId: string }> = ({ isDirector, years, yearId }) => {
  const state = useFetch(() => listFees(yearId || undefined), [yearId]);
  const [editing, setEditing] = useState<FeeSchedule | 'new' | null>(null);
  return (
    <Section
      title="Grille de frais"
      description="Frais appliqués aux talibés pour l'année choisie."
      actions={isDirector ? <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Ajouter un frais</Button> : undefined}
    >
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucun frais dans la grille" emptyHint={isDirector ? 'Ajoutez les frais (inscription, mensualité…) pour pouvoir générer les échéances.' : undefined}>
        {fees => (
          <TableWrap>
            <table className="table-base min-w-[40rem]">
              <thead><tr><th>Intitulé</th><th>Nature</th><th>S'applique à</th><th className="text-right">Montant</th><th>Échéance</th><th>Statut</th>{isDirector && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {fees.map(f => (
                  <tr key={f.id} className={f.isActive ? '' : 'text-slate-500'}>
                    <td className="font-medium">{f.name}</td>
                    <td>{FEE_KIND_LABEL[f.kind]}</td>
                    <td>{APPLIES_TO_LABEL[f.appliesTo]}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(f.amount)}</td>
                    <td>{f.dueDay ? `Le ${f.dueDay} du mois` : '—'}</td>
                    <td>{f.isActive ? <Badge tone="success">Active</Badge> : <Badge>Désactivée</Badge>}</td>
                    {isDirector && <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(f)}>Modifier</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {editing && <FeeModal fee={editing === 'new' ? null : editing} years={years} defaultYear={yearId} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </Section>
  );
};

/* ------------------------------------------------------------------ Réductions */

const DiscountModal: React.FC<{ years: AcademicYear[]; defaultYear: string; onClose: () => void; onSaved: () => void }> = ({ years, defaultYear, onClose, onSaved }) => {
  const toast = useToast();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [year, setYear] = useState(defaultYear);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<DiscountKind>('POURCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAmount(value);
  const valueError = value && (Number.isNaN(parsed) || parsed <= 0 || (kind === 'POURCENT' && parsed > 100))
    ? (kind === 'POURCENT' ? 'Un pourcentage entre 1 et 100.' : 'Un montant entier supérieur à 0.') : undefined;
  const valid = Boolean(student && year && label.trim() && parsed > 0) && !valueError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !student) return;
    setBusy(true);
    setError(null);
    try {
      await createDiscount({ student: student.id, academicYear: year, label: label.trim(), kind, value: parsed, reason: reason.trim() });
      toast.success('Réduction accordée.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Accorder une réduction" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="discount-form" loading={busy} disabled={!valid}>Accorder la réduction</Button>
      </>
    }>
      <form id="discount-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <StudentSelect value={student} onChange={setStudent} required />
        <SelectField label="Année scolaire" value={year} onChange={e => setYear(e.target.value)} required>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </SelectField>
        <TextField label="Intitulé" required value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex. : Fratrie" maxLength={120} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type" value={kind} onChange={e => setKind(e.target.value as DiscountKind)}>
            <option value="POURCENT">Pourcentage</option><option value="MONTANT">Montant fixe</option>
          </SelectField>
          <TextField label={kind === 'POURCENT' ? 'Pourcentage (%)' : 'Montant (FCFA)'} inputMode="numeric" required value={value} onChange={e => setValue(e.target.value)} error={valueError} />
        </div>
        <TextField label="Justification" value={reason} onChange={e => setReason(e.target.value)} />
        <p className="text-xs text-slate-500">La réduction s'applique aux mensualités générées ensuite. Le type et la valeur ne sont pas modifiables : désactivez puis recréez.</p>
      </form>
    </Modal>
  );
};

const DiscountsSection: React.FC<{ isDirector: boolean; years: AcademicYear[]; yearId: string }> = ({ isDirector, years, yearId }) => {
  const toast = useToast();
  const state = useFetch(() => listDiscounts(yearId || undefined), [yearId]);
  const [creating, setCreating] = useState(false);
  const [toDisable, setToDisable] = useState<StudentDiscount | null>(null);
  const [busy, setBusy] = useState(false);

  const disable = async () => {
    if (!toDisable) return;
    setBusy(true);
    try {
      await setDiscountActive(toDisable.id, false);
      toast.success('Réduction désactivée.');
      setToDisable(null);
      state.reload();
    } catch (e) {
      toast.error(plainErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Réductions"
      description="Réductions accordées par le directeur, appliquées aux mensualités."
      actions={isDirector ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Accorder une réduction</Button> : undefined}
    >
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucune réduction" emptyHint="Aucune réduction n'est enregistrée pour cette année.">
        {rows => (
          <TableWrap>
            <table className="table-base min-w-[40rem]">
              <thead><tr><th>Talibé</th><th>Intitulé</th><th className="text-right">Valeur</th><th>Accordée par</th><th>Statut</th>{isDirector && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id} className={d.isActive ? '' : 'text-slate-500'}>
                    <td><div className="font-medium">{d.studentName}</div><div className="font-mono text-xs text-slate-500">{d.registrationNumber}</div></td>
                    <td>{d.label}{d.reason && <div className="text-xs text-slate-500">{d.reason}</div>}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{d.kind === 'POURCENT' ? `${d.value} %` : formatFcfa(d.value)}</td>
                    <td>{d.approvedByName}</td>
                    <td>{d.isActive ? <Badge tone="success">Active</Badge> : <Badge>Désactivée</Badge>}</td>
                    {isDirector && (
                      <td className="text-right">
                        {d.isActive && <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setToDisable(d)}>Désactiver</Button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {creating && <DiscountModal years={years} defaultYear={yearId} onClose={() => setCreating(false)} onSaved={state.reload} />}
      {toDisable && (
        <ConfirmDialog
          title="Désactiver la réduction"
          message={<>La réduction « {toDisable.label} » de {toDisable.studentName} ne sera plus appliquée aux prochaines générations. Les échéances déjà générées restent inchangées.</>}
          confirmLabel="Désactiver la réduction"
          danger
          loading={busy}
          onConfirm={disable}
          onCancel={() => setToDisable(null)}
        />
      )}
    </Section>
  );
};

export const FeesTab: React.FC = () => {
  const isDirector = useAuth(s => s.user!.role === 'DIRECTEUR');
  const { years, currentId } = useYears();
  const [year, setYear] = useState<string | null>(null);
  const yearId = year ?? currentId;
  return (
    <div>
      <FilterBar>
        <SelectField label="Année scolaire" value={yearId} onChange={e => setYear(e.target.value)}>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (en cours)' : ''}</option>)}
        </SelectField>
      </FilterBar>
      {!isDirector && <p className="mb-4 text-sm text-slate-600">Consultation seule : la grille et les réductions sont gérées par le directeur.</p>}
      <FeesSection isDirector={isDirector} years={years} yearId={yearId} />
      <DiscountsSection isDirector={isDirector} years={years} yearId={yearId} />
    </div>
  );
};
