import type { NotificationKind, Role } from './index';

/** Notification privée de l'utilisateur connecté. */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  kindDisplay: string;
  title: string;
  message: string;
  channel: string;
  linkType: string;
  linkId: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Information diffusée à des rôles (audience vide = tous les rôles). */
export interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: Role[];
  createdByName: string;
  createdAt: string;
}

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  CORAN: 'Suivi coranique',
  EVALUATION: 'Évaluation',
  PRESENCE: 'Présence',
  VISITE: 'Visite',
  FINANCE: 'Finance',
  GENERAL: 'Général',
};

/** Rôles destinataires possibles d'une annonce. */
export const AUDIENCE_ROLES: { role: Role; label: string }[] = [
  { role: 'DIRECTEUR', label: 'Directeur' },
  { role: 'ASSISTANT', label: 'Directeur assistant' },
  { role: 'MAITRE', label: 'Maîtres coraniques' },
  { role: 'PARENT', label: 'Parents et tuteurs' },
];
