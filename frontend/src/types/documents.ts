/** Cartes talibé générées par le serveur (PDF conforme au modèle officiel). */

/** Données imprimées sur la carte au moment de la génération (clés converties en camelCase). */
export interface CardSnapshot {
  classe: string;
  numero: string;
  nom: string;
  pere: string;
  mere: string;
  nationalite: string;
  ville: string;
  telephone: string;
  dateInscription: string;
  generatedAt?: string;
}

/** Version de carte vue par le directeur ou l'assistant. */
export interface StudentCard {
  id: string;
  student: string;
  version: number;
  isCurrent: boolean;
  reason: string;
  snapshot: CardSnapshot;
  generatedByName: string;
  pdfUrl: string | null;   // URL signée temporaire (1 h)
  downloadUrl: string;
  createdAt: string;
}

/** Version de carte vue par un parent : carte courante uniquement, sans motif ni détail interne. */
export interface FamilyCard {
  id: string;
  student: string;
  version: number;
  pdfUrl: string | null;
  downloadUrl: string;
  createdAt: string;
}

export interface BatchQueued {
  queued: number;
}
