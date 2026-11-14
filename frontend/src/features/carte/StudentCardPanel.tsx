import React, { useState } from 'react';
import { Download, Eye, FilePlus2, RefreshCw } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage } from '../../lib/api';
import { formatDateTime, saveBlob } from '../../lib/format';
import { useAuth } from '../../stores/authStore';
import {
  fetchCardPreview, fetchCardVersion, fetchCurrentCard, generateCard, listCards,
} from '../../services/cards';
import { Badge, Button, EmptyState, ErrorState, Spinner, useToast } from '../../components/ui';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import type { FamilyCard, StudentCard } from '../../types/documents';
import { PdfViewer } from './PdfViewer';

interface Props {
  studentId: string;
}

/**
 * Carte d'un talibé (PDF fait par le serveur d'après le modèle officiel).
 * Directeur / assistant : aperçu du dossier actuel, nouvelle version avec motif, historique, impression.
 * Parent : téléchargement et impression de la carte courante uniquement.
 */
export const StudentCardPanel: React.FC<Props> = ({ studentId }) => {
  const role = useAuth(s => s.user?.role);
  if (role === 'PARENT') return <FamilyCardView studentId={studentId} />;
  if (role === 'DIRECTEUR' || role === 'ASSISTANT') return <AdminCardPanel studentId={studentId} />;
  return <p role="alert" className="text-sm text-slate-600">Votre profil ne donne pas accès aux cartes des talibés.</p>;
};

// ---------------------------------------------------------------------------------------------------
const AdminCardPanel: React.FC<Props> = ({ studentId }) => {
  const toast = useToast();
  // null : aperçu des données actuelles ; sinon une version enregistrée.
  const [viewing, setViewing] = useState<StudentCard | null>(null);
  const [asking, setAsking] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const history = useFetch(() => listCards<StudentCard>(studentId), [studentId]);
  const pdf = useFetch(
    () => (viewing ? fetchCardVersion(viewing.id) : fetchCardPreview(studentId)),
    [studentId, viewing?.id],
  );

  const versions = history.data ?? [];
  const label = viewing?.snapshot.numero || versions[0]?.snapshot.numero || studentId;
  const filename = viewing ? `carte-${label}-v${viewing.version}.pdf` : `apercu-carte-${label}.pdf`;

  const create = async (reason: string) => {
    const card = await generateCard(studentId, reason);
    toast.success(`Version ${card.version} de la carte enregistrée.`);
    setViewing(card);
    history.reload();
  };

  const download = async (card: StudentCard) => {
    setDownloading(card.id);
    try {
      saveBlob(await fetchCardVersion(card.id), `carte-${card.snapshot.numero || studentId}-v${card.version}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-5">
      <section aria-label="Aperçu de la carte">
        <p className="mb-2 text-sm text-slate-600">
          {viewing
            ? `Version ${viewing.version}${viewing.isCurrent ? ' (courante)' : ''}, enregistrée le ${formatDateTime(viewing.createdAt)}.`
            : 'Aperçu d\'après le dossier actuel du talibé. Rien n\'est enregistré tant qu\'aucune version n\'est générée.'}
        </p>
        <PdfViewer
          state={pdf}
          title="Carte du talibé"
          filename={filename}
          actions={
            <>
              {viewing ? (
                <Button variant="ghost" size="sm" onClick={() => setViewing(null)}><Eye className="h-4 w-4" aria-hidden /> Revenir à l'aperçu du dossier</Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={pdf.reload} loading={pdf.loading}><RefreshCw className="h-4 w-4" aria-hidden /> Actualiser l'aperçu</Button>
              )}
              <Button size="sm" onClick={() => setAsking(true)}><FilePlus2 className="h-4 w-4" aria-hidden /> Générer une nouvelle version</Button>
            </>
          }
        />
      </section>

      <section aria-label="Historique des versions">
        <h3 className="mb-2 text-sm font-semibold text-ink">Historique des versions</h3>
        {history.error && history.data === undefined ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : history.data === undefined ? (
          <Spinner />
        ) : versions.length === 0 ? (
          <div className="panel">
            <EmptyState title="Aucune carte enregistrée" hint="Générez une première version pour l'enregistrer et pouvoir la remettre à la famille." />
          </div>
        ) : (
          <ul className="panel divide-y divide-line">
            {versions.map(c => (
              <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm ${viewing?.id === c.id ? 'bg-brand-50/60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium">
                    Version {c.version} {c.isCurrent && <Badge tone="success">Courante</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(c.createdAt)}{c.generatedByName ? ` — ${c.generatedByName}` : ''}
                    {c.reason ? ` — ${c.reason}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setViewing(c)} disabled={viewing?.id === c.id} aria-label={`Afficher la version ${c.version}`}>
                    <Eye className="h-4 w-4" aria-hidden /> Afficher
                  </Button>
                  <Button variant="secondary" size="sm" loading={downloading === c.id} onClick={() => void download(c)} aria-label={`Télécharger la version ${c.version}`}>
                    <Download className="h-4 w-4" aria-hidden /> Télécharger
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {asking && (
        <ReasonDialog
          title="Générer une nouvelle version de la carte"
          message={
            <p>
              Une nouvelle version sera enregistrée avec les données actuelles du dossier et deviendra la carte courante.
              Les versions précédentes restent conservées dans l'historique.
            </p>
          }
          label="Motif (facultatif)"
          confirmLabel="Générer la carte"
          danger={false}
          required={false}
          onConfirm={create}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
const FamilyCardView: React.FC<Props> = ({ studentId }) => {
  const cards = useFetch(() => listCards<FamilyCard>(studentId), [studentId]);
  const current = cards.data?.[0];

  if (cards.error && cards.data === undefined) return <ErrorState message={cards.error} onRetry={cards.reload} />;
  if (cards.data === undefined) return <Spinner />;
  if (!current) {
    return (
      <div className="panel">
        <EmptyState title="Carte pas encore disponible" hint="La carte de votre enfant n'a pas encore été éditée par l'établissement." />
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">Carte en vigueur (version {current.version}), éditée le {formatDateTime(current.createdAt)}.</p>
      <FamilyCardPdf studentId={studentId} card={current} />
    </div>
  );
};

const FamilyCardPdf: React.FC<{ studentId: string; card: FamilyCard }> = ({ studentId, card }) => {
  const pdf = useFetch(() => fetchCurrentCard(studentId), [studentId, card.id]);
  return <PdfViewer state={pdf} title="Carte du talibé" filename={`carte-talibe-v${card.version}.pdf`} />;
};
