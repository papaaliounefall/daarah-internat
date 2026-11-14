import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, CheckCheck, Send } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { plainErrorMessage } from '../../lib/apiErrors';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../stores/authStore';
import {
  announceNotificationsChanged, createAnnouncement, listAnnouncements, listNotifications,
  markAllNotificationsRead, markNotificationRead,
} from '../../services/notifications';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, SelectField, Spinner, TextAreaField, TextField, useToast,
} from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import type { NotificationKind, Role } from '../../types';
import { AUDIENCE_ROLES, NOTIFICATION_KIND_LABEL, type NotificationItem } from '../../types/notifications';
import { MESSAGE_MAX, TITLE_MAX, audienceLabel, notificationLink, validateAnnouncement } from './notificationUtils';

const PAGE_SIZE = 20;

type TabId = 'notifications' | 'informations';

/** Notifications personnelles et informations du Daara (annonces par rôles). */
export const NotificationsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('onglet') === 'informations' ? 'informations' : 'notifications';
  const tabs: { id: TabId; label: string }[] = [
    { id: 'notifications', label: 'Mes notifications' },
    { id: 'informations', label: 'Informations du Daara' },
  ];

  return (
    <div>
      <PageHeader title="Notifications" description="Vos alertes personnelles et les informations diffusées par l'établissement." />
      <div role="tablist" aria-label="Sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(t => (
          <button
            key={t.id}
            id={`notif-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls="notif-panel"
            onClick={() => setParams(t.id === 'notifications' ? {} : { onglet: t.id }, { replace: true })}
            className={`-mb-px min-h-10 shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="notif-panel" aria-labelledby={`notif-tab-${tab}`}>
        {tab === 'notifications' ? <MyNotifications /> : <Announcements />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
type ReadFilter = 'all' | 'unread' | 'read';

const MyNotifications: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  const toast = useToast();
  const [read, setRead] = useState<ReadFilter>('all');
  const [kind, setKind] = useState<NotificationKind | ''>('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => { setPage(1); }, [read, kind]);

  const unread = read === 'all' ? undefined : read === 'unread';
  const list = useFetch(() => listNotifications({ page, pageSize: PAGE_SIZE, unread, kind }), [page, read, kind]);

  const markOne = async (n: NotificationItem) => {
    if (n.isRead) return;
    setBusyId(n.id);
    try {
      await markNotificationRead(n.id);
      announceNotificationsChanged();
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const { updated } = await markAllNotificationsRead(kind);
      toast.success(updated > 0 ? `${updated} notification${updated > 1 ? 's' : ''} marquée${updated > 1 ? 's' : ''} comme lue${updated > 1 ? 's' : ''}.` : 'Aucune notification à marquer.');
      announceNotificationsChanged();
      setConfirmAll(false);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Affichage" value={read} onChange={e => setRead(e.target.value as ReadFilter)}>
            <option value="all">Toutes</option>
            <option value="unread">Non lues</option>
            <option value="read">Lues</option>
          </SelectField>
          <SelectField label="Type" value={kind} onChange={e => setKind(e.target.value as NotificationKind | '')}>
            <option value="">Tous les types</option>
            {(Object.keys(NOTIFICATION_KIND_LABEL) as NotificationKind[]).map(k => (
              <option key={k} value={k}>{NOTIFICATION_KIND_LABEL[k]}</option>
            ))}
          </SelectField>
        </div>
        <Button variant="secondary" onClick={() => setConfirmAll(true)} disabled={read === 'read'}>
          <CheckCheck className="h-4 w-4" aria-hidden /> Tout marquer comme lu
        </Button>
      </div>

      <div className="panel overflow-hidden">
        {list.error && list.data === undefined ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.data === undefined ? (
          <Spinner />
        ) : list.data.results.length === 0 ? (
          <EmptyState
            title={read === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
            hint={read === 'all' && !kind ? 'Les alertes qui vous concernent apparaîtront ici.' : 'Modifiez les filtres pour voir d\'autres notifications.'}
          />
        ) : (
          <div aria-busy={list.loading} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-line">
              {list.data.results.map(n => {
                const href = notificationLink(n.linkType, n.linkId, role);
                return (
                  <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${n.isRead ? '' : 'bg-brand-50/50'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Non lue" role="img" />}
                        {n.title}
                        <Badge tone={n.kind === 'FINANCE' ? 'gold' : 'neutral'}>{NOTIFICATION_KIND_LABEL[n.kind] ?? n.kindDisplay}</Badge>
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{n.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {href && (
                        <Link
                          to={href}
                          onClick={() => void markOne(n)}
                          className="inline-flex items-center rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-slate-50"
                        >
                          Ouvrir
                        </Link>
                      )}
                      {!n.isRead && (
                        <Button variant="secondary" size="sm" loading={busyId === n.id} onClick={() => void markOne(n)}>
                          <Check className="h-4 w-4" aria-hidden /> Marquer comme lu
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPage={setPage} />
          </div>
        )}
      </div>

      {confirmAll && (
        <ConfirmDialog
          title="Tout marquer comme lu"
          message={kind ? `Toutes vos notifications non lues de type « ${NOTIFICATION_KIND_LABEL[kind]} » seront marquées comme lues.` : 'Toutes vos notifications non lues seront marquées comme lues.'}
          confirmLabel="Marquer comme lu"
          loading={markingAll}
          onConfirm={() => void markAll()}
          onCancel={() => setConfirmAll(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------
const Announcements: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  const canPost = role === 'DIRECTEUR' || role === 'ASSISTANT';
  const [page, setPage] = useState(1);
  const list = useFetch(() => listAnnouncements(page, PAGE_SIZE), [page]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section aria-label="Historique des informations">
        <h2 className="mb-2 text-sm font-semibold text-ink">{canPost ? 'Historique des informations diffusées' : 'Informations reçues'}</h2>
        <div className="panel overflow-hidden">
          {list.error && list.data === undefined ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : list.data === undefined ? (
            <Spinner />
          ) : list.data.results.length === 0 ? (
            <EmptyState title="Aucune information" hint={canPost ? 'Utilisez le formulaire pour diffuser une première information.' : 'Les informations de l\'établissement apparaîtront ici.'} />
          ) : (
            <div aria-busy={list.loading} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
              <ul className="divide-y divide-line">
                {list.data.results.map(a => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{a.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(a.createdAt)}{a.createdByName ? ` — ${a.createdByName}` : ''}
                      {canPost && ` — Destinataires : ${audienceLabel(a.audience)}`}
                    </p>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} count={list.data.count} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      {canPost && <AnnouncementForm onSent={() => { setPage(1); list.reload(); }} />}
    </div>
  );
};

const AnnouncementForm: React.FC<{ onSent: () => void }> = ({ onSent }) => {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Role[]>([]);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = validateAnnouncement(title, message);
  const invalid = Boolean(errors.title || errors.message);

  const toggle = (r: Role) => setAudience(a => (a.includes(r) ? a.filter(x => x !== r) : [...a, r]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!invalid) setConfirming(true);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAnnouncement({ title: title.trim(), message: message.trim(), audience });
      toast.success('Information diffusée.');
      setTitle(''); setMessage(''); setAudience([]); setTouched(false);
      setConfirming(false);
      onSent();
    } catch (err) {
      setConfirming(false);
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Nouvelle information">
      <form onSubmit={submit} className="panel space-y-4 p-4" noValidate>
        <h2 className="text-sm font-semibold text-ink">Diffuser une information</h2>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField
          label="Titre"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={e => setTitle(e.target.value)}
          error={touched ? errors.title : undefined}
        />
        <TextAreaField
          label="Message"
          required
          rows={6}
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={e => setMessage(e.target.value)}
          error={touched ? errors.message : undefined}
          hint={`${message.length} / ${MESSAGE_MAX} caractères`}
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Destinataires</legend>
          <div className="space-y-1">
            {AUDIENCE_ROLES.map(a => (
              <label key={a.role} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={audience.includes(a.role)} onChange={() => toggle(a.role)} />
                {a.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Aucune case cochée : l'information est envoyée à tous les rôles de l'établissement.</p>
        </fieldset>
        <Button type="submit"><Send className="h-4 w-4" aria-hidden /> Diffuser</Button>
      </form>

      {confirming && (
        <ConfirmDialog
          title="Diffuser cette information"
          message={
            <>
              <p>« {title.trim()} » sera envoyée sous forme de notification à : <strong>{audienceLabel(audience)}</strong>.</p>
              <p className="mt-2 text-slate-500">Une information diffusée ne peut être ni modifiée ni supprimée ; en cas d'erreur, diffusez une correction.</p>
            </>
          }
          confirmLabel="Diffuser"
          loading={busy}
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
};
