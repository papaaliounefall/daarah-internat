import React, { useEffect, useState } from 'react';
import { Mail, Phone, Search } from 'lucide-react';
import { errorMessage } from '../../../../lib/api';
import { formatDate, formatDateTime } from '../../../../lib/format';
import { useFetch } from '../../../../hooks/useFetch';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { listContactRequests, markContactProcessed } from '../../../../services/site';
import { Badge, Button, EmptyState, ErrorState, SelectField, Spinner, useToast } from '../../../../components/ui';
import { Pagination } from '../../../../components/ui/Pagination';
import type { ContactRequest } from '../../../../types/site';

type Filter = 'open' | 'done' | 'all';
const PAGE_SIZE = 20;

export const kindLabel = (r: Pick<ContactRequest, 'kind'>) => (r.kind === 'VISITE' ? 'Visite' : 'Information');

/** Demandes reçues du site public : informations et visites, à marquer comme traitées. */
export const ContactRequests: React.FC = () => {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [filter, debounced]);

  const processed = filter === 'all' ? undefined : filter === 'done';
  const list = useFetch(() => listContactRequests({ page, pageSize: PAGE_SIZE, processed, search: debounced }), [page, filter, debounced]);

  const toggle = async (r: ContactRequest) => {
    setBusyId(r.id);
    try {
      await markContactProcessed(r.id, !r.isProcessed);
      toast.success(r.isProcessed ? 'Demande rouverte.' : 'Demande marquée comme traitée.');
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SelectField label="Affichage" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          <option value="open">À traiter</option>
          <option value="done">Traitées</option>
          <option value="all">Toutes</option>
        </SelectField>
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <label htmlFor="contact-search" className="sr-only">Rechercher une demande</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="contact-search" type="search" className="input pl-9" placeholder="Nom, e-mail, téléphone, message" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="panel overflow-hidden">
        {list.error && list.data === undefined ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data === undefined ? (
          <Spinner />
        ) : list.data.results.length === 0 ? (
          <EmptyState
            title={filter === 'open' && !debounced ? 'Aucune demande à traiter' : 'Aucune demande'}
            hint="Les demandes d'information et de visite envoyées depuis le site public apparaissent ici."
          />
        ) : (
          <div aria-busy={list.loading} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-line">
              {list.data.results.map(r => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {r.name}
                        <Badge tone={r.kind === 'VISITE' ? 'gold' : 'info'}>{kindLabel(r)}</Badge>
                        {r.isProcessed ? <Badge tone="success">Traitée</Badge> : <Badge tone="warning">À traiter</Badge>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                        {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden /> {r.phone}</a>}
                        {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 break-all hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden /> {r.email}</a>}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" loading={busyId === r.id} onClick={() => void toggle(r)}>
                      {r.isProcessed ? 'Rouvrir' : 'Marquer comme traitée'}
                    </Button>
                  </div>
                  {r.kind === 'VISITE' && (
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <div className="flex gap-1"><dt className="text-slate-500">Enfant :</dt><dd className="font-medium">{r.childName || 'non précisé'}</dd></div>
                      <div className="flex gap-1"><dt className="text-slate-500">Date souhaitée :</dt><dd className="font-medium">{r.desiredDate ? formatDate(r.desiredDate) : 'non précisée'}</dd></div>
                    </dl>
                  )}
                  {r.message && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.message}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    Reçue le {formatDateTime(r.createdAt)}
                    {r.isProcessed && ` — traitée le ${formatDateTime(r.processedAt)}${r.processedByName ? ` par ${r.processedByName}` : ''}`}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};
