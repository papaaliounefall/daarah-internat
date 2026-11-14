import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getOverview } from '../../services/social';
import { formatDate, formatFcfa } from '../../lib/format';
import { Badge, SelectField, TextField } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, Stat, TableWrap } from '../../components/ops/Async';
import type { OverviewStudent } from '../../types/social';

const PAGE_SIZE = 20;
const statusLabel = (s: string) => (s === 'SOCIAL' ? 'Social' : 'Payant');

const Row: React.FC<{ s: OverviewStudent }> = ({ s }) => {
  const [open, setOpen] = useState(false);
  const hasHistory = s.statusChanges.length > 0;
  return (
    <>
      <tr>
        <td>
          <Link to={`/app/talibes/${s.id}`} className="font-medium text-brand-800 underline-offset-2 hover:underline">{s.fullName}</Link>
          <div className="font-mono text-xs text-slate-500">{s.registrationNumber}</div>
        </td>
        <td><Badge tone={s.status === 'SOCIAL' ? 'gold' : 'neutral'}>{statusLabel(s.status)}</Badge></td>
        <td>
          {s.sponsors.length === 0 ? (
            <span className={s.status === 'SOCIAL' ? 'text-warn' : 'text-slate-500'}>{s.status === 'SOCIAL' ? 'Sans parrain' : '—'}</span>
          ) : (
            <ul className="space-y-0.5">
              {s.sponsors.map(p => (
                <li key={p.sponsorshipId}>{p.sponsorName} <span className="text-xs text-slate-500">· {formatFcfa(p.monthlyAmount)} / mois depuis le {formatDate(p.startDate)}</span></li>
              ))}
            </ul>
          )}
        </td>
        <td className="text-right">
          {hasHistory ? (
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-sm text-brand-800 hover:bg-brand-50"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
            >
              {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
              {s.statusChanges.length} changement{s.statusChanges.length > 1 ? 's' : ''}
            </button>
          ) : <span className="text-xs text-slate-500">Aucun changement</span>}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/70">
          <td colSpan={4}>
            <ul className="space-y-1 py-1 text-sm">
              {s.statusChanges.map((c, i) => (
                <li key={i}>
                  <span className="tabular-nums">{formatDate(c.effectiveDate)}</span> — {statusLabel(c.fromStatus)} vers {statusLabel(c.toStatus)}
                  {c.reason && <> : {c.reason}</>}
                  {c.changedByName && <span className="text-xs text-slate-500"> ({c.changedByName})</span>}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
};

/** Vue d'ensemble : talibés sociaux / payants, parrains actifs et historique des changements de statut. */
export const OverviewTab: React.FC = () => {
  const [status, setStatus] = useState('');
  const [sponsored, setSponsored] = useState('');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [status, sponsored, dSearch, archived]);

  const state = useFetch(
    () => getOverview({ page, pageSize: PAGE_SIZE, status, sponsored, search: dSearch, includeArchived: archived }),
    [page, status, sponsored, dSearch, archived],
  );
  const sum = state.data?.summary;

  return (
    <div>
      {sum && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Talibés sociaux" value={sum.socialCount} />
          <Stat label="Talibés payants" value={sum.payingCount} />
          <Stat label="Sociaux parrainés" value={sum.sponsoredSocialCount} tone="success" />
          <Stat label="Sociaux sans parrain" value={sum.socialWithoutSponsorCount} tone={sum.socialWithoutSponsorCount > 0 ? 'danger' : 'default'} />
          <Stat label="Parrainages actifs" value={sum.activeSponsorships} />
          <Stat label="Parrainage mensuel" value={formatFcfa(sum.totalMonthlySponsorship)} />
        </div>
      )}
      <FilterBar>
        <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom ou matricule" className="min-w-52" />
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option><option value="SOCIAL">Sociaux</option><option value="PAYANT">Payants</option>
        </SelectField>
        <SelectField label="Parrainage" value={sponsored} onChange={e => setSponsored(e.target.value)}>
          <option value="">Tous</option><option value="true">Avec parrain actif</option><option value="false">Sans parrain actif</option>
        </SelectField>
        <label className="flex min-h-10 items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Inclure les dossiers archivés
        </label>
      </FilterBar>
      <p className="mb-3 text-xs text-slate-500">Le statut d'un talibé (social ou payant) se modifie depuis sa fiche, avec un motif conservé dans l'historique.</p>

      <Async state={state} isEmpty={d => d.results.length === 0} emptyTitle="Aucun talibé" emptyHint="Aucun talibé ne correspond à ces critères.">
        {data => (
          <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
            <table className="table-base min-w-[44rem]">
              <thead><tr><th>Talibé</th><th>Statut</th><th>Parrain(s) actif(s)</th><th className="text-right">Historique du statut</th></tr></thead>
              <tbody>{data.results.map(s => <Row key={s.id} s={s} />)}</tbody>
            </table>
          </TableWrap>
        )}
      </Async>
    </div>
  );
};
