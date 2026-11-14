import type { Role } from '../../types';
import { AUDIENCE_ROLES } from '../../types/notifications';

export const TITLE_MAX = 200;
export const MESSAGE_MAX = 5000;

/** « Tous les rôles » si l'audience est vide, sinon la liste des rôles destinataires. */
export function audienceLabel(audience: Role[]): string {
  if (!audience || audience.length === 0) return 'Tous les rôles';
  return AUDIENCE_ROLES.filter(a => audience.includes(a.role)).map(a => a.label).join(', ');
}

export interface AnnouncementErrors { title?: string; message?: string }

/** Contrôle côté navigateur (le serveur revalide). */
export function validateAnnouncement(title: string, message: string): AnnouncementErrors {
  const errors: AnnouncementErrors = {};
  if (!title.trim()) errors.title = 'Le titre est obligatoire.';
  else if (title.trim().length > TITLE_MAX) errors.title = `Le titre ne doit pas dépasser ${TITLE_MAX} caractères.`;
  if (!message.trim()) errors.message = 'Le message est obligatoire.';
  else if (message.trim().length > MESSAGE_MAX) errors.message = `Le message ne doit pas dépasser ${MESSAGE_MAX} caractères.`;
  return errors;
}

const STAFF: Role[] = ['DIRECTEUR', 'ASSISTANT', 'MAITRE'];

/**
 * Page de l'application associée à une notification (null si aucune page utile pour ce rôle).
 * Les types `link_type` proviennent du serveur (`student`, `due`, `announcement`, `contact_request`, `visit`).
 */
export function notificationLink(linkType: string, linkId: string, role: Role): string | null {
  switch (linkType) {
    case 'student':
      if (role === 'PARENT') return '/app/mes-enfants';
      return linkId && STAFF.includes(role) ? `/app/talibes/${linkId}` : null;
    case 'due':
      return role === 'DIRECTEUR' || role === 'ASSISTANT' ? '/app/finances' : null;
    case 'announcement':
      return '/app/notifications?onglet=informations';
    case 'contact_request':
      return role === 'DIRECTEUR' || role === 'ASSISTANT' ? '/app/parametres?onglet=demandes' : null;
    case 'visit':
      return role === 'MAITRE' ? null : '/app/visites';
    default:
      return null;
  }
}
