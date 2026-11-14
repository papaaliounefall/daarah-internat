import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Menu } from 'lucide-react';
import { ROLE_LABEL, navItemFor } from '../../app/navigation';
import { http } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import type { AppNotification } from '../../types';
import { Button } from '../ui';

interface Props { onMenu: () => void; menuOpen?: boolean }

export const Header: React.FC<Props> = ({ onMenu, menuOpen }) => {
  const { pathname } = useLocation();
  const section = navItemFor(pathname);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState<'notif' | 'user' | null>(null);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // Compteur rafraîchi toutes les 60 s (connexion parfois instable : échecs silencieux).
  useEffect(() => {
    let stop = false;
    const tick = () =>
      http.get<{ count: number }>('/notifications/unread-count/')
        .then(r => { if (!stop) setUnread(r.data.count); })
        .catch(() => undefined);
    tick();
    const t = setInterval(tick, 60000);
    // La page Notifications signale ses lectures pour que le compteur se mette à jour aussitôt.
    window.addEventListener('daara:notifications-changed', tick);
    return () => { stop = true; clearInterval(t); window.removeEventListener('daara:notifications-changed', tick); };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openNotifications = async () => {
    setOpen(o => (o === 'notif' ? null : 'notif'));
    try {
      const r = await http.get<{ results: AppNotification[] }>('/notifications/', { params: { pageSize: 8 } });
      setItems(r.data.results);
    } catch { /* la liste reste vide */ }
  };

  const markAll = async () => {
    try { await http.post('/notifications/read-all/'); setUnread(0); setItems(i => i.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))); } catch { /* ignore */ }
  };

  const doLogout = async () => { await logout(); navigate('/connexion', { replace: true }); };

  if (!user) return null;
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4">
      <button onClick={onMenu} className="mr-1 rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Menu" aria-expanded={menuOpen}>
        <Menu className="h-5 w-5" />
      </button>
      <Link to="/app" className="flex min-w-0 flex-1 items-center gap-2 px-2 lg:hidden" aria-label="Accueil">
        <img src="/logo.png" alt="" className="h-8 w-auto shrink-0" />
        <span className="truncate text-sm font-semibold text-brand-800">Shaykh Aliou Fatima</span>
      </Link>
      <p className="hidden flex-1 truncate px-2 text-sm font-semibold text-ink lg:block">{section?.label ?? ''}</p>

      <div ref={box} className="flex items-center gap-2">
        <div className="relative">
          <button onClick={openNotifications} className="relative rounded p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} non lues)`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
          </button>
          {open === 'notif' && (
            <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-md border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-sm font-medium">Notifications</span>
                {unread > 0 && <button onClick={markAll} className="text-xs text-brand-700 hover:underline">Tout marquer comme lu</button>}
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Aucune notification.</li>}
                {items.map(n => (
                  <li key={n.id} className={`border-b border-line px-3 py-2 text-sm last:border-0 ${n.readAt ? '' : 'bg-brand-50/50'}`}>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-slate-600">{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-3 py-2 text-center">
                <Link to="/app/notifications" onClick={() => setOpen(null)} className="text-sm font-medium text-brand-700 hover:underline">
                  Voir toutes les notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setOpen(o => (o === 'user' ? null : 'user'))} className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-xs font-semibold text-white" aria-hidden>
              {(user.firstName || user.username).charAt(0).toUpperCase()}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-medium">{user.fullName}</span>
              <span className="block text-xs text-slate-500">{ROLE_LABEL[user.role]}</span>
            </span>
          </button>
          {open === 'user' && (
            <div className="absolute right-0 mt-2 w-56 rounded-md border border-line bg-white p-1">
              <Button variant="ghost" className="w-full justify-start" onClick={() => { setOpen(null); navigate('/app/profil'); }}><KeyRound className="h-4 w-4" /> Mon profil</Button>
              <Button variant="ghost" className="w-full justify-start" onClick={doLogout}><LogOut className="h-4 w-4" /> Se déconnecter</Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
