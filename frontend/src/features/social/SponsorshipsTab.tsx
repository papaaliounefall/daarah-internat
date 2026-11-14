import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listAllSponsors, listSponsorships, saveSponsorship } from '../../services/social';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, ConfirmDialog, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import { parseAmount, isoDate } from '../finance/financeUtils';
import { SPONSORSHIP_STATUS_LABEL, type Sponsor, type Sponsorship, type SponsorshipStatus } from '../../types/social';

const PAGE_SIZE = 20;
const tone = (s: SponsorshipStatus) => (s === 'ACTIF' ? 'success' : s === 'SUSPENDU' ? 'warning' : 'neutral');

const SponsorshipModal: React.FC<{ item: Sponsorship | null; sponsors: Sponsor[]; onClose: () => void; onSaved: () => void }> = ({ item, sponsors, onClose, onSaved }) => {
  const toast = useToast();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [sponsor, setSponsor] = useState(item?.sponsor ?? '');
  const [amount, setAmount] = useState(item ? String(item.monthlyAmount) : '');
  const [startDate, setStartDate] = useState(item?.startDate ?? isoDate());
  const [endDate, setEndDate] = useState(item?.endDate ?? '');
  const [status, setStatus] = useState<SponsorshipStatus>(item?.status ?? 'ACTIF');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = amount === '0' ? 0 : parseAmount(amount);
  const terminated = item?.status === 'TERMINE';
  const valid = (item !== null || Boolean(student && sponsor)) && !Number.isNaN(parsed) && Boolean(startDate);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (item) {
        await saveSponsorship(item.id, { monthlyAmount: parsed, status, endDate: endDate || null, notes });
      } else if (student) {
        await saveSponsorship(null, { student: student.id, sponsor, monthlyAmount: parsed, startDate, endDate: endDate || null, status, notes });
      }
      toast.success(item ? 'Parrainage modifié.' : 'Parrainage enregistré.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
      setConfirmEnd(false);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (item && status === 'TERMINE' && item.status !== 'TERMINE') setConfirmEnd(true);
    else void save();
  };

  return (
    <>
      <Modal title={item ? `Parrainage de ${item.studentName}` : 'Nouveau parrainage'} onClose={onClose} footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="sponsorship-form" loading={busy} disabled={!valid || terminated}>Enregistrer</Button>
        </>
      }>
        <form id="sponsorship-form" onSubmit={submit} className="space-y-4">
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {terminated && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Ce parrainage est terminé et ne peut plus être modifié : créez-en un nouveau.</p>}
          {item ? (
            <p className="text-sm"><span className="text-slate-500">Parrain : </span>{item.sponsorName}</p>
          ) : (
            <>
              <StudentSelect value={student} onChange={setStudent} required />
              <SelectField label="Parrain" required value={sponsor} onChange={e => setSponsor(e.target.value)}>
                <option value="">Choisir un parrain…</option>
                {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectField>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Montant mensuel (FCFA)" inputMode="numeric" required value={amount} onChange={e => setAmount(e.target.value)} error={amount && Number.isNaN(parsed) ? 'Montant entier attendu.' : undefined} disabled={terminated} />
            <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value as SponsorshipStatus)} disabled={terminated}>
              {(Object.keys(SPONSORSHIP_STATUS_LABEL) as SponsorshipStatus[]).map(s => <option key={s} value={s}>{SPONSORSHIP_STATUS_LABEL[s]}</option>)}
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Date de début" type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} disabled={item !== null} />
            <TextField label="Date de fin" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} disabled={terminated} hint="Facultative ; renseignée automatiquement à la clôture." />
          </div>
          <TextAreaField label="Remarques" value={notes} onChange={e => setNotes(e.target.value)} disabled={terminated} />
        </form>
      </Modal>
      {confirmEnd && item && (
        <ConfirmDialog
          title="Terminer le parrainage"
          message={<>Le parrainage de {item.studentName} par {item.sponsorName} sera clos. Un parrainage terminé ne peut pas être réactivé : il faudra en créer un nouveau.</>}
          confirmLabel="Terminer le parrainage"
          danger
          loading={busy}
          onConfirm={() => void save()}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </>
  );
};

export const SponsorshipsTab: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [status, setStatus] = useState('ACTIF');
  const [sponsor, setSponsor] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Sponsorship | 'new' | null>(null);
  useEffect(() => { setPage(1); }, [dSearch, status, sponsor]);

  const sponsors = useFetch(listAllSponsors, []);
  const list = useFetch(() => listSponsorships({ page, pageSize: PAGE_SIZE, search: dSearch, status, sponsor }), [page, dSearch, status, sponsor]);

  return (
    <div>
      <FilterBar actions={canWrite ? <Button onClick={() => setEditing('new')} disabled={!sponsors.data}><Plus className="h-4 w-4" aria-hidden /> Nouveau parrainage</Button> : undefined}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Talibé, matricule, parrain" className="min-w-52" />
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(SPONSORSHIP_STATUS_LABEL) as SponsorshipStatus[]).map(s => <option key={s} value={s}>{SPONSORSHIP_STATUS_LABEL[s]}</option>)}
        </SelectField>
        <SelectField label="Parrain" value={sponsor} onChange={e => setSponsor(e.target.value)}>
          <option value="">Tous</option>
          {(sponsors.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
      </FilterBar>
      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun parrainage" emptyHint="Aucun parrainage ne correspond à ces critères.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[48rem]">
              <thead><tr><th>Talibé</th><th>Parrain</th><th className="text-right">Montant mensuel</th><th>Début</th><th>Fin</th><th>Statut</th>{canWrite && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {data.results.map(s => (
                  <tr key={s.id}>
                    <td><div className="font-medium">{s.studentName}</div><div className="font-mono text-xs text-slate-500">{s.registrationNumber}</div></td>
                    <td>{s.sponsorName}{s.sponsorPhone && <div className="text-xs text-slate-500">{s.sponsorPhone}</div>}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(s.monthlyAmount)}</td>
                    <td className="whitespace-nowrap">{formatDate(s.startDate)}</td>
                    <td className="whitespace-nowrap">{formatDate(s.endDate) || '—'}</td>
                    <td><Badge tone={tone(s.status)}>{SPONSORSHIP_STATUS_LABEL[s.status]}</Badge></td>
                    {canWrite && <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(s)}>{s.status === 'TERMINE' ? 'Voir' : 'Modifier'}</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {editing && <SponsorshipModal item={editing === 'new' ? null : editing} sponsors={sponsors.data ?? []} onClose={() => setEditing(null)} onSaved={list.reload} />}
    </div>
  );
};
