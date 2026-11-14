import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listAssignments, releaseAssignment } from '../../services/boarding';
import { formatDate } from '../../lib/format';
import { Badge, Button, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import type { BoardingAssignment } from '../../types/boarding';
import { AssignModal } from './AssignModal';

const PAGE_SIZE = 20;

/** `mode="active"` : affectations en cours (gestion). `mode="history"` : affectations clôturées, en lecture seule. */
export const AssignmentsTab: React.FC<{ mode: 'active' | 'history' }> = ({ mode }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState(false);
  const [moving, setMoving] = useState<BoardingAssignment | null>(null);
  const [releasing, setReleasing] = useState<BoardingAssignment | null>(null);
  useEffect(() => { setPage(1); }, [dSearch, mode]);

  const list = useFetch(
    () => listAssignments({ page, pageSize: PAGE_SIZE, search: dSearch, active: mode === 'active' ? 'true' : 'false' }),
    [page, dSearch, mode],
  );
  const active = mode === 'active';

  return (
    <div>
      <FilterBar actions={active ? <Button onClick={() => setAssigning(true)}><Plus className="h-4 w-4" aria-hidden /> Affecter un talibé</Button> : undefined}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Talibé, matricule, chambre" className="min-w-56" />
      </FilterBar>
      {!active && <p className="mb-3 text-sm text-slate-600">Affectations terminées (changement de chambre ou sortie définitive). Elles sont conservées sans limite de durée.</p>}

      <Async
        state={list}
        isEmpty={d => d.results.length === 0}
        emptyTitle={active ? 'Aucune affectation en cours' : 'Aucun historique'}
        emptyHint={active ? 'Affectez un talibé à une chambre pour le loger à l\'internat.' : "Aucune affectation n'est encore terminée."}
      >
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[48rem]">
              <thead>
                <tr><th>Talibé</th><th>Bâtiment et chambre</th><th>Lit</th><th>Depuis le</th>{!active && <th>Jusqu'au</th>}<th>Remarque</th>{active && <th><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody>
                {data.results.map(a => (
                  <tr key={a.id}>
                    <td><div className="font-medium">{a.studentName}</div><div className="font-mono text-xs text-slate-500">{a.registrationNumber}</div></td>
                    <td>{a.buildingName} — {a.roomLabel}</td>
                    <td>{a.bedNumber || '—'}</td>
                    <td className="whitespace-nowrap">{formatDate(a.startDate)}</td>
                    {!active && <td className="whitespace-nowrap">{formatDate(a.endDate)}</td>}
                    <td className="max-w-64">{a.note || '—'}{a.assignedByName && <div className="text-xs text-slate-500">par {a.assignedByName}</div>}</td>
                    {active && (
                      <td className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="sm" onClick={() => setMoving(a)}>Changer de chambre</Button>
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setReleasing(a)}>Sortie définitive</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>
      {!active && <div className="mt-2"><Badge>Lecture seule</Badge></div>}

      {assigning && <AssignModal onClose={() => setAssigning(false)} onSaved={list.reload} />}
      {moving && <AssignModal current={moving} onClose={() => setMoving(null)} onSaved={list.reload} />}
      {releasing && (
        <ReasonDialog
          title="Sortie définitive de l'internat"
          message={<>{releasing.studentName} quittera définitivement la chambre {releasing.roomLabel}. L'affectation est clôturée et conservée dans l'historique ; la place est libérée.</>}
          label="Motif de la sortie (facultatif)"
          required={false}
          confirmLabel="Confirmer la sortie définitive"
          onConfirm={async reason => { await releaseAssignment(releasing.id, reason); toast.success(`${releasing.studentName} a quitté l'internat.`); list.reload(); }}
          onClose={() => setReleasing(null)}
        />
      )}
    </div>
  );
};
