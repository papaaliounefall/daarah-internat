import {
  BookOpen, Building2, CalendarCheck, ClipboardList, Clock, CreditCard, GraduationCap, HeartHandshake,
  IdCard, LayoutDashboard, Package, School, Settings, ShieldCheck, UserCog, Users, type LucideIcon,
} from 'lucide-react';
import type { Role, User } from '../types';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Un assistant n'y accède que si le directeur lui a accordé l'accès aux finances. */
  finance?: boolean;
  /** Rubrique du menu latéral. */
  group: NavGroup;
}

export type NavGroup = 'Pilotage' | 'Scolarité' | 'Vie du Daara' | 'Gestion';
export const NAV_GROUPS: NavGroup[] = ['Pilotage', 'Scolarité', 'Vie du Daara', 'Gestion'];

const ALL: Role[] = ['DIRECTEUR', 'ASSISTANT', 'MAITRE', 'PARENT'];

// Le masquage d'un lien n'est qu'un confort : chaque requête est contrôlée par le serveur (DRF).
export const NAV: NavItem[] = [
  { path: '/app', label: 'Tableau de bord', icon: LayoutDashboard, roles: ALL , group: 'Pilotage' },
  { path: '/app/mes-enfants', label: 'Mes enfants', icon: GraduationCap, roles: ['PARENT'] , group: 'Pilotage' },
  { path: '/app/talibes', label: 'Talibés', icon: Users, roles: ['DIRECTEUR', 'ASSISTANT', 'MAITRE'] , group: 'Scolarité' },
  { path: '/app/cartes', label: 'Cartes talibé', icon: IdCard, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Scolarité' },
  { path: '/app/suivi', label: 'Suivi coranique', icon: ClipboardList, roles: ['DIRECTEUR', 'ASSISTANT', 'MAITRE'] , group: 'Scolarité' },
  { path: '/app/coran', label: 'Lecteur du Coran', icon: BookOpen, roles: ALL , group: 'Scolarité' },
  { path: '/app/classes', label: 'Classes', icon: School, roles: ['DIRECTEUR', 'ASSISTANT', 'MAITRE'] , group: 'Scolarité' },
  { path: '/app/presences', label: 'Présences', icon: CalendarCheck, roles: ALL , group: 'Scolarité' },
  { path: '/app/visites', label: 'Visites', icon: Clock, roles: ['DIRECTEUR', 'ASSISTANT', 'PARENT'] , group: 'Scolarité' },
  { path: '/app/internat', label: 'Internat', icon: Building2, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Vie du Daara' },
  { path: '/app/finances', label: 'Finances', icon: CreditCard, roles: ['DIRECTEUR', 'ASSISTANT'], finance: true , group: 'Gestion' },
  { path: '/app/social', label: 'Social et parrainages', icon: HeartHandshake, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Vie du Daara' },
  { path: '/app/stocks', label: 'Stocks', icon: Package, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Vie du Daara' },
  { path: '/app/personnel', label: 'Personnel', icon: UserCog, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Vie du Daara' },
  { path: '/app/utilisateurs', label: 'Utilisateurs', icon: ShieldCheck, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Gestion' },
  { path: '/app/parametres', label: 'Paramètres', icon: Settings, roles: ['DIRECTEUR', 'ASSISTANT'] , group: 'Gestion' },
  { path: '/app/journal', label: "Journal d'activité", icon: ClipboardList, roles: ['DIRECTEUR'] , group: 'Gestion' },
];

export const canSee = (item: NavItem, user: User) =>
  item.roles.includes(user.role) && (!item.finance || user.role === 'DIRECTEUR' || user.canViewFinance);

export const ROLE_LABEL: Record<Role, string> = {
  DIRECTEUR: 'Directeur',
  ASSISTANT: 'Directeur assistant',
  MAITRE: 'Maître coranique',
  PARENT: 'Parent / Tuteur',
};

/** Entrée de menu correspondant à l'URL courante (préfixe le plus long). */
export const navItemFor = (pathname: string): NavItem | undefined =>
  [...NAV].sort((a, b) => b.path.length - a.path.length).find(n => (n.path === '/app' ? pathname === '/app' : pathname.startsWith(n.path)));
