import { http, type Page } from '../lib/api';
import type { NotificationKind, Role } from '../types';
import type { Announcement, NotificationItem } from '../types/notifications';

export interface NotificationQuery {
  page: number;
  pageSize: number;
  /** true : non lues ; false : lues ; absent : toutes. */
  unread?: boolean;
  kind?: NotificationKind | '';
}

export const listNotifications = (q: NotificationQuery) => {
  const params: Record<string, unknown> = { page: q.page, pageSize: q.pageSize };
  if (q.unread !== undefined) params.unread = q.unread;
  if (q.kind) params.kind = q.kind;
  return http.get<Page<NotificationItem>>('/notifications/', { params }).then(r => r.data);
};

export const markNotificationRead = (id: string) =>
  http.post<NotificationItem>(`/notifications/${id}/read/`).then(r => r.data);

export const markAllNotificationsRead = (kind?: NotificationKind | '') =>
  http.post<{ updated: number }>('/notifications/read-all/', kind ? { kind } : {}).then(r => r.data);

/** Prévient l'en-tête (compteur de non lues) qu'il doit se rafraîchir. */
export const NOTIFICATIONS_CHANGED = 'daara:notifications-changed';
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

export const listAnnouncements = (page: number, pageSize: number) =>
  http.get<Page<Announcement>>('/announcements/', { params: { page, pageSize } }).then(r => r.data);

export const createAnnouncement = (body: { title: string; message: string; audience: Role[] }) =>
  http.post<Announcement>('/announcements/', body).then(r => r.data);
