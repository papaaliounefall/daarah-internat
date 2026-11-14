import type React from 'react';
import type { Role } from '../../../types';
import { AcademicYearsTab } from './AcademicYearsTab';
import { EstablishmentTab } from './EstablishmentTab';
import { GalleryTab } from './GalleryTab';
import { NewsTab } from './NewsTab';
import { PublicSiteTab } from './PublicSiteTab';
import { ContactRequests } from './site/ContactRequests';

export interface SettingsTab {
  /** Identifiant stable, utilisé dans l'URL (?onglet=...). */
  id: string;
  label: string;
  component: React.ComponentType;
  /** Rôles autorisés (le serveur impose de toute façon ces droits). Absent : directeur seul. */
  roles?: Role[];
}

const DIRECTOR: Role[] = ['DIRECTEUR'];
const ADMIN: Role[] = ['DIRECTEUR', 'ASSISTANT'];

/**
 * Onglets de la page Paramètres, dans l'ordre d'affichage.
 * Pour ajouter un onglet : déposer son composant dans ce dossier et ajouter UNE ligne ci-dessous.
 * Le directeur voit tout ; l'assistant ne gère que les actualités, la galerie et les demandes reçues.
 */
export const TABS: SettingsTab[] = [
  { id: 'annees', label: 'Années scolaires', component: AcademicYearsTab, roles: DIRECTOR },
  // { id: 'criteres', label: "Critères d'évaluation", component: EvaluationCriteriaTab },
  { id: 'etablissement', label: 'Établissement', component: EstablishmentTab, roles: DIRECTOR },
  { id: 'portail', label: 'Contenu du site', component: PublicSiteTab, roles: DIRECTOR },
  { id: 'actualites', label: 'Actualités', component: NewsTab, roles: ADMIN },
  { id: 'galerie', label: 'Galerie', component: GalleryTab, roles: ADMIN },
  { id: 'demandes', label: 'Demandes reçues', component: ContactRequests, roles: ADMIN },
];

/** Onglets visibles pour un rôle donné. */
export const tabsForRole = (role: Role | undefined): SettingsTab[] =>
  TABS.filter(t => !!role && (t.roles ?? DIRECTOR).includes(role));
