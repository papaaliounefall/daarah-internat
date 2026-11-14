import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listSponsors, saveSponsor } from '../../services/social';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Badge, Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { SPONSOR_KIND_LABEL, type Sponsor, type SponsorKind } from '../../types/social';

const PAGE_SIZE = 20;

const SponsorModal: React.FC<{ sponsor: Sponsor | null; onClose: () => void; onSaved: () => void }> = ({ sponsor, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(sponsor?.name ?? '');
  const [kind, setKind] = useState<SponsorKind>(sponsor?.kind ?? 'PARRAIN');
  const [phone, setPhone] = useState(sponsor?.phone ?? '');
  const [email, setEmail] = useState(sponsor?.email ?? '');
  const [country, setCountry] = useState(sponsor?.country ?? '');
  const [notes, setNotes] = useState(sponsor?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveSponsor(sponsor?.id ?? null, { name: name.trim(), kind, phone: phone.trim(), email: email.trim(), country: country.trim(), notes });
      toast.success(sponsor ? 'Fiche modifiée.' : 'Parrain ajouté.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={sponsor ? 'Modifier la fiche' : 'Ajouter un parrain ou partenaire'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="sponsor-form" loading={busy} disabled={!name.trim()}>Enregistrer</Button>
      </>
    }>
      <form id="sponsor-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom" required value={name} onChange={e => setName(e.target.value)} maxLength={200} />
        <SelectField label="Catégorie" value={kind} onChange={e => setKind(e.target.value as SponsorKind)}>
          {(Object.keys(SPONSOR_KIND_LABEL) as SponsorKind[]).map(k => <option key={k} value={k}>{SPONSOR_KIND_LABEL[k]}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Téléphone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
          <TextField label="Adresse e-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <TextField label="Pays" value={country} onChange={e => setCountry(e.target.value)} />
        <TextAreaField label="Remarques" value={notes} onChange={e => setNotes(e.target.value)} />
      </form>
    </Modal>
  );
};

export const SponsorsTab: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  useEffect(() => { setPage(1); }, [dSearch, kind]);
  const list = useFetch(() => listSponsors({ page, pageSize: PAGE_SIZE, search: dSearch, kind }), [page, dSearch, kind]);

  return (
    <div>
      <FilterBar actions={canWrite ? <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Ajouter un parrain</Button> : undefined}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, téléphone, pays" className="min-w-52" />
        <SelectField label="Catégorie" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Toutes</option>
          {(Object.keys(SPONSOR_KIND_LABEL) as SponsorKind[]).map(k => <option key={k} value={k}>{SPONSOR_KIND_LABEL[k]}</option>)}
        </SelectField>
      </FilterBar>
      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun parrain" emptyHint={canWrite ? 'Ajoutez les parrains, partenaires et donateurs de l\'établissement.' : undefined}>
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[44rem]">
              <thead><tr><th>Nom</th><th>Catégorie</th><th>Téléphone</th><th>E-mail</th><th>Pays</th><th className="text-right">Parrainages actifs</th>{canWrite && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {data.results.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}{s.notes && <div className="max-w-56 truncate text-xs font-normal text-slate-500" title={s.notes}>{s.notes}</div>}</td>
                    <td><Badge tone={s.kind === 'PARRAIN' ? 'success' : 'neutral'}>{SPONSOR_KIND_LABEL[s.kind]}</Badge></td>
                    <td className="whitespace-nowrap">{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>{s.country || '—'}</td>
                    <td className="text-right tabular-nums">{s.activeSponsorships}</td>
                    {canWrite && <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Modifier</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {editing && <SponsorModal sponsor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list.reload} />}
    </div>
  );
};
