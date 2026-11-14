import type { Room } from '../../types/boarding';

/** « Bâtiment A — Chambre 3 » (nom de la chambre si renseigné). */
export function roomTitle(room: Pick<Room, 'buildingName' | 'number' | 'name'>): string {
  const label = room.name && room.name !== room.number ? `${room.number} (${room.name})` : room.number;
  return `${room.buildingName} — Chambre ${label}`;
}

/** Chambre proposée dans une liste d'affectation : « … (3/4 places occupées) ». */
export function roomOptionLabel(room: Room): string {
  return `${roomTitle(room)} — ${room.occupancy}/${room.capacity} places occupées`;
}

/** Taux d'occupation en pourcentage entier (0 si aucune capacité). */
export function occupancyPercent(occupied: number, capacity: number): number {
  return capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
}

/** Couleur d'alerte : complète (danger), presque complète (avertissement), sinon normale. */
export function occupancyTone(occupied: number, capacity: number): 'danger' | 'warning' | 'success' {
  const pct = occupancyPercent(occupied, capacity);
  return pct >= 100 ? 'danger' : pct >= 85 ? 'warning' : 'success';
}

/** Chambres où l'on peut encore affecter un talibé (active et non complète). */
export const assignableRooms = (rooms: Room[]) => rooms.filter(r => r.isActive && r.freePlaces > 0);

/** Valeur d'un champ datetime-local (heure locale, sans fuseau) pour maintenant. */
export function nowLocalInput(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Contrôle du retour prévu : doit suivre l'heure de sortie. */
export function expectedReturnError(occurredAt: string, expectedReturn: string): string | null {
  if (!expectedReturn) return null;
  if (occurredAt && expectedReturn <= occurredAt) return 'Le retour prévu doit être postérieur à la sortie.';
  return null;
}
