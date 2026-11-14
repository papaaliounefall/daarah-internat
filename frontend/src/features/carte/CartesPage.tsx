import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, IdCard, Layers, Loader2, Search } from 'lucide-react';
import { errorMessage, listAll } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { BATCH_LIMIT, generateBatch, listCards } from '../../services/cards';
import { listStudents } from '../../services/students';
import { Badge, Button, EmptyState, ErrorState, Modal, PageHeader, Spinner, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import type { Student } from '../../types';
import {
  batchRowLabel, batchSummary, cardCreatedSince, chunk, type BatchRow,
} from './cardUtils';
import { StudentCardPanel } from './StudentCardPanel';

type ShownStudent = { id: string; fullName: string };

const PAGE_SIZE = 20;
const POLL_CONCURRENCY = 4;
const MAX_POLLS = 10;

/** Cartes talibé : consultation, nouvelle version avec motif, génération en lot. */
export const CartesPage: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [shown, setShown] = useState<ShownStudent | null>(null);
  const [askBatch, setAskBatch] = useState(false);
  const [batch, setBatch] = useState<{ ids: string[]; names: Map<string, string>; startedAt: number } | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  useEffect(() => { setPage(1); }, [debounced]);

  const list = useFetch(
    () => listStudents({ page, pageSize: PAGE_SIZE, search: debounced, archive: 'active' }),
    [page, debounced],
  );
  const rows = list.data?.results ?? [];
  const allOnPage = rows.length > 0 && rows.every(s => selected.has(s.id));

  const toggle = (s: Student) =>
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(s.id)) next.delete(s.id);
      else if (next.size >= BATCH_LIMIT) toast.error(`Un lot est limité à ${BATCH_LIMIT} talibés.`);
      else next.set(s.id, s.fullName);
      return next;
    });

  const togglePage = () =>
    setSelected(prev => {
      const next = new Map(prev);
      if (allOnPage) rows.forEach(s => next.delete(s.id));
      else {
        for (const s of rows) {
          if (next.size >= BATCH_LIMIT) { toast.error(`Un lot est limité à ${BATCH_LIMIT} talibés.`); break; }
          next.set(s.id, s.fullName);
        }
      }
      return next;
    });

  const selectAllResults = async () => {
    setSelectingAll(true);
    try {
      const all = await listAll<Student>('/students/', { search: debounced.trim() || undefined, ordering: 'last_name,first_name' });
      const active = all.filter(s => !s.isArchived);
      setSelected(prev => {
        const next = new Map(prev);
        for (const s of active) {
          if (next.size >= BATCH_LIMIT) break;
          next.set(s.id, s.fullName);
        }
        return next;
      });
      if (active.length > BATCH_LIMIT) toast.error(`Seuls les ${BATCH_LIMIT} premiers talibés ont été sélectionnés (limite d'un lot).`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSelectingAll(false);
    }
  };

  const launchBatch = async (reason: string) => {
    const ids = [...selected.keys()];
    const names = new Map(selected);
    const { startedAt } = await generateBatch(ids, reason);
    setSelected(new Map());
    setBatch({ ids, names, startedAt });
  };

  return (
    <div>
      <PageHeader
        title="Cartes talibé"
        description="Aperçu, édition et réimpression des cartes. Le PDF est produit par le serveur d'après le modèle officiel."
        actions={
          <Button onClick={() => setAskBatch(true)} disabled={selected.size === 0}>
            <Layers className="h-4 w-4" aria-hidden /> Générer pour la sélection ({selected.size})
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <label htmlFor="cartes-search" className="sr-only">Rechercher un talibé</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="cartes-search"
            type="search"
            className="input pl-9"
            placeholder="Nom, prénom ou matricule"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="secondary" size="sm" onClick={() => void selectAllResults()} loading={selectingAll}>
            Sélectionner tous les résultats
          </Button>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Vider la sélection</Button>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {list.error && list.data === undefined ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data === undefined ? (
          <Spinner label="Chargement des talibés…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={debounced ? 'Aucun talibé ne correspond à la recherche' : 'Aucun talibé enregistré'}
            hint={debounced ? 'Vérifiez l\'orthographe ou essayez le matricule.' : 'Les cartes sont disponibles dès qu\'un talibé est inscrit.'}
          />
        ) : (
          <div aria-busy={list.loading} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="flex items-center gap-3 border-b border-line bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-700"
                checked={allOnPage}
                onChange={togglePage}
                aria-label="Sélectionner tous les talibés de la page"
              />
              <span>Talibé</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-brand-50/40">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-700"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s)}
                    aria-label={`Sélectionner ${s.fullName}`}
                  />
                  {s.photoUrl
                    ? <img src={s.photoUrl} alt="" loading="lazy" className="h-10 w-8 shrink-0 rounded-sm border border-line object-cover" />
                    : <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-line text-[9px] leading-tight text-slate-400" title="Aucune photo : la carte sera imprimée sans photo">sans photo</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {s.registrationNumber}{s.className ? ` — ${s.className}` : ''}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setShown(s)} aria-label={`Voir la carte de ${s.fullName}`}>
                    <IdCard className="h-4 w-4" aria-hidden /> Carte
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPage={setPage} />
          </div>
        )}
      </div>

      {askBatch && (
        <ReasonDialog
          title={`Générer ${selected.size} carte${selected.size > 1 ? 's' : ''}`}
          message={
            <p>
              Une nouvelle version sera enregistrée pour chacun des {selected.size} talibé{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''},
              avec les données actuelles de leur dossier. Les versions précédentes restent dans l'historique.
            </p>
          }
          label="Motif (facultatif)"
          confirmLabel="Lancer la génération"
          danger={false}
          required={false}
          onConfirm={launchBatch}
          onClose={() => setAskBatch(false)}
        />
      )}

      {batch && <BatchProgress {...batch} onClose={() => setBatch(null)} onOpen={setShown} />}

      {shown && (
        <Modal title={`Carte de ${shown.fullName}`} size="xl" onClose={() => setShown(null)}>
          <StudentCardPanel studentId={shown.id} />
        </Modal>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
/**
 * Suivi d'un lot. Le serveur ne renvoie pas de résultat par talibé (tâches asynchrones) : on interroge
 * l'historique de chacun pour constater la nouvelle version, et on signale ceux pour qui rien n'est apparu.
 */
const BatchProgress: React.FC<{
  ids: string[];
  names: Map<string, string>;
  startedAt: number;
  onClose: () => void;
  onOpen: (s: ShownStudent) => void;
}> = ({ ids, names, startedAt, onClose, onOpen }) => {
  const [rows, setRows] = useState<BatchRow[]>(() => ids.map(studentId => ({ studentId, state: 'pending' })));
  const [finished, setFinished] = useState(false);
  const [run, setRun] = useState(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    setFinished(false);

    const tick = async () => {
      const pending = rowsRef.current.filter(r => r.state === 'pending').map(r => r.studentId);
      if (pending.length === 0) { setFinished(true); return; }
      const found = new Map<string, number>();
      for (const part of chunk(pending, POLL_CONCURRENCY)) {
        await Promise.all(part.map(async id => {
          try {
            const card = cardCreatedSince(await listCards(id), startedAt);
            if (card) found.set(id, card.version);
          } catch { /* vérification impossible pour l'instant : on réessaiera */ }
        }));
        if (!live) return;
      }
      if (found.size) {
        setRows(rs => rs.map(r => (found.has(r.studentId) ? { ...r, state: 'done', version: found.get(r.studentId) } : r)));
      }
      polls += 1;
      if (pending.length - found.size === 0 || polls >= MAX_POLLS) { setFinished(true); return; }
      // Au plus ~8 requêtes par seconde pour rester sous la limite de débit du serveur.
      timer = setTimeout(() => void tick(), Math.max(3000, (pending.length - found.size) * 130));
    };

    timer = setTimeout(() => void tick(), 1500);
    return () => { live = false; clearTimeout(timer); };
  }, [startedAt, run]);

  const unresolved = rows.filter(r => r.state === 'pending').length;

  return (
    <Modal
      title="Génération des cartes"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {finished && unresolved > 0 && <Button variant="secondary" onClick={() => setRun(n => n + 1)}>Revérifier</Button>}
          <Button onClick={onClose}>Fermer</Button>
        </>
      }
    >
      <p role="status" className="mb-3 text-sm text-slate-700">
        Génération demandée pour {ids.length} talibé{ids.length > 1 ? 's' : ''}. {batchSummary(rows, finished)}.
      </p>
      {finished && unresolved > 0 && (
        <p role="alert" className="mb-3 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Pour {unresolved} talibé{unresolved > 1 ? 's' : ''}, aucune nouvelle carte n'est apparue : la génération est peut-être encore
          en cours, ou elle a échoué (le détail figure dans le journal d'activité). Utilisez « Revérifier » ou ouvrez la fiche concernée.
        </p>
      )}
      <ul className="panel max-h-80 divide-y divide-line overflow-y-auto text-sm">
        {rows.map(r => (
          <li key={r.studentId} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate">{names.get(r.studentId) ?? r.studentId}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
              {r.state === 'done' && <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden />}
              {r.state === 'failed' && <CircleAlert className="h-4 w-4 text-danger" aria-hidden />}
              {r.state === 'pending' && (finished
                ? <CircleAlert className="h-4 w-4 text-gold-700" aria-hidden />
                : <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />)}
              {batchRowLabel(r, finished)}
              {r.state === 'pending' && finished && <Badge tone="warning">À vérifier</Badge>}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs text-brand-700 hover:underline"
              onClick={() => onOpen({ id: r.studentId, fullName: names.get(r.studentId) ?? 'talibé' })}
            >
              Voir
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
