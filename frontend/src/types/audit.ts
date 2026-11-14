/** Libellés français des actions et modèles du journal d'activité (/audit-logs/). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  UPDATE_SENSITIVE: 'Modification sensible',
  DELETE: 'Suppression',
  ARCHIVE: 'Archivage',
  UNARCHIVE: 'Restauration',
  STATUS_CHANGE: 'Changement de statut',
  CLASS_CHANGE: 'Changement de classe',
  ENROLL: 'Inscription',
  ENROLL_WITHDRAW: "Retrait d'inscription",
  REENROLL_BULK: 'Réinscription en masse',
  YEAR_ACTIVATE: "Activation d'année",
  YEAR_CLOSE: "Clôture d'année",
  DOCUMENT_ADD: 'Ajout de document',
  EXPORT: 'Export',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Connexion échouée',
  LOGOUT: 'Déconnexion',
  PASSWORD_CHANGE: 'Changement de mot de passe',
  DEACTIVATE: 'Désactivation de compte',
  PARENT_ACCOUNT_CREATE: 'Création de compte parent',
  CORRECT: 'Correction',
  BOARDING_ASSIGN: 'Affectation internat',
  BOARDING_CHANGE_ROOM: 'Changement de chambre',
  BOARDING_RELEASE: "Sortie d'internat",
  BOARDING_MOVEMENT: "Mouvement d'internat",
  DONATION_CREATE: 'Don enregistré',
  DONATION_CANCEL: 'Don annulé',
  STOCK_MOVEMENT: 'Mouvement de stock',
  STAFF_DOCUMENT_ADD: 'Document du personnel',
  STAFF_LEAVE: 'Congé du personnel',
  STAFF_POSITION: 'Poste du personnel',
  PDF_CARD: 'Carte générée',
  PDF_CARD_BATCH: 'Cartes générées (lot)',
  PDF_CARD_DOWNLOAD: 'Carte téléchargée',
  PDF_CARD_PREVIEW: 'Carte consultée',
  PDF_CARD_FAILED: 'Échec de génération de carte',
  PDF_RECEIPT: 'Reçu généré',
  PDF_FINANCE_REPORT: 'Rapport financier',
};

export const AUDIT_MODEL_LABEL: Record<string, string> = {
  Student: 'Talibé',
  StudentDocument: 'Document de talibé',
  User: 'Compte utilisateur',
  AcademicYear: 'Année scolaire',
  ClassRoom: 'Classe',
  Enrollment: 'Inscription',
  Guardianship: 'Lien parent-enfant',
};

export const auditActionLabel = (a: string) => AUDIT_ACTION_LABEL[a] ?? a;
export const auditModelLabel = (m: string) => AUDIT_MODEL_LABEL[m] ?? m;

/** Libellés des champs fréquemment modifiés (clés camelCase renvoyées par le client HTTP). */
export const FIELD_LABEL: Record<string, string> = {
  firstName: 'Prénom', lastName: 'Nom', gender: 'Sexe', birthDate: 'Date de naissance', birthPlace: 'Lieu de naissance',
  nationality: 'Nationalité', address: 'Adresse', fatherName: 'Père', fatherPhone: 'Téléphone du père',
  motherName: 'Mère', motherPhone: 'Téléphone de la mère', guardianName: 'Responsable légal',
  guardianPhone: 'Téléphone du responsable', emergencyContact: "Contact d'urgence", emergencyPhone: "Téléphone d'urgence",
  status: 'Statut', enrollmentDate: "Date d'inscription", notes: 'Notes', role: 'Rôle', email: 'Courriel', phone: 'Téléphone',
  isActive: 'Compte actif', canViewFinance: 'Accès aux finances', name: 'Nom', level: 'Niveau', teacher: 'Maître',
  roomNumber: 'Salle', capacity: 'Capacité', startDate: 'Début', endDate: 'Fin', academicYear: 'Année scolaire',
  classroom: 'Classe', username: 'Identifiant', detail: 'Détail',
  Detail: 'Détail', // `_detail` devient `Detail` après la conversion camelCase
};
export const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').toLowerCase();

/** Une entrée `changes` est soit {old, new}, soit une valeur simple. */
export interface ChangeEntry { field: string; old?: unknown; new?: unknown; value?: unknown; diff: boolean }

export function parseChanges(changes: Record<string, unknown> | null | undefined): ChangeEntry[] {
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes).map(([field, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'old' in v && 'new' in v) {
      const o = v as { old: unknown; new: unknown };
      return { field, old: o.old, new: o.new, diff: true };
    }
    return { field, value: v, diff: false };
  });
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
