import { assignableRooms, expectedReturnError, nowLocalInput, occupancyPercent, occupancyTone, roomOptionLabel, roomTitle } from './boardingUtils';
import type { Room } from '../../types/boarding';

const room = (over: Partial<Room>): Room => ({
  id: 'r', building: 'b', buildingName: 'Bâtiment A', number: '3', name: '', capacity: 4, occupancy: 3, freePlaces: 1,
  supervisor: null, supervisorName: '', isActive: true, ...over,
});

describe('internat', () => {
  it('nomme les chambres', () => {
    expect(roomTitle(room({}))).toBe('Bâtiment A — Chambre 3');
    expect(roomTitle(room({ name: 'Al-Fath' }))).toBe('Bâtiment A — Chambre 3 (Al-Fath)');
    expect(roomOptionLabel(room({}))).toBe('Bâtiment A — Chambre 3 — 3/4 places occupées');
  });
  it("calcule l'occupation", () => {
    expect(occupancyPercent(3, 4)).toBe(75);
    expect(occupancyPercent(0, 0)).toBe(0);
    expect(occupancyTone(4, 4)).toBe('danger');
    expect(occupancyTone(7, 8)).toBe('warning');
    expect(occupancyTone(2, 8)).toBe('success');
  });
  it('ne propose que les chambres actives avec une place libre', () => {
    const list = [room({ id: '1' }), room({ id: '2', freePlaces: 0 }), room({ id: '3', isActive: false })];
    expect(assignableRooms(list).map(r => r.id)).toEqual(['1']);
  });
  it('formate le champ datetime-local', () => {
    expect(nowLocalInput(new Date(2026, 10, 7, 9, 5))).toBe('2026-11-07T09:05');
  });
  it('contrôle le retour prévu', () => {
    expect(expectedReturnError('2026-11-07T09:00', '2026-11-07T08:00')).toMatch(/postérieur/);
    expect(expectedReturnError('2026-11-07T09:00', '2026-11-08T08:00')).toBeNull();
    expect(expectedReturnError('2026-11-07T09:00', '')).toBeNull();
  });
});
