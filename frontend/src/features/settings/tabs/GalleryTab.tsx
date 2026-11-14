import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { errorMessage } from '../../../lib/api';
import { plainErrorMessage } from '../../../lib/apiErrors';
import { useFetch } from '../../../hooks/useFetch';
import { addGalleryImage, deleteGalleryImage, listGallery, updateGalleryImage } from '../../../services/site';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, TextField, useToast,
} from '../../../components/ui';
import type { GalleryImage } from '../../../types/site';
import { reorderUpdates, sortByOrder, validateImageFile } from './site/mediaUtils';

const CAPTION_MAX = 200;

/** Galerie du site public : miniatures, ajout multiple, légende, ordre, publication et suppression. */
export const GalleryTab: React.FC = () => {
  const toast = useToast();
  const list = useFetch(listGallery, []);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  const [toDelete, setToDelete] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);

  const items = useMemo(() => sortByOrder(list.data ?? []), [list.data]);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const problems = files.map(validateImageFile).filter((p): p is string => p !== null);
    const valid = files.filter(f => validateImageFile(f) === null);
    setPickError(problems.length ? `Fichier(s) ignoré(s) : ${problems.join(' ')}` : null);
    if (valid.length) setPicked(valid);
  };

  const move = async (index: number, delta: -1 | 1) => {
    const changes = reorderUpdates(items, index, delta);
    if (changes.length === 0) return;
    setMoving(true);
    try {
      await Promise.all(changes.map(c => updateGalleryImage(c.id, { order: c.order })));
      const byId = new Map(changes.map(c => [c.id, c.order]));
      list.setData(items.map(it => (byId.has(it.id) ? { ...it, order: byId.get(it.id)! } : it)));
    } catch (e) {
      toast.error(errorMessage(e));
      list.reload();
    } finally {
      setMoving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteGalleryImage(toDelete.id);
      toast.success('Image supprimée.');
      setToDelete(null);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-slate-500">
          Seules les images publiées apparaissent sur le site, dans l'ordre ci-dessous. Ne publiez pas de photo d'enfant sans l'accord de sa famille.
        </p>
        <div>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choisir des images" onChange={onFiles} />
          <Button onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden /> Ajouter des images</Button>
        </div>
      </div>
      {pickError && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{pickError}</p>}

      <div className="panel p-4">
        {list.error && list.data === undefined ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data === undefined ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Aucune image" hint="Ajoutez des images : la galerie n'est affichée sur le site que si au moins une image est publiée." />
        ) : (
          <ul aria-busy={list.loading || moving} className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${moving ? 'opacity-60' : ''}`}>
            {items.map((g, i) => (
              <li key={g.id} className="flex flex-col overflow-hidden rounded-md border border-line">
                <div className="aspect-[4/3] bg-slate-50">
                  {g.imageUrl && <img src={g.imageUrl} alt={g.caption || 'Image de la galerie'} className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  <p className="min-h-5 text-sm text-slate-700">{g.caption || <span className="text-slate-400">Sans légende</span>}</p>
                  <div className="flex items-center justify-between gap-1">
                    {g.isPublished ? <Badge tone="success">Publiée</Badge> : <Badge>Masquée</Badge>}
                    <span className="text-xs text-slate-500">N° {i + 1}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" disabled={i === 0 || moving} onClick={() => void move(i, -1)} aria-label={`Placer plus tôt : image ${i + 1}`}><ArrowLeft className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="ghost" size="sm" disabled={i === items.length - 1 || moving} onClick={() => void move(i, 1)} aria-label={`Placer plus tard : image ${i + 1}`}><ArrowRight className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(g)} aria-label={`Modifier l'image ${i + 1}`}><Pencil className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(g)} aria-label={`Supprimer l'image ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked && (
        <UploadModal
          files={picked}
          startOrder={items.length ? Math.max(...items.map(g => g.order)) + 1 : 0}
          onClose={() => setPicked(null)}
          onDone={() => { setPicked(null); list.reload(); }}
        />
      )}
      {editing && (
        <EditModal
          image={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload(); }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Supprimer l'image"
          message="Cette image sera définitivement retirée de la galerie du site. Cette action est irréversible."
          confirmLabel="Supprimer"
          danger
          loading={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
const UploadModal: React.FC<{ files: File[]; startOrder: number; onClose: () => void; onDone: () => void }> = ({ files, startOrder, onClose, onDone }) => {
  const toast = useToast();
  const [captions, setCaptions] = useState<string[]>(() => files.map(() => ''));
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Set<number>>(new Set());
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const created = files.map(f => URL.createObjectURL(f));
    setUrls(created);
    return () => created.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const nextErrors: Record<number, string> = {};
    const nextDone = new Set(done);
    for (const [i, file] of files.entries()) {
      if (nextDone.has(i)) continue;
      try {
        await addGalleryImage({ image: file, caption: captions[i].trim(), order: startOrder + i, isPublished: published });
        nextDone.add(i);
      } catch (err) {
        nextErrors[i] = plainErrorMessage(err);
      }
    }
    setDone(nextDone);
    setErrors(nextErrors);
    setBusy(false);
    if (nextDone.size === files.length) {
      toast.success(files.length > 1 ? `${files.length} images ajoutées.` : 'Image ajoutée.');
      onDone();
    }
  };

  const formId = 'gallery-upload-form';
  return (
    <Modal
      title={files.length > 1 ? `Ajouter ${files.length} images` : 'Ajouter une image'}
      size="lg"
      onClose={busy ? () => undefined : (done.size > 0 ? onDone : onClose)}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={done.size > 0 ? onDone : onClose}>{done.size > 0 ? 'Fermer' : 'Annuler'}</Button>
          <Button type="submit" form={formId} loading={busy}>{Object.keys(errors).length ? 'Réessayer' : 'Ajouter'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3">
        <ul className="space-y-3">
          {files.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              {urls[i] ? <img src={urls[i]} alt="" className="h-16 w-24 shrink-0 rounded-md border border-line object-cover" /> : <div className="h-16 w-24 shrink-0" />}
              <div className="min-w-0 flex-1">
                <TextField
                  label={`Légende de ${f.name}`}
                  maxLength={CAPTION_MAX}
                  value={captions[i]}
                  disabled={done.has(i) || busy}
                  onChange={e => setCaptions(c => c.map((v, n) => (n === i ? e.target.value : v)))}
                  hint={done.has(i) ? 'Ajoutée.' : 'Facultative.'}
                  error={errors[i]}
                />
              </div>
            </li>
          ))}
        </ul>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={published} disabled={busy} onChange={e => setPublished(e.target.checked)} />
          Publier sur le site
        </label>
      </form>
    </Modal>
  );
};

const EditModal: React.FC<{ image: GalleryImage; onClose: () => void; onSaved: () => void }> = ({ image, onClose, onSaved }) => {
  const toast = useToast();
  const [caption, setCaption] = useState(image.caption ?? '');
  const [published, setPublished] = useState(image.isPublished);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateGalleryImage(image.id, { caption: caption.trim(), isPublished: published });
      toast.success('Image modifiée.');
      onSaved();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const formId = 'gallery-edit-form';
  return (
    <Modal
      title="Modifier l'image"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form={formId} loading={busy}>Enregistrer</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {image.imageUrl && <img src={image.imageUrl} alt={image.caption || 'Image de la galerie'} className="max-h-48 w-full rounded-md border border-line object-contain" />}
        <TextField label="Légende" maxLength={CAPTION_MAX} value={caption} onChange={e => setCaption(e.target.value)} hint="Facultative. Pour changer l'ordre, utilisez les flèches sur la miniature." />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={published} onChange={e => setPublished(e.target.checked)} />
          Publiée sur le site
        </label>
      </form>
    </Modal>
  );
};
