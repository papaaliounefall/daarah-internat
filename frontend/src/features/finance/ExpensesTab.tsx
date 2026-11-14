import React, { useEffect, useState } from 'react';
import { Paperclip, Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { approveExpense, cancelExpense, listExpenses, rejectExpense } from '../../services/finance';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import {
  EXPENSE_CATEGORY_LABEL, EXPENSE_STATUS_LABEL, type Expense, type ExpenseCategory, type ExpenseStatus,
} from '../../types/finance';
import { expenseStatusTone } from './financeUtils';
import { ExpenseFormModal } from './ExpenseFormModal';

const PAGE_SIZE = 20;
type Action = { kind: 'approve' | 'reject' | 'cancel'; expense: Expense };

export const ExpensesTab: React.FC = () => {
  const isDirector = useAuth(s => s.user!.role === 'DIRECTEUR');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  useEffect(() => { setPage(1); }, [dSearch, category, status, dateFrom, dateTo]);

  const list = useFetch(
    () => listExpenses({ page, pageSize: PAGE_SIZE, search: dSearch, category, status, dateFrom, dateTo }),
    [page, dSearch, category, status, dateFrom, dateTo],
  );

  const editable = (e: Expense) => e.status === 'EN_ATTENTE' || e.status === 'VALIDEE';

  return (
    <div>
      <FilterBar actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Saisir une dépense</Button>}>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Intitulé, bénéficiaire, référence" className="min-w-52" />
        <SelectField label="Catégorie" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Toutes</option>
          {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
        </SelectField>
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(EXPENSE_STATUS_LABEL) as ExpenseStatus[]).map(s => <option key={s} value={s}>{EXPENSE_STATUS_LABEL[s]}</option>)}
        </SelectField>
        <TextField label="Du" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField label="Au" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </FilterBar>

      {!isDirector && (
        <p className="mb-3 text-sm text-slate-600">
          Les dépenses importantes que vous saisissez restent « en attente » jusqu'à leur validation par le directeur.
        </p>
      )}

      <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucune dépense" emptyHint="Aucune dépense ne correspond à ces critères.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[56rem]">
              <thead>
                <tr><th>Date</th><th>Dépense</th><th>Catégorie</th><th className="text-right">Montant</th><th>Statut</th><th>Saisie par</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.results.map(x => (
                  <tr key={x.id} className={x.status === 'REFUSEE' || x.status === 'ANNULEE' ? 'text-slate-500' : ''}>
                    <td className="whitespace-nowrap">{formatDate(x.date)}</td>
                    <td>
                      <div className="font-medium">{x.title}</div>
                      <div className="text-xs text-slate-500">
                        {x.paidTo && <>Bénéficiaire : {x.paidTo}</>}{x.paidTo && x.reference ? ' · ' : ''}{x.reference && <>Réf. {x.reference}</>}
                      </div>
                      {x.attachmentUrl && (
                        <a href={x.attachmentUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 underline">
                          <Paperclip className="h-3 w-3" aria-hidden /> Justificatif
                        </a>
                      )}
                    </td>
                    <td>{EXPENSE_CATEGORY_LABEL[x.category]}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatFcfa(x.amount)}</td>
                    <td>
                      <Badge tone={expenseStatusTone(x.status)}>{EXPENSE_STATUS_LABEL[x.status]}</Badge>
                      {x.status === 'REFUSEE' && x.decisionNote && <div className="mt-1 max-w-48 text-xs">Motif : {x.decisionNote}</div>}
                      {x.status === 'ANNULEE' && x.cancelReason && <div className="mt-1 max-w-48 text-xs">Motif : {x.cancelReason}</div>}
                      {x.status === 'VALIDEE' && x.approvedByName && <div className="mt-1 text-xs text-slate-500">par {x.approvedByName}</div>}
                    </td>
                    <td>{x.createdByName}</td>
                    <td className="whitespace-nowrap text-right">
                      {isDirector && x.status === 'EN_ATTENTE' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setAction({ kind: 'approve', expense: x })}>Valider</Button>
                          <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setAction({ kind: 'reject', expense: x })}>Refuser</Button>
                        </>
                      )}
                      {editable(x) && <Button variant="ghost" size="sm" onClick={() => setEditing(x)}>Modifier</Button>}
                      {isDirector && editable(x) && (
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setAction({ kind: 'cancel', expense: x })}>Annuler</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {editing && <ExpenseFormModal expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list.reload} />}
      {action?.kind === 'approve' && (
        <ReasonDialog
          title="Valider la dépense"
          message={<>Valider « {action.expense.title} » ({formatFcfa(action.expense.amount)}) ? Elle comptera dans le rapport financier.</>}
          label="Remarque (facultative)"
          required={false}
          danger={false}
          confirmLabel="Valider la dépense"
          onConfirm={async note => { await approveExpense(action.expense.id, note); toast.success('Dépense validée.'); list.reload(); }}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'reject' && (
        <ReasonDialog
          title="Refuser la dépense"
          message={<>« {action.expense.title} » ({formatFcfa(action.expense.amount)}) ne sera pas comptée. L'auteur de la saisie verra le motif.</>}
          label="Motif du refus"
          confirmLabel="Refuser la dépense"
          onConfirm={async reason => { await rejectExpense(action.expense.id, reason); toast.success('Dépense refusée.'); list.reload(); }}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'cancel' && (
        <ReasonDialog
          title="Annuler la dépense"
          message={<>« {action.expense.title} » ({formatFcfa(action.expense.amount)}) sera annulée et retirée du rapport. La ligne reste visible dans l'historique.</>}
          label="Motif de l'annulation"
          confirmLabel="Annuler la dépense"
          onConfirm={async reason => { await cancelExpense(action.expense.id, reason); toast.success('Dépense annulée.'); list.reload(); }}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
};
