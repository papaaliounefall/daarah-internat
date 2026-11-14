import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { FetchState } from '../../hooks/useFetch';
import { saveBlob } from '../../lib/format';
import { showPdf } from '../../services/documents';
import { Button, ErrorState, Spinner } from '../../components/ui';

interface Props {
  /** PDF récupéré avec le jeton (blob). */
  state: FetchState<Blob>;
  /** Titre accessible de l'aperçu. */
  title: string;
  /** Nom du fichier téléchargé. */
  filename: string;
  /** Boutons supplémentaires affichés à côté de « Imprimer » / « Télécharger ». */
  actions?: React.ReactNode;
}

/** Affiche un PDF reçu en blob dans un cadre, avec impression et téléchargement. */
export const PdfViewer: React.FC<Props> = ({ state, title, filename, actions }) => {
  const { data: blob, loading, error, reload } = state;
  const frame = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  // L'URL d'objet est créée à partir du blob puis libérée au changement / démontage.
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const print = () => {
    if (!blob) return;
    try {
      const win = frame.current?.contentWindow;
      if (!win) throw new Error('cadre indisponible');
      win.focus();
      win.print();
    } catch {
      showPdf(blob, filename); // le navigateur ne permet pas d'imprimer le cadre : ouverture du PDF
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={print} disabled={!blob}><Printer className="h-4 w-4" aria-hidden /> Imprimer</Button>
        <Button variant="secondary" size="sm" onClick={() => blob && saveBlob(blob, filename)} disabled={!blob}><Download className="h-4 w-4" aria-hidden /> Télécharger</Button>
        {actions}
      </div>
      <div className="panel overflow-hidden bg-slate-50" aria-busy={loading}>
        {error && !blob ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !blob || !url ? (
          <Spinner label="Préparation de la carte…" />
        ) : (
          <>
            {error && <p role="alert" className="border-b border-line bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <iframe ref={frame} src={url} title={title} className={`block h-72 w-full sm:h-96 ${loading ? 'opacity-50' : ''}`} />
          </>
        )}
      </div>
    </div>
  );
};
