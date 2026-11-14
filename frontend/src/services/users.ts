import { http, listAll, type Page } from '../lib/api';
import type { Role } from '../types';
import type { Guardianship, ManagedUser, Relation } from '../types/users';

export interface UserQuery { page: number; pageSize: number; search?: string; role?: Role | ''; active?: 'true' | 'false' | '' }

export const listUsers = (q: UserQuery) => {
  const params: Record<string, unknown> = { page: q.page, pageSize: q.pageSize, ordering: 'last_name,first_name' };
  if (q.search?.trim()) params.search = q.search.trim();
  if (q.role) params.role = q.role;
  if (q.active) params.isActive = q.active;
  return http.get<Page<ManagedUser>>('/users/', { params }).then(r => r.data);
};

export interface UserInput {
  username?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role?: Role;
  password?: string;
  canViewFinance?: boolean;
  isActive?: boolean;
}

export const createUser = (input: UserInput) => http.post<ManagedUser>('/users/', input).then(r => r.data);
export const updateUser = (id: string, input: Partial<UserInput>) => http.patch<ManagedUser>(`/users/${id}/`, input).then(r => r.data);
export const deactivateUser = (id: string) => http.post<ManagedUser>(`/users/${id}/deactivate/`).then(r => r.data);

export interface ParentAccountInput {
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  students: string[];
  relation: Relation;
}

export const createParentAccount = (input: ParentAccountInput) =>
  http.post<{ id: string; username: string; students: string[] }>('/guardianships/create-account/', input).then(r => r.data);

export const listGuardianships = (user: string) => listAll<Guardianship>('/guardianships/', { user });

export const addGuardianship = (user: string, student: string, relation: Relation) =>
  http.post<Guardianship>('/guardianships/', { user, student, relation, isPrimary: false }).then(r => r.data);

export const removeGuardianship = (id: string) => http.delete(`/guardianships/${id}/`);
