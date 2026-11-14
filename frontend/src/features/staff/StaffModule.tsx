import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { listStaff } from '../../services/staff';
import { Badge, Button, PageHeader, SelectField, TextField } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { STAFF_CATEGORY_LABEL, STAFF_STATUS_LABEL, type StaffCategory, type StaffMember, type StaffStatus } from '../../types/staff';
import { StaffFormModal } from './StaffFormModal';
import { StaffDetailModal } from './StaffDetailModal';

const PAGE_SIZE = 20;
const statusTone = (s: StaffStatus) => (s === 'ACTIF' ? 'success' : s === 'CONGE' ? 'warning' : 'neutral');

/**
 * Personnel. Le directeur gère les dossiers complets ; l'assistant ne reçoit du serveur que nom, fonction,
 * téléphone et statut (consultation seule) : l'affichage s'adapte aux champs réellement présents.
 */
export const StaffModule: React.FC = () => {
  const isDirector = useAuth(s => s.user!.role === 'DIRECTEUR');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { setPage(1); }, [dSearch, category, status]);

  const list = useFetch(() => listStaff({ page, pageSize: PAGE_SIZE, search: dSearch, category, status }), [page, dSearch, category, status]);

  return (
    <div>
      <PageHeader
        title="Personnel"
        description={isDirector ? 'Dossiers du personnel, fonctions et documents.' : 'Annuaire du personnel (nom, fonction, téléphone et statut).'}
        actions={isDirector ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Nouveau dossier</Button> : undefined}
      />
      <FilterBar>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, fonction, téléphone" className="min-w-56" />
        <SelectField label="Catégorie" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Toutes</option>
          {(Object.keys(STAFF_CATEGORY_LABEL) as StaffCategory[]).map(c => <option key={c} value={c}>{STAFF_CATEGORY_LABEL[c]}</option>)}
        </SelectField>
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(STAFF_STATUS_LABEL) as StaffStatus[]).map(s => <option key={s} value={s}>{STAFF_STATUS_LABEL[s]}</option>)}
        </SelectField>
      </FilterBar>

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun membre du personnel"
        emptyHint={isDirector ? 'Créez le premier dossier avec « Nouveau dossier ».' : 'Aucun dossier ne correspond à ces critères.'}>
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[40rem]">
              <thead><tr><th>Nom</th><th>Catégorie</th><th>Fonction</th><th>Téléphone</th><th>Statut</th>{isDirector && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {data.results.map((m: StaffMember) => (
                  <tr key={m.id} className={m.status === 'PARTI' ? 'text-slate-500' : ''}>
                    <td className="font-medium">{m.fullName}</td>
                    <td>{STAFF_CATEGORY_LABEL[m.category]}</td>
                    <td>{m.roleTitle}</td>
                    <td className="whitespace-nowrap">{m.phone || '—'}</td>
                    <td><Badge tone={statusTone(m.status)}>{STAFF_STATUS_LABEL[m.status]}</Badge></td>
                    {isDirector && <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setOpenId(m.id)} aria-label={`Ouvrir le dossier de ${m.fullName}`}>Ouvrir le dossier</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {creating && <StaffFormModal member={null} onClose={() => setCreating(false)} onSaved={m => { list.reload(); setOpenId(m.id); }} />}
      {openId && <StaffDetailModal staffId={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </div>
  );
};

export default StaffModule;
