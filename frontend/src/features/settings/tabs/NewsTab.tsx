import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { errorMessage } from '../../../lib/api';
import { plainErrorMessage } from '../../../lib/apiErrors';
import { formatDate } from '../../../lib/format';
import { useFetch } from '../../../hooks/useFetch';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { createNews, deleteNews, listNews, updateNews } from '../../../services/site';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, TextAreaField, TextField, useToast,
} from '../../../components/ui';
import { Pagination } from '../../../components/ui/Pagination';
import type { NewsPost } from '../../../types/site';
import { validateImageFile } from './site/mediaUtils';
import {
  NEWS_LIMITS, emptyNewsForm, toNewsForm, validateNews, type NewsErrors, type NewsForm,
} from './site/newsUtils';

const PAGE_SIZE = 20;

/** Actualités du site public : liste, création, modification et suppression. */
export const NewsTab: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<NewsPost | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<NewsPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setPage(1); }, [debounced]);
  const list = useFetch(() => listNews({ page, pageSize: PAGE_SIZE, search: debounced }), [page, debounced]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteNews(toDelete.id);
      toast.success('Actualité supprimée.');
      setToDelete(null);
      // Dernière actualité de la page supprimée : revenir à la page précédente.
      if (list.data && list.data.results.length === 1 && page > 1) setPage(page - 1);
      else list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <label htmlFor="news-search" className="sr-only">Rechercher une actualité</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="news-search" type="search" className="input pl-9" placeholder="Titre ou résumé" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Ajouter une actualité</Button>
      </div>
      <p className="mb-3 text-sm text-slate-500">Seules les actualités publiées apparaissent sur le site, de la plus récente à la plus ancienne.</p>

      <div className="panel overflow-hidden">
        {list.error && list.data === undefined ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data === undefined ? (
          <Spinner />
        ) : list.data.results.length === 0 ? (
          <EmptyState
            title={debounced ? 'Aucune actualité trouvée' : 'Aucune actualité'}
            hint={debounced ? 'Modifiez votre recherche.' : 'Ajoutez une première actualité : la section n\'est affichée sur le site que si au moins une est publiée.'}
          />
        ) : (
          <div aria-busy={list.loading} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-line">
              {list.data.results.map(n => (
                <li key={n.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-xs text-slate-400">
                    {n.imageUrl ? <img src={n.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : 'Sans image'}
                  </div>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {n.title}
                      {n.isPublished ? <Badge tone="success">Publiée</Badge> : <Badge>Brouillon</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(n.publishedOn)}</p>
                    {n.summary && <p className="mt-1 text-sm text-slate-700">{n.summary}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(n)} aria-label={`Modifier l'actualité ${n.title}`}><Pencil className="h-4 w-4" aria-hidden /> Modifier</Button>
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(n)} aria-label={`Supprimer l'actualité ${n.title}`}><Trash2 className="h-4 w-4" aria-hidden /> Supprimer</Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPage={setPage} />
          </div>
        )}
      </div>

      {editing && (
        <NewsFormModal
          news={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload(); }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Supprimer l'actualité"
          message={<>L'actualité « {toDelete.title} » sera définitivement supprimée du site. Cette action est irréversible.</>}
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
const NewsFormModal: React.FC<{ news: NewsPost | null; onClose: () => void; onSaved: () => void }> = ({ news, onClose, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<NewsForm>(() => (news ? toNewsForm(news) : emptyNewsForm()));
  const [errors, setErrors] = useState<NewsErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = <K extends keyof NewsForm>(k: K, v: NewsForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const shownImage = preview ?? (removeImage ? null : news?.imageUrl ?? null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = validateImageFile(f);
    setImageError(problem);
    if (problem) return;
    setFile(f);
    setRemoveImage(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateNews(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setServerError(null);
    const body = {
      title: form.title.trim(), summary: form.summary.trim(), body: form.body.trim(),
      publishedOn: form.publishedOn, isPublished: form.isPublished,
      image: file ?? (removeImage ? null : undefined),
    };
    try {
      if (news) await updateNews(news.id, body); else await createNews(body);
      toast.success(news ? 'Actualité modifiée.' : 'Actualité ajoutée.');
      onSaved();
    } catch (err) {
      setServerError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const formId = 'news-form';
  return (
    <Modal
      title={news ? 'Modifier l\'actualité' : 'Ajouter une actualité'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form={formId} loading={busy}>{news ? 'Enregistrer' : 'Ajouter'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}
        <TextField label="Titre" required maxLength={NEWS_LIMITS.title} value={form.title} onChange={e => set('title', e.target.value)} error={errors.title} />
        <TextAreaField label="Résumé" rows={2} maxLength={NEWS_LIMITS.summary} value={form.summary} onChange={e => set('summary', e.target.value)} error={errors.summary} hint="Une ou deux phrases affichées dans la liste des actualités." />
        <TextAreaField label="Texte" rows={6} maxLength={NEWS_LIMITS.body} value={form.body} onChange={e => set('body', e.target.value)} error={errors.body} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date de publication" type="date" required value={form.publishedOn} onChange={e => set('publishedOn', e.target.value)} error={errors.publishedOn} />
          <div className="flex items-end">
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.isPublished} onChange={e => set('isPublished', e.target.checked)} />
              Publiée sur le site
            </label>
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-ink">Image (facultative)</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-xs text-slate-500">
              {shownImage ? <img src={shownImage} alt="Aperçu de l'image" className="h-full w-full object-cover" /> : 'Aucune image'}
            </div>
            <div className="space-y-2">
              <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Choisir une image" onChange={pick} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
                  <ImagePlus className="h-4 w-4" aria-hidden /> {shownImage ? 'Remplacer l\'image' : 'Choisir une image'}
                </Button>
                {shownImage && (
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); setRemoveImage(true); setImageError(null); }}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Retirer l'image
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">Image uniquement, 5 Mo au maximum.</p>
              {imageError && <p role="alert" className="text-xs text-danger">{imageError}</p>}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
