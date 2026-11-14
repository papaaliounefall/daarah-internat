import { describe, expect, it } from 'vitest';
import type { VisitRequest } from '../../types/visits';
import { adminActions, effectiveSlot, formatTime, isSlotPast, parentCanAnswerProposal, parentCanCancel, validateVisit } from './visitUtils';

const now = new Date(2026, 10, 7, 14, 30); // 7 nov. 2026, 14:30

describe('créneaux de visite', () => {
  it("formate l'heure", () => {
    expect(formatTime('10:00:00')).toBe('10:00');
    expect(formatTime('9:05')).toBe('09:05');
    expect(formatTime(null)).toBe('');
  });
  it('détecte un créneau passé', () => {
    expect(isSlotPast('2026-11-07', '10:00', now)).toBe(true);
    expect(isSlotPast('2026-11-07', '16:00', now)).toBe(false);
    expect(isSlotPast('2026-11-06', '23:00', now)).toBe(true);
    expect(isSlotPast('2026-11-08', '08:00', now)).toBe(false);
  });
  it('valide la demande', () => {
    expect(validateVisit({ student: '', date: '', time: '' }, now)).toEqual({ student: 'Choisissez un enfant.', date: 'Choisissez une date.', time: 'Indiquez une heure.' });
    expect(validateVisit({ student: 'a', date: '2026-11-06', time: '10:00' }, now).date).toMatch(/passé/);
    expect(validateVisit({ student: 'a', date: '2026-11-07', time: '09:00' }, now).time).toMatch(/passé/);
    expect(validateVisit({ student: 'a', date: '2026-11-07', time: '17:00' }, now)).toEqual({});
    expect(validateVisit({ student: 'a', date: '2026-11-10', time: '10:00' }, now)).toEqual({});
  });
});

describe('transitions', () => {
  it('le parent annule avant acceptation et répond à une proposition', () => {
    expect(parentCanCancel('EN_ATTENTE')).toBe(true);
    expect(parentCanCancel('MODIFICATION_PROPOSEE')).toBe(true);
    expect(parentCanCancel('ACCEPTEE')).toBe(false);
    expect(parentCanCancel('REFUSEE')).toBe(false);
    expect(parentCanAnswerProposal('MODIFICATION_PROPOSEE')).toBe(true);
    expect(parentCanAnswerProposal('EN_ATTENTE')).toBe(false);
  });
  it("l'administration suit la table de l'API", () => {
    expect(adminActions('EN_ATTENTE')).toEqual({ accept: true, refuse: true, propose: true });
    expect(adminActions('ACCEPTEE')).toEqual({ accept: false, refuse: true, propose: true });
    expect(adminActions('MODIFICATION_PROPOSEE')).toEqual({ accept: false, refuse: false, propose: true });
    expect(adminActions('REFUSEE')).toEqual({ accept: false, refuse: false, propose: false });
    expect(adminActions('ANNULEE')).toEqual({ accept: false, refuse: false, propose: false });
  });
  it('choisit le créneau pertinent', () => {
    const base = { requestedDate: '2026-11-10', requestedTime: '10:00:00', proposedDate: '2026-11-12', proposedTime: '11:00:00', confirmedDate: '2026-11-12', confirmedTime: '11:00:00' } as VisitRequest;
    expect(effectiveSlot({ ...base, status: 'EN_ATTENTE' }).date).toBe('2026-11-10');
    expect(effectiveSlot({ ...base, status: 'MODIFICATION_PROPOSEE' }).date).toBe('2026-11-12');
    expect(effectiveSlot({ ...base, status: 'ACCEPTEE' }).label).toBe('Visite confirmée');
  });
});
