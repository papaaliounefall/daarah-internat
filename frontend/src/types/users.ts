import type { Role, User } from './index';

/** Compte tel que renvoyé par /users/ (liste de gestion). */
export interface ManagedUser extends User {
  dateJoined: string;
}

export type Relation = 'PERE' | 'MERE' | 'TUTEUR' | 'AUTRE';

export const RELATION_LABEL: Record<Relation, string> = {
  PERE: 'Père',
  MERE: 'Mère',
  TUTEUR: 'Tuteur / responsable légal',
  AUTRE: 'Autre responsable autorisé',
};

/** Lien parent ↔ talibé (/guardianships/). */
export interface Guardianship {
  id: string;
  user: string;
  userName: string;
  student: string;
  studentName: string;
  relation: Relation;
  isPrimary: boolean;
}

export interface UserFormValues {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
  canViewFinance: boolean;
}
