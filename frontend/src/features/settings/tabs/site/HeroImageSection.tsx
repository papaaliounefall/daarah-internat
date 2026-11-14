import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { plainErrorMessage } from '../../../../lib/apiErrors';
import { removeHeroImage, uploadHeroImage } from '../../../../services/site';
import { Button, ConfirmDialog, useToast } from '../../../../components/ui';
import { validateImageFile } from './mediaUtils';

/** Photo d'accueil : enregistrée immédiatement (envoi séparé du reste du formulaire). */
export const HeroImageSection: React.FC<{ url: string | null; onChange: (url: string | null) => void }> = ({ url, onChange }) => {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const saved = await uploadHeroImage(file);
      onChange(saved.heroImageUrl);
      toast.success("Photo d'accueil enregistrée.");
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeHeroImage();
      onChange(null);
      toast.success("Photo d'accueil retirée.");
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink">Photo d'accueil</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-32 w-52 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-xs text-slate-500">
          {url ? <img src={url} alt="Aperçu de la photo d'accueil" className="h-full w-full object-cover" /> : 'Aucune photo'}
        </div>
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Choisir la photo d'accueil" onChange={e => void pick(e)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden /> {url ? 'Remplacer la photo' : 'Téléverser une photo'}
            </Button>
            {url && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Retirer la photo
              </Button>
            )}
          </div>
          <p className="max-w-sm text-xs text-slate-500">Image uniquement, 5 Mo au maximum. La photo est enregistrée dès son envoi. Sans photo, la section n'est pas affichée.</p>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Retirer la photo d'accueil"
          message="La photo ne sera plus affichée sur la page d'accueil du site."
          confirmLabel="Retirer"
          danger
          loading={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
};
