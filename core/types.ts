/**
 * Contrat d'interface du moteur (constitution §4).
 *
 * Ce fichier est LA frontière entre le moteur (`core/`) et tout ce qui le
 * consomme : le banc d'essai aujourd'hui, l'interface produit demain.
 * Le banc note un `Scanner` uniquement à travers le `Rapport` qu'il renvoie.
 */

/** Catégories d'anomalies couvertes par le moteur (constitution §1). */
export type Categorie =
  | 'fonctionnel'
  | 'performance'
  | 'accessibilite'
  | 'seo'
  | 'securite'
  | 'visuel'
  | 'mobile';

/** Gravité d'une anomalie, du point de vue métier. */
export type Gravite = 'bloquant' | 'important' | 'mineur';

/** Une anomalie constatée par le moteur. */
export interface Anomalie {
  categorie: Categorie;
  /** Prose (rédigée par l'IA ou un détecteur). Jamais utilisée comme clé d'appariement. */
  description: string;
  /** URL complète, chemin d'URL, ou libellé d'étape de parcours où l'anomalie est constatée. */
  urlOuEtape: string;
  graviteEstimee: Gravite;
  /** Score de confiance du moteur, entre 0 et 1. */
  confiance: number;
}

/** Une entrée du journal structuré d'un scan (constitution §5). */
export interface EntreeJournal {
  /** Horodatage ISO 8601. */
  horodatage: string;
  /** Identifiant technique de l'événement (ex. `scan.debut`, `action.clic`, `blocage.antibot`). */
  type: string;
  details?: unknown;
}

/** Le résultat complet d'un scan. */
export interface Rapport {
  /** URL de départ du scan. */
  url: string;
  anomalies: Anomalie[];
  /** Coût total des appels aux API de modèles, en euros. */
  coutApi: number;
  dureeMs: number;
  journal: EntreeJournal[];
}

/** Options d'un scan. */
export interface OptionsScan {
  /** Durée maximale du scan ; le moteur doit rendre un rapport (éventuellement partiel) avant. */
  timeoutMs: number;
}

/** Signature du point d'entrée du moteur, telle que le banc l'invoque. */
export type Scanner = (url: string, options: OptionsScan) => Promise<Rapport>;
