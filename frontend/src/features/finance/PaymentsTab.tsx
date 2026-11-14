import React, { useEffect, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { cancelPayment, listPayments } from '../../services/finance';
import { openReceipt } from '../../services/documents';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, Button, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import { FEE_KIND_LABEL, METHOD_LABEL, type Payment, type PaymentMethod } from '../../types/finance';
import { PaymentFormModal } from './PaymentFormModal';

const PAGE_SIZE = 20;

export const PaymentsTab: React.FC = () => {
  const isDirector = useAuth(s => s.user!.role === 'DIRECTEUR');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [busyReceipt, setBusyReceipt] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [dSearch, status, method, dateFrom, dateTo]);

  const list = useFetch(
    () => listPayments({ page, pageSize: PAGE_SIZE, search: dSearch, status, method, dateFrom, dateTo }),
    [page, dSearch, status, method, dateFrom, dateTo],
  );

  const receipt = async (p: Payment) => {
    setBusyReceipt(p.id);
    try { await openReceipt(p.id, p.receiptNumber); } catch (e) { toast.error(plainErrorMessage(e)); } finally { setBusyReceipt(null); }
  };

  return (
    <div>
      <FilterBar actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Enregistrer un paiement</Button>}>
        <div className="relative">
          <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Reçu, nom, matricule, référence" className="min-w-56" />
          <Search className="pointer-events-none absolute bottom-2.5 right-3 h-4 w-4 text-slate-400" aria-hidden />
        </div>
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option><option value="PAYE">Payés</option><option value="ANNULE">Annulés</option>
        </SelectField>
        <SelectField label="Mode" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">Tous</option>
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </SelectField>
        <TextField label="Du" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField label="Au" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </FilterBar>

      <Async
        state={list}
        isEmpty={d => d.results.length === 0}
        emptyTitle="Aucun paiement"
        emptyHint="Aucun paiement ne correspond à ces critères."
      >
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[56rem]">
              <thead>
                <tr><th>Reçu</th><th>Date</th><th>Talibé</th><th>Objet</th><th>Mode</th><th className="text-right">Montant</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.results.map(p => (
                  <tr key={p.id} className={p.status === 'ANNULE' ? 'text-slate-500' : ''}>
                    <td className="whitespace-nowrap font-mono text-xs">{p.receiptNumber}</td>
                    <td className="whitespace-nowrap">{formatDate(p.date)}</td>
                    <td>
                      <div className="font-medium">{p.studentName}</div>
                      <div className="font-mono text-xs text-slate-500">{p.registrationNumber}</div>
                    </td>
                    <td>
                      {FEE_KIND_LABEL[p.feeKind]}{p.periodLabel ? ` — ${p.periodLabel}` : ''}
                      {p.reference && <div className="text-xs text-slate-500">Réf. {p.reference}</div>}
                    </td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${p.status === 'ANNULE' ? 'line-through' : ''}`}>{formatFcfa(p.amount)}</td>
                    <td>
                      {p.status === 'PAYE' ? <Badge tone="success">Payé</Badge> : <Badge tone="danger">Annulé</Badge>}
                      {p.status === 'ANNULE' && (
                        <div className="mt-1 max-w-48 text-xs text-slate-500">
                          Motif : {p.cancelReason}{p.cancelledByName ? ` (${p.cancelledByName}, ${formatDate(p.cancelledAt)})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" loading={busyReceipt === p.id} onClick={() => receipt(p)} aria-label={`Ouvrir le reçu ${p.receiptNumber}`}>
                        <FileText className="h-4 w-4" aria-hidden /> Reçu
                      </Button>
                      {isDirector && p.status === 'PAYE' && (
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-red-50" onClick={() => setCancelling(p)}>Annuler</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {creating && <PaymentFormModal onClose={() => setCreating(false)} onSaved={list.reload} />}
      {cancelling && (
        <ReasonDialog
          title={`Annuler le paiement ${cancelling.receiptNumber}`}
          message={<>Le paiement de <strong>{formatFcfa(cancelling.amount)}</strong> de {cancelling.studentName} sera marqué « Annulé ». La ligne et le numéro de reçu sont conservés et le solde de l'échéance est libéré. Pour corriger, enregistrez ensuite un nouveau paiement.</>}
          label="Motif de l'annulation"
          confirmLabel="Annuler le paiement"
          onConfirm={async reason => { await cancelPayment(cancelling.id, reason); toast.success('Paiement annulé.'); list.reload(); }}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
};
