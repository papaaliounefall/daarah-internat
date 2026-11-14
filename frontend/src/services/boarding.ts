import { http } from '../lib/api';
import { getAll, getPage } from './params';
import type {
  Building, BoardingAssignment, BoardingMovement, BoardingMovementKind, CurrentlyOut, Occupancy, Room,
} from '../types/boarding';

export const getOccupancy = () => http.get<Occupancy>('/boarding/occupancy/').then(r => r.data);

/* --- Bâtiments et chambres --- */
export const listBuildings = () => getAll<Building>('/boarding/buildings/', { ordering: 'name' });
export const saveBuilding = (id: string | null, name: string) =>
  (id ? http.patch<Building>(`/boarding/buildings/${id}/`, { name }) : http.post<Building>('/boarding/buildings/', { name })).then(r => r.data);

export interface RoomQuery { building?: string; isActive?: string }
export const listRooms = (q: RoomQuery = {}) => getAll<Room>('/boarding/rooms/', { ordering: 'building__name,number', ...q });

export interface RoomInput { building: string; number: string; name: string; capacity: number; supervisor: string | null; isActive: boolean }
export const saveRoom = (id: string | null, input: RoomInput) =>
  (id ? http.patch<Room>(`/boarding/rooms/${id}/`, input) : http.post<Room>('/boarding/rooms/', input)).then(r => r.data);

/* --- Affectations --- */
export interface AssignmentQuery { page?: number; pageSize?: number; search?: string; active?: 'true' | 'false'; room?: string; building?: string; student?: string }
export const listAssignments = (q: AssignmentQuery) => getPage<BoardingAssignment>('/boarding/assignments/', q);

export interface AssignInput { student: string; room: string; bedNumber: string; note: string }
export const assignStudent = (input: AssignInput) => http.post<BoardingAssignment>('/boarding/assignments/', input).then(r => r.data);
export const changeRoom = (input: AssignInput) => http.post<BoardingAssignment>('/boarding/assignments/change-room/', input).then(r => r.data);
export const releaseAssignment = (id: string, reason: string) =>
  http.post<BoardingAssignment>(`/boarding/assignments/${id}/release/`, { reason }).then(r => r.data);

/* --- Entrées / sorties --- */
export interface MovementQuery { page?: number; pageSize?: number; search?: string; kind?: string; dateFrom?: string; dateTo?: string; student?: string }
export const listBoardingMovements = (q: MovementQuery) => getPage<BoardingMovement>('/boarding/movements/', q);
export const listCurrentlyOut = () => http.get<CurrentlyOut[]>('/boarding/movements/currently-out/').then(r => r.data);

export interface MovementInput { student: string; kind: BoardingMovementKind; occurredAt?: string; reason: string; expectedReturn?: string }
export const recordMovement = (input: MovementInput) => {
  const body: Record<string, unknown> = { student: input.student, kind: input.kind, reason: input.reason };
  if (input.occurredAt) body.occurredAt = input.occurredAt;
  if (input.expectedReturn) body.expectedReturn = input.expectedReturn;
  return http.post<BoardingMovement>('/boarding/movements/', body).then(r => r.data);
};
