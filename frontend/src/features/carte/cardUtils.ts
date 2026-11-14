import type { StudentCard } from '../../types/documents';

export type BatchState = 'pending' | 'done' | 'failed';

export interface BatchRow {
  studentId: string;
  state: BatchState;
  version?: number;
  message?: string;
}

/** Découpe une liste en paquets de taille fixe (limite du serveur, concurrence des requêtes). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('La taille de paquet doit être positive.');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Marge pour l'écart entre l'horloge du serveur et la date de création de la carte. */
const SKEW_MS = 5_000;

/** Parmi l'historique d'un talibé, la version créée par le lot lancé à `startedAt` (la plus récente). */
export function cardCreatedSince(cards: StudentCard[], startedAt: number): StudentCard | undefined {
  return cards
    .filter(c => Date.parse(c.createdAt) >= startedAt - SKEW_MS)
    .sort((a, b) => b.version - a.version)[0];
}

/** Libellé court de l'état d'un talibé dans un lot. */
export function batchRowLabel(row: BatchRow, finished: boolean): string {
  if (row.state === 'done') return `Version ${row.version} générée`;
  if (row.state === 'failed') return row.message || 'Échec de la génération';
  return finished ? 'Non générée, ou encore en cours' : 'En cours…';
}

/** Synthèse d'un lot : « 12 générées, 2 en échec ». */
export function batchSummary(rows: BatchRow[], finished: boolean): string {
  const done = rows.filter(r => r.state === 'done').length;
  const failed = rows.filter(r => r.state === 'failed').length;
  const pending = rows.length - done - failed;
  const parts = [`${done} générée${done > 1 ? 's' : ''}`];
  if (failed) parts.push(`${failed} en échec`);
  if (pending) parts.push(finished ? `${pending} non confirmée${pending > 1 ? 's' : ''}` : `${pending} en cours`);
  return parts.join(', ');
}
