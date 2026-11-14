import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { http, type Page } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { formatDateTime } from '../../lib/format';
import { ROLE_LABEL } from '../../app/navigation';
import type { AuditLog, Role } from '../../types';
import {
  AUDIT_ACTION_LABEL, AUDIT_MODEL_LABEL, auditActionLabel, auditModelLabel, displayValue, fieldLabel, parseChanges,
} from '../../types/audit';

const PAGE_SIZE = 25;

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold';
const actionTone = (a: string): Tone =>
  a === 'LOGIN_FAILED' || a === 'DELETE' || a.endsWith('_FAILED') ? 'danger'
    : a === 'CREATE' || a === 'ENROLL' || a === 'PARENT_ACCOUNT_CREATE' ? 'success'
      : a === 'ARCHIVE' || a === 'DEACTIVATE' || a === 'YEAR_CLOSE' || a === 'UPDATE_SENSITIVE' ? 'warning'
        : a === 'LOGIN' || a === 'LOGOUT' ? 'neutral' : 'info';

const Details: React.FC<{ log: AuditLog }> = ({ log }) => {
  const entries = parseChanges(log.changes);
  return (
    <div className="space-y-3 text-sm">
      {entries.length === 0 ? (
        <p className="text-slate-500">Aucun détail enregistré pour cette opération.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-1 pr-3 font-semibold">Champ</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Ancienne valeur</th>
                <th scope="col" className="py-1 font-semibold">Nouvelle valeur</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(c => (
                <tr key={c.field} className="border-t border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium">{fieldLabel(c.field)}</th>
                  {c.diff ? (
                    <>
                      <td className="break-words py-1.5 pr-3 text-slate-600">{displayValue(c.old)}</td>
                      <td className="break-words py-1.5">{displayValue(c.new)}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="break-words py-1.5">{displayValue(c.value)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
        {log.objectId && <div><dt className="inline">Identifiant de l'objet : </dt><dd className="inline font-mono">{log.objectId}</dd></div>}
        {log.ipAddress && <div><dt className="inline">Adresse IP : </dt><dd className="inline font-mono">{log.ipAddress}</dd></div>}
      </dl>
    </div>
  );
};

export const AuditPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const dq = useDebouncedValue(search);
  const [action, setAction] = useState('');
  const [model, setModel] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setPage(1); setOpen(null); }, [dq, action, model]);

  const list = useFetch(() => {
    const params: Record<string, unknown> = { page, pageSize: PAGE_SIZE };
    if (dq.trim()) params.search = dq.trim();
    if (action) params.action = action;
    if (model) params.model = model;
    return http.get<Page<AuditLog>>('/audit-logs/', { params }).then(r => r.data);
  }, [page, dq, action, model]);

  const count = list.data?.count ?? 0;
  const hasFilter = Boolean(dq || action || model);

  return (
    <div>
      <PageHeader title="Journal d'activité" description="Qui a fait quoi, et quand. Le journal est en lecture seule et ne peut être ni modifié ni effacé." />

      <div className="panel">
        <div className="grid gap-3 border-b border-line p-3 sm:grid-cols-3">
          <div className="relative">
            <label htmlFor="aud-search" className="sr-only">Rechercher dans le journal</label>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input id="aud-search" type="search" className="input pl-9" placeholder="Utilisateur ou objet concerné" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor="aud-action" className="sr-only">Action</label>
            <select id="aud-action" className="input" value={action} onChange={e => setAction(e.target.value)}>
              <option value="">Toutes les actions</option>
              {Object.entries(AUDIT_ACTION_LABEL).sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aud-model" className="sr-only">Type d'objet</label>
            <select id="aud-model" className="input" value={model} onChange={e => setModel(e.target.value)}>
              <option value="">Tous les types d'objet</option>
              {Object.entries(AUDIT_MODEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : count === 0 ? (
          <EmptyState
            title={hasFilter ? 'Aucune entrée ne correspond' : "Le journal est vide"}
            hint={hasFilter ? 'Modifiez la recherche ou les filtres.' : "Les connexions et modifications importantes apparaîtront ici dès qu'elles auront lieu."}
          />
        ) : (
          <>
            <div className={`overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col" className="w-8"><span className="sr-only">Détails</span></th>
                    <th scope="col">Date</th>
                    <th scope="col">Utilisateur</th>
                    <th scope="col">Action</th>
                    <th scope="col" className="hidden md:table-cell">Objet</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data!.results.map(l => {
                    const expanded = open === l.id;
                    return (
                      <React.Fragment key={l.id}>
                        <tr>
                          <td>
                            <button
                              type="button" aria-expanded={expanded} aria-label={expanded ? 'Masquer le détail' : 'Voir le détail'}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(expanded ? null : l.id)}
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                            </button>
                          </td>
                          <td className="whitespace-nowrap text-sm">{formatDateTime(l.createdAt)}</td>
                          <td>
                            <p>{l.userName || <span className="text-slate-400">Système / inconnu</span>}</p>
                            {l.userRole && <p className="text-xs text-slate-500">{ROLE_LABEL[l.userRole as Role] ?? l.userRole}</p>}
                          </td>
                          <td>
                            <Badge tone={actionTone(l.action)}>{auditActionLabel(l.action)}</Badge>
                            <p className="mt-1 text-xs text-slate-500 md:hidden">{[auditModelLabel(l.model), l.objectRepr].filter(Boolean).join(' — ')}</p>
                          </td>
                          <td className="hidden md:table-cell">
                            {l.model && <p className="text-xs text-slate-500">{auditModelLabel(l.model)}</p>}
                            <p className="max-w-xs truncate" title={l.objectRepr}>{l.objectRepr || <span className="text-slate-400">—</span>}</p>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50/60">
                            <td />
                            <td colSpan={4}><Details log={l} /></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
};
