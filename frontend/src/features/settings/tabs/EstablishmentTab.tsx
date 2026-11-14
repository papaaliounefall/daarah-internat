import React, { useEffect, useState } from 'react';
import { plainErrorMessage } from '../../../lib/apiErrors';
import { useFetch } from '../../../hooks/useFetch';
import { getEstablishment, saveEstablishment } from '../../../services/site';
import { Button, ErrorState, Spinner, TextAreaField, TextField, useToast } from '../../../components/ui';
import type { Establishment } from '../../../types/site';
import { NAME_AR_MAX, headerLines, normalizeNameAr } from './siteContentUtils';

interface Form { name: string; nameAr: string; city: string; address: string; phone: string; email: string }

const toForm = (e: Establishment): Form => ({
  name: e.name ?? '', nameAr: e.nameAr ?? '', city: e.city ?? '', address: e.address ?? '', phone: e.phone ?? '', email: e.email ?? '',
});

/** Identité de l'établissement : utilisée sur les reçus, rapports et cartes (en-tête officiel). */
export const EstablishmentTab: React.FC = () => {
  const toast = useToast();
  const est = useFetch(getEstablishment, []);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (est.data) setForm(toForm(est.data)); }, [est.data]);

  if (est.error && !est.data) return <ErrorState message={est.error} onRetry={est.reload} />;
  if (!est.data || !form) return <Spinner />;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => (f ? { ...f, [k]: e.target.value } : f));

  const initial = toForm(est.data);
  const normalized = { ...form, nameAr: normalizeNameAr(form.nameAr) };
  const dirty = (Object.keys(initial) as (keyof Form)[]).some(k => normalized[k].trim() !== initial[k].trim());
  const nameAr = normalizeNameAr(form.nameAr);
  const tooLong = nameAr.length > NAME_AR_MAX;
  const nameMissing = !form.name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameMissing || tooLong) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveEstablishment({
        name: form.name.trim(), nameAr, city: form.city.trim(), address: form.address.trim(),
        phone: form.phone.trim(), email: form.email.trim(),
      });
      est.setData(saved);
      toast.success('Informations de l\'établissement enregistrées.');
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const lines = headerLines(form.nameAr);

  return (
    <form onSubmit={submit} noValidate className="panel max-w-2xl space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Établissement</h2>
        <p className="text-sm text-slate-500">Ces informations figurent sur les reçus, les rapports et les cartes imprimés.</p>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <TextField label="Nom de l'établissement" required value={form.name} onChange={set('name')} maxLength={200} error={nameMissing ? 'Le nom est obligatoire.' : undefined} />
      <div>
        <TextAreaField
          label="Nom en arabe (en-tête officiel)"
          rows={4}
          dir="rtl"
          lang="ar"
          style={{ fontFamily: 'var(--font-arabic)', fontSize: '1.1rem' }}
          value={form.nameAr}
          onChange={set('nameAr')}
          error={tooLong ? `L'en-tête ne doit pas dépasser ${NAME_AR_MAX} caractères.` : undefined}
          hint="Une ligne par ligne de l'en-tête : chaque retour à la ligne produit une ligne sur les documents."
        />
        {lines.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">{lines.length} ligne{lines.length > 1 ? 's' : ''} d'en-tête.</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Ville" value={form.city} onChange={set('city')} maxLength={100} />
        <TextField label="Téléphone" type="tel" value={form.phone} onChange={set('phone')} maxLength={50} />
      </div>
      <TextField label="Adresse" value={form.address} onChange={set('address')} maxLength={255} />
      <TextField label="E-mail" type="email" value={form.email} onChange={set('email')} />
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!dirty || nameMissing || tooLong}>Enregistrer</Button>
        <Button variant="secondary" disabled={!dirty || busy} onClick={() => setForm(initial)}>Annuler les modifications</Button>
      </div>
    </form>
  );
};
