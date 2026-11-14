import React, { useEffect, useState } from 'react';
import { Paperclip, Plus, Printer } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { cancelDonation, createDonation, listAllSponsors, listDonations } from '../../services/social';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import { isoDate, parseAmount } from '../finance/financeUtils';
import { METHOD_LABEL, type PaymentMethod } from '../../types/finance';
import type { Donation, Sponsor } from '../../types/social';
import { printDonationReceipt } from './donationReceipt';

const PAGE_SIZE = 20;

const DonationModal: React.FC<{ sponsors: Sponsor[]; onClose: () => void; onSaved: () => void }> = ({ sponsors, onClose, onSaved }) => {
  const toast = useToast();
  const [sponsor, setSponsor] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(isoDate());
  const [method, setMethod] = useState<PaymentMethod>('ESPECES');
  const [purpose, setPurpose] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Donation | null>(null);
  const parsed = parseAmount(amount);
  const amountError = amount && !(parsed > 0) ? 'Saisissez un montant entier supérieur à 0.' : undefined;
  const valid = parsed > 0 && Boolean(date) && Boolean(sponsor || donorName.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const d = await createDonation({ donorName, donorPhone, sponsor: sponsor || undefined, amount: parsed, date, purpose, method }, file);
      setSaved(d);
      onSaved();
      toast.success(`Don enregistré (reçu ${d.receiptNumber}).`);
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Modal title="Don enregistré" onClose={onClose} footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button onClick={() => { if (!printDonationReceipt(saved)) toast.error('Autorisez les fenêtres pop-up pour imprimer le reçu.'); }}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimer le reçu
          </Button>
        </>
      }>
        <p className="text-sm">Reçu <strong>{saved.receiptNumber}</strong> — {formatFcfa(saved.amount)} de {saved.donorName}, le {formatDate(saved.date)}.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Enregistrer un don" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="donation-form" loading={busy} disabled={!valid}>Enregistrer le don</Button>
      </>
    }>
      <form id="donation-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <SelectField label="Parrain ou partenaire connu" value={sponsor} onChange={e => setSponsor(e.target.value)} hint="Laissez vide pour un donateur occasionnel.">
          <option value="">Donateur occasionnel</option>
          {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nom du donateur" required={!sponsor} value={donorName} onChange={e => setDonorName(e.target.value)} hint={sponsor ? 'Par défaut : le nom du parrain.' : undefined} maxLength={200} />
          <TextField label="Téléphone du donateur" type="tel" value={donorPhone} onChange={e => setDonorPhone(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Montant (FCFA)" inputMode="numeric" required value={amount} onChange={e => setAmount(e.target.value)} error={amountError} />
          <TextField label="Date du don" type="date" required value={date} max={isoDate()} onChange={e => setDate(e.target.value)} />
        </div>
        <SelectField label="Mode de versement" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} hint="Seule la saisie est enregistrée : aucun paiement n'est déclenché.">
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </SelectField>
        <TextField label="Objet du don" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Ex. : Zakat, nourriture, rénovation…" />
        <div>
          <label htmlFor="donation-file" className="mb-1 block text-sm font-medium">Justificatif (PDF ou image)</label>
          <input id="donation-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </form>
    </Modal>
  );
};

export const DonationsTab: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [method, setMethod] = useState('');
  const [cancelled, setCancelled] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Donation | null>(null);
  useEffect(() => { setPage(1); }, [dSearch, method, cancelled, dateFrom, dateTo]);

  const sponsors = useFetch(listAllSponsors, []);
  const list = useFetch(
    () => listDonations({ page, pageSize: PAGE_SIZE, search: dSearch, method, isCancelled: cancelled, dateFrom, dateTo }),
    [page, dSearch, method, cancelled, dateFrom, dateTo],
  );

  return (
    <div>
      <FilterBar actions={canWrite ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Enregistrer un don</Button> : undefined}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Reçu, donateur, objet" className="min-w-52" />
        <SelectField label="Mode" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </SelectField>
        <SelectField label="Statut" value={cancelled} onChange={e => setCancelled(e.target.value)}>
          <option value="">Tous</option><option value="false">Valides</option><option value="true">Annulés</option>
        </SelectField>
        <TextField label="Du" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField label="Au" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </FilterBar>
      {!canWrite && <p className="mb-3 text-sm text-slate-600">Consultation seule : l'enregistrement et l'annulation des dons sont réservés au directeur.</p>}

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun don" emptyHint="Aucun don ne correspond à ces critères.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[52rem]">
              <thead><tr><th>Reçu</th><th>Date</th><th>Donateur</th><th>Objet</th><th>Mode</th><th className="text-right">Montant</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.results.map(d => (
                  <tr key={d.id} className={d.isCancelled ? 'text-slate-500' : ''}>
                    <td className="whitespace-nowrap font-mono text-xs">{d.receiptNumber}</td>
                    <td className="whitespace-nowrap">{formatDate(d.date)}</td>
                    <td>
                      <div className="font-medium">{d.donorName}</div>
                      {d.sponsorName && d.sponsorName !== d.donorName && <div className="text-xs text-slate-500">Parrain : {d.sponsorName}</div>}
                      {d.attachmentUrl && (
                        <a href={d.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 underline">
                          <Paperclip className="h-3 w-3" aria-hidden /> Justificatif
                        </a>
                      )}
                    </td>
                    <td>{d.purpose || '—'}</td>
                    <td>{METHOD_LABEL[d.method]}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${d.isCancelled ? 'line-through' : ''}`}>{formatFcfa(d.amount)}</td>
                    <td>
                      {d.isCancelled ? <Badge tone="danger">Annulé</Badge> : <Badge tone="success">Valide</Badge>}
                      {d.isCancelled && <div className="mt-1 max-w-48 text-xs">Motif : {d.cancelReason}{d.cancelledByName ? ` (${d.cancelledByName})` : ''}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" aria-label={`Imprimer le reçu ${d.receiptNumber}`} onClick={() => { if (!printDonationReceipt(d)) toast.error('Autorisez les fenêtres pop-up pour imprimer le reçu.'); }}>
                        <Printer className="h-4 w-4" aria-hidden /> Reçu
                      </Button>
                      {canWrite && !d.isCancelled && (
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setCancelling(d)}>Annuler</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {creating && <DonationModal sponsors={sponsors.data ?? []} onClose={() => setCreating(false)} onSaved={list.reload} />}
      {cancelling && (
        <ReasonDialog
          title={`Annuler le don ${cancelling.receiptNumber}`}
          message={<>Le don de <strong>{formatFcfa(cancelling.amount)}</strong> de {cancelling.donorName} sortira des recettes. La ligne et le numéro de reçu sont conservés.</>}
          label="Motif de l'annulation"
          confirmLabel="Annuler le don"
          onConfirm={async reason => { await cancelDonation(cancelling.id, reason); toast.success('Don annulé.'); list.reload(); }}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
};
