import React, { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import type { AxiosError } from 'axios';
import { errorMessage } from '../../lib/api';
import { Button, TextAreaField, TextField } from '../../components/ui';
import { sendVisit } from './publicApi';
import { todayIso } from './homeModel';

interface Values { name: string; phone: string; childName: string; desiredDate: string; message: string }
type Errors = Partial<Record<keyof Values, string>>;
const EMPTY: Values = { name: '', phone: '', childName: '', desiredDate: '', message: '' };

const SNAKE_TO_FIELD: Record<string, keyof Values> = {
  name: 'name', phone: 'phone', child_name: 'childName', desired_date: 'desiredDate', message: 'message',
};

export function validateVisit(v: Values, today = todayIso()): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Merci d'indiquer votre nom.";
  if (!/^[0-9+()./\-\s]{6,40}$/.test(v.phone.trim())) e.phone = 'Indiquez un numéro de téléphone valide.';
  if (!v.childName.trim()) e.childName = "Merci d'indiquer le nom de l'enfant.";
  if (!v.desiredDate) e.desiredDate = 'Choisissez une date.';
  else if (v.desiredDate < today) e.desiredDate = 'La date ne peut pas être passée.';
  return e;
}

/** Demande de visite d'un futur parent. Une demande de visite n'est pas une inscription. */
export const VisitForm: React.FC = () => {
  const [values, setValues] = useState<Values>(EMPTY);
  const [trap, setTrap] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues(v => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors(er => ({ ...er, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneral(null);
    const local = validateVisit(values);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await sendVisit({
        name: values.name.trim(), phone: values.phone.trim(), childName: values.childName.trim(),
        desiredDate: values.desiredDate, message: values.message.trim(), website: trap,
      });
      setSent(res.detail);
      setValues(EMPTY);
    } catch (err) {
      const r = (err as AxiosError<Record<string, unknown>>).response;
      if (r?.status === 429) {
        setGeneral('Vous avez envoyé plusieurs demandes en peu de temps. Merci de patienter avant de réessayer, ou de nous appeler.');
      } else if (r?.status === 400 && r.data && typeof r.data === 'object') {
        const fields: Errors = {};
        for (const [k, v] of Object.entries(r.data)) {
          const f = SNAKE_TO_FIELD[k];
          if (f) fields[f] = Array.isArray(v) ? String(v[0]) : String(v);
        }
        setErrors(fields);
        if (!Object.keys(fields).length) setGeneral(errorMessage(err));
      } else {
        setGeneral(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-md border border-brand-200 bg-brand-50 p-5 text-sm">
        <p className="font-semibold text-brand-800">Demande de visite envoyée</p>
        <p className="mt-1 text-slate-700">{sent}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setSent(null)}>Faire une autre demande</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Demande de visite">
      {general && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{general}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nom du parent" required autoComplete="name" maxLength={150} value={values.name} onChange={set('name')} error={errors.name} />
        <TextField label="Téléphone" required type="tel" autoComplete="tel" maxLength={40} value={values.phone} onChange={set('phone')} error={errors.phone} />
        <TextField label="Nom de l'enfant" required maxLength={150} value={values.childName} onChange={set('childName')} error={errors.childName} />
        <TextField label="Date souhaitée" required type="date" min={todayIso()} value={values.desiredDate} onChange={set('desiredDate')} error={errors.desiredDate} />
      </div>
      <TextAreaField label="Message (facultatif)" rows={3} maxLength={1000} value={values.message} onChange={set('message')} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Ne pas remplir ce champ<input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
      </div>
      <Button type="submit" loading={busy}><CalendarCheck className="h-4 w-4" aria-hidden /> Demander une visite</Button>
      <p className="text-xs text-slate-500">Une demande de visite n'est pas une inscription : l'administration vous recontacte pour convenir d'un rendez-vous.</p>
    </form>
  );
};
