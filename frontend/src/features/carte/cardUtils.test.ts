import { describe, expect, it } from 'vitest';
import { batchRowLabel, batchSummary, cardCreatedSince, chunk, type BatchRow } from './cardUtils';
import type { StudentCard } from '../../types/documents';

const card = (version: number, createdAt: string): StudentCard => ({
  id: `c${version}`, student: 's', version, isCurrent: false, reason: '', generatedByName: '', pdfUrl: null,
  downloadUrl: '', createdAt, snapshot: {} as StudentCard['snapshot'],
});

describe('chunk', () => {
  it('découpe en paquets', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it('refuse une taille invalide', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('cardCreatedSince', () => {
  const t = Date.parse('2026-11-07T10:00:00Z');
  it('retient la version la plus récente créée depuis le lancement', () => {
    const cards = [card(3, '2026-11-07T10:00:02Z'), card(2, '2026-10-01T10:00:00Z'), card(1, '2026-09-01T10:00:00Z')];
    expect(cardCreatedSince(cards, t)?.version).toBe(3);
  });
  it('ignore les cartes antérieures au lot', () => {
    expect(cardCreatedSince([card(2, '2026-11-06T10:00:00Z')], t)).toBeUndefined();
  });
  it('tolère un léger décalage d\'horloge', () => {
    expect(cardCreatedSince([card(2, '2026-11-07T09:59:57Z')], t)?.version).toBe(2);
  });
});

describe('synthèse de lot', () => {
  const rows: BatchRow[] = [
    { studentId: 'a', state: 'done', version: 2 },
    { studentId: 'b', state: 'failed', message: 'Erreur' },
    { studentId: 'c', state: 'pending' },
  ];
  it('compte chaque état', () => {
    expect(batchSummary(rows, false)).toBe('1 générée, 1 en échec, 1 en cours');
    expect(batchSummary(rows, true)).toBe('1 générée, 1 en échec, 1 non confirmée');
  });
  it('libellé par ligne', () => {
    expect(batchRowLabel(rows[0], true)).toBe('Version 2 générée');
    expect(batchRowLabel(rows[1], true)).toBe('Erreur');
    expect(batchRowLabel(rows[2], false)).toBe('En cours…');
  });
});
