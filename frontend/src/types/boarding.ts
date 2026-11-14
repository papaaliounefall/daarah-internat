/** Internat : bâtiments, chambres, affectations, entrées / sorties. */

export type BoardingMovementKind = 'ENTREE' | 'SORTIE';

export const BOARDING_KIND_LABEL: Record<BoardingMovementKind, string> = {
  ENTREE: 'Entrée',
  SORTIE: 'Sortie',
};

export interface Building { id: string; name: string; roomsCount: number }

export interface Room {
  id: string;
  building: string;
  buildingName: string;
  number: string;
  name: string;
  capacity: number;
  occupancy: number;
  freePlaces: number;
  supervisor: string | null;
  supervisorName: string;
  isActive: boolean;
}

export interface BoardingAssignment {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  room: string;
  roomLabel: string;
  buildingName: string;
  bedNumber: string;
  startDate: string;
  endDate: string | null;
  note: string;
  assignedByName: string;
  isActive: boolean;
}

export interface BoardingMovement {
  id: string;
  student: string;
  studentName: string;
  registrationNumber: string;
  kind: BoardingMovementKind;
  occurredAt: string;
  reason: string;
  expectedReturn: string | null;
  recordedByName?: string;
}

export interface CurrentlyOut {
  student: string;
  studentName: string;
  registrationNumber: string;
  room: string;
  roomLabel: string;
  since: string | null;
  expectedReturn: string | null;
  reason: string;
}

export interface OccupancyRoom {
  id: string;
  number: string;
  name: string;
  capacity: number;
  occupancy: number;
  freePlaces: number;
  isActive: boolean;
  supervisorName: string;
}

export interface OccupancyBuilding {
  id: string;
  name: string;
  capacity: number;
  occupied: number;
  free: number;
  rooms: OccupancyRoom[];
}

export interface Occupancy {
  capacity: number;
  occupied: number;
  free: number;
  occupancyRate: number;
  studentsOut: number;
  buildings: OccupancyBuilding[];
}
