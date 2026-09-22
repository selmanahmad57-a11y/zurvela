/**
 * Contrats du banc d'essai.
 *
 * Le banc est l'instrument qui mesure le moteur : gabarits (mini-sites),
 * bugs injectables, scénarios, manifestes de vérité terrain, correcteur et
 * scorecard. Tout ce qui relie ces pièces entre elles est déclaré ici.
 */
import type { Anomalie, Categorie, Gravite, Rapport } from '../core/types.js';

// ---------------------------------------------------------------------------
// Configuration (miroir typé de config/banc.json, validé par config/banc.schema.json)
// ---------------------------------------------------------------------------

export interface ConfigBanc {
  langueConsole: string;
  langues: string[];
  serveur: { portDeBase: number; nombrePortsEssayes: number };
  scan: { timeoutMs: number };
  scorecard: { seuilAlarmeEcartLanguesPoints: number; dossierResultats: string; retentionRuns: number };
  scenarios: { dossier: string; jetonSain: string; combinaisons: string[][] };
  site: { delaiReponseApiMs: number };
  /** Paramètres par défaut de chaque bug, clé = identifiant du bug. */
  bugs: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

/** Identifiant stable d'un bug injectable, ex. `F01`. */
export type IdentifiantBug = string;

/** Un scénario = un gabarit servi dans une langue avec un ensemble de bugs actifs. */
export interface Scenario {
  id: string;
  gabarit: string;
  langue: string;
  bugsActifs: IdentifiantBug[];
  /** Surcharges des paramètres des bugs actifs (clé = identifiant du bug). Défauts dans config/banc.json. */
  parametres?: Record<IdentifiantBug, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Gabarits et bugs injectables
// ---------------------------------------------------------------------------

/** Requête reçue par le backend de formulaire d'un gabarit. */
export interface RequeteApi {
  methode: string;
  chemin: string;
  /** Corps déjà décodé (JSON ou formulaire), ou null si absent/illisible. */
  corps: Record<string, unknown> | null;
}

/** Réponse HTTP produite par un gabarit (puis transformée par les bugs). */
export interface ReponseHttp {
  statut: number;
  entetes: Record<string, string>;
  corps: string;
}

/** Contexte fourni à chaque transformation d'un bug. */
export interface ContexteBug {
  /** Paramètres effectifs du bug : défauts de la config surchargés par le scénario. */
  parametres: Record<string, unknown>;
  langue: string;
}

/**
 * Un bug injectable : une transformation ISOLÉE et RÉVERSIBLE du site sain.
 * Le site sain est la référence ; un bug ne forke jamais le gabarit.
 *
 * La partie déclarative (id, nom, categorie, gravite, pages) suffit au
 * correcteur pour dériver le manifeste de vérité terrain. Les hooks sont
 * tous optionnels ; le serveur les appelle dans l'ordre des bugs actifs.
 */
export interface BugInjectable {
  id: IdentifiantBug;
  /** Nom court en kebab-case, ex. `bouton-mort`. */
  nom: string;
  categorie: Categorie;
  /** Gravité attendue du point de vue métier. */
  gravite: Gravite;
  /** Chemins d'URL des pages où l'anomalie est constatable (clé d'appariement avec le rapport). */
  pages: string[];
  /**
   * Vérifie les paramètres effectifs du bug et lève s'ils sont invalides.
   * Appelé au DÉMARRAGE du serveur, jamais à la requête : une faute de
   * configuration doit faire échouer le banc, pas servir des 500 en silence.
   */
  validerParametres?(parametres: Record<string, unknown>): void;
  /** Transforme le HTML brut d'une page (AVANT la substitution i18n). */
  transformerHtml?(html: string, chemin: string, contexte: ContexteBug): string;
  /** Transforme une ressource statique textuelle (JS, CSS). */
  transformerRessourceTexte?(chemin: string, contenu: string, contexte: ContexteBug): string;
  /** Transforme la réponse du backend de formulaire (peut la retarder). */
  transformerReponseApi?(
    reponse: ReponseHttp,
    requete: RequeteApi,
    contexte: ContexteBug,
  ): Promise<ReponseHttp>;
}

/** Un gabarit = un mini-site sain + ses bugs injectables. */
export interface Gabarit {
  nom: string;
  /** Dossier absolu du mini-site. */
  dossierSite: string;
  /** Chemin d'URL → fichier de page (relatif à dossierSite), rendu avec i18n. */
  routesPages: Record<string, string>;
  /** Préfixe d'URL des ressources statiques (ex. `/statique`). */
  prefixeStatique: string;
  /** Dossier des ressources statiques (relatif à dossierSite). */
  dossierStatique: string;
  /** Dossier des dictionnaires i18n du site (relatif à dossierSite), un `<langue>.json` par langue. */
  dossierLocales: string;
  /** Chemin d'URL de l'API du formulaire. */
  cheminApiFormulaire: string;
  /** Comportement SAIN du backend de formulaire. */
  traiterApi(requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp>;
  bugs: BugInjectable[];
}

// ---------------------------------------------------------------------------
// Manifeste de vérité terrain (dérivé du scénario, jamais écrit à la main)
// ---------------------------------------------------------------------------

export interface AttenduManifeste {
  bugId: IdentifiantBug;
  nom: string;
  categorie: Categorie;
  pages: string[];
  gravite: Gravite;
}

export interface Manifeste {
  scenarioId: string;
  gabarit: string;
  langue: string;
  attendus: AttenduManifeste[];
}

// ---------------------------------------------------------------------------
// Serveur de scénario
// ---------------------------------------------------------------------------

export interface ServeurScenario {
  /** URL de base, ex. `http://127.0.0.1:4800`. */
  url: string;
  port: number;
  arreter(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Résultats et scorecard
// ---------------------------------------------------------------------------

export type Verdict = 'detecte' | 'rate';

export interface ResultatAttendu {
  attendu: AttenduManifeste;
  verdict: Verdict;
  /** Anomalies du rapport appariées à cet attendu (plusieurs possibles : doublons, pas des faux positifs). */
  anomaliesAppariees: Anomalie[];
}

export interface ResultatScenario {
  scenarioId: string;
  gabarit: string;
  langue: string;
  /** `erreur` si le scanner a levé, dépassé le timeout ou rendu un rapport inexploitable : rien n'est compté comme détecté. */
  statut: 'ok' | 'erreur';
  erreur?: string;
  attendus: ResultatAttendu[];
  fauxPositifs: Anomalie[];
  coutApi: number;
  dureeMs: number;
  rapport?: Rapport;
}

/** Agrégat de scores sur un ensemble de scénarios (global, par langue, par catégorie). */
export interface Agregat {
  nbScenarios: number;
  nbErreurs: number;
  nbAttendus: number;
  nbDetectes: number;
  nbRates: number;
  /** Nombre total d'anomalies signalées par le scanner. */
  nbSignalements: number;
  nbFauxPositifs: number;
  /** Détectés / attendus, en pourcentage ; null si aucun attendu. */
  tauxDetection: number | null;
  /** Faux positifs / signalements, en pourcentage ; null si aucun signalement. */
  tauxFauxPositifs: number | null;
  coutApi: number;
  dureeMs: number;
}

export interface EcartLangues {
  /** Écart max−min des taux de détection par langue, en points ; null si moins de deux langues notables. */
  points: number | null;
  seuil: number;
  alarme: boolean;
}

export interface Scorecard {
  /** Horodatage ISO 8601 de l'exécution. */
  horodatage: string;
  global: Agregat;
  parLangue: Record<string, Agregat>;
  parCategorie: Record<string, Agregat>;
  ecartLangues: EcartLangues;
  scenarios: ResultatScenario[];
}
