import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { cancelDue, listDues } from '../../services/finance';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import { DUE_STATUS_LABEL, FEE_KIND_LABEL, type Due } from '../../types/finance';
import { dueStatusTone, remainingBalance } from './financeUtils';
import { PaymentFormModal } from './PaymentFormModal';
import { DueFormModal, GenerateDuesModal } from './DueModals';
import { useYears } from './useYears';

const PAGE_SIZE = 20;

export const DuesTab: React.FC = () => {
  const isDirector = useAuth(s => s.user!.role === 'DIRECTEUR');
  const toast = useToast();
  const { years, currentId } = useYears();
  const [year, setYear] = useState<string | null>(null);
  const yearId = year ?? currentId;
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<Due | null>(null);
  const [cancelling, setCancelling] = useState<Due | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { setPage(1); }, [yearId, status, overdue, dSearch]);

  const list = useFetch(
    () => listDues({ page, pageSize: PAGE_SIZE, academicYear: yearId, status, overdue: overdue ? 'true' : '', search: dSearch }),
    [page, yearId, status, overdue, dSearch],
  );

  return (
    <div>
      <FilterBar
        actions={isDirector ? (
          <>
            <Button variant="secondary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Ajouter un frais ponctuel</Button>
            <Button onClick={() => setGenerating(true)}><RefreshCw className="h-4 w-4" aria-hidden /> Générer les échéances</Button>
          </>
        ) : undefined}
      >
        <SelectField label="Année scolaire" value={yearId} onChange={e => setYear(e.target.value)}>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (en cours)' : ''}</option>)}
        </SelectField>
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option>
          <option value="IMPAYEE">Impayées</option><option value="PARTIELLE">Partielles</option>
          <option value="PAYEE">Payées</option><option value="ANNULEE">Annulées</option>
        </SelectField>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, matricule, libellé" className="min-w-52" />
        <label className="flex min-h-10 items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} /> Échues seulement
        </label>
      </FilterBar>

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucune échéance"
        emptyHint={isDirector ? "Générez les échéances de l'année à partir de la grille de frais, ou ajoutez un frais ponctuel." : "Aucune échéance ne correspond à ces critères."}>
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[56rem]">
              <thead>
                <tr><th>Talibé</th><th>Frais</th><th>Échéance</th><th className="text-right">Montant</th><th className="text-right">Payé</th><th className="text-right">Reste</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.results.map(d => (
                  <tr key={d.id} className={d.isCancelled ? 'text-slate-500' : ''}>
                    <td>
                      <div className="font-medium">{d.studentName}</div>
                      <div className="font-mono text-xs text-slate-500">{d.registrationNumber}</div>
                    </td>
                    <td>{d.label}<div className="text-xs text-slate-500">{FEE_KIND_LABEL[d.kind]}{d.period ? ` — ${d.period}` : ''}</div></td>
                    <td className="whitespace-nowrap">
                      {formatDate(d.dueDate)}
                      {d.isOverdue && <div className="text-xs text-danger">En retard</div>}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(d.amount)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(d.paidAmount)}</td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatFcfa(remainingBalance(d))}</td>
                    <td><Badge tone={dueStatusTone(d.status)}>{DUE_STATUS_LABEL[d.status]}</Badge></td>
                    <td className="whitespace-nowrap text-right">
                      {remainingBalance(d) > 0 && <Button variant="ghost" size="sm" onClick={() => setPaying(d)}>Encaisser</Button>}
                      {isDirector && !d.isCancelled && d.paidAmount === 0 && (
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

      {paying && <PaymentFormModal initialDue={paying} onClose={() => setPaying(null)} onSaved={list.reload} />}
      {creating && <DueFormModal years={years} defaultYear={yearId} onClose={() => setCreating(false)} onSaved={list.reload} />}
      {generating && <GenerateDuesModal years={years} defaultYear={yearId} onClose={() => setGenerating(false)} onDone={list.reload} />}
      {cancelling && (
        <ReasonDialog
          title="Annuler l'échéance"
          message={<>L'échéance « {cancelling.label} » de {cancelling.studentName} ({formatFcfa(cancelling.amount)}) ne sera plus due. Elle reste visible dans l'historique et ne sera jamais régénérée.</>}
          label="Motif de l'annulation"
          confirmLabel="Annuler l'échéance"
          onConfirm={async reason => { await cancelDue(cancelling.id, reason); toast.success('Échéance annulée.'); list.reload(); }}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
};
