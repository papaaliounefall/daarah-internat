import { http } from '../lib/api';
import { fetchPdf } from './documents';
import type { BatchQueued, FamilyCard, StudentCard } from '../types/documents';

/** Aperçu avec les données ACTUELLES du dossier (rien n'est enregistré). */
export const fetchCardPreview = (studentId: string) => fetchPdf(`/students/${studentId}/card/preview/`);

/** Carte courante enregistrée (directeur, assistant, parent de l'enfant). */
export const fetchCurrentCard = (studentId: string) => fetchPdf(`/students/${studentId}/card/`);

/** Une version précise. */
export const fetchCardVersion = (cardId: string) => fetchPdf(`/cards/${cardId}/pdf/`);

export const listCards = <T extends StudentCard | FamilyCard = StudentCard>(studentId: string) =>
  http.get<T[]>(`/students/${studentId}/cards/`).then(r => r.data);

/** Génère et enregistre la version suivante ; `reason` vide = motif par défaut du serveur. */
export const generateCard = (studentId: string, reason: string) =>
  http.post<StudentCard>(`/students/${studentId}/card/`, reason.trim() ? { reason: reason.trim() } : {}).then(r => r.data);

/** Maximum de talibés par requête de lot (limite du serveur). */
export const BATCH_LIMIT = 200;

/**
 * Lance la génération en lot. Le serveur répond `202 {queued}` sans détail par talibé ;
 * `startedAt` (heure du serveur, à défaut celle du navigateur) sert à vérifier ensuite quelles cartes sont créées.
 */
export async function generateBatch(studentIds: string[], reason: string): Promise<{ queued: number; startedAt: number }> {
  const res = await http.post<BatchQueued>('/cards/batch/', {
    students: studentIds, ...(reason.trim() ? { reason: reason.trim() } : {}),
  });
  const header = res.headers?.date;
  const server = header ? Date.parse(String(header)) : NaN;
  return { queued: res.data.queued, startedAt: Number.isNaN(server) ? Date.now() : server };
}
