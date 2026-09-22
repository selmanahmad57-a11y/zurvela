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
  /** Élément en cause (localisation structurelle), si applicable. */
  element?: LocalisationElement;
  /** Nom du viewport où l'anomalie a été constatée, si elle en dépend. */
  viewport?: string;
  /** Détecteur à l'origine de l'anomalie. */
  detecteur?: string;
  /** Contexte de reproduction (URL, action déclenchante, viewport) : ce qu'il faut pour ré-exécuter. */
  reproduction?: ContexteReproduction;
  /** Où la même anomalie a été observée. Une anomalie vue sur un seul viewport reste ainsi distinguable (« mobile uniquement »). */
  observations?: Observation[];
}

/** Une occurrence d'une anomalie : le dédoublonnage les accumule au lieu de les effacer. */
export interface Observation {
  viewport: string;
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
  /** Parcours d'exploration (absent pour un scanner qui n'explore pas). */
  parcours?: Parcours;
  /** Candidates produites par la détection, avant confirmation (traçabilité, constitution §5). */
  candidates?: AnomalieCandidate[];
  /** Candidates écartées par le protocole de confirmation, avec la raison. */
  ecartees?: CandidateEcartee[];
}

/** Options d'un scan. */
export interface OptionsScan {
  /** Durée maximale du scan ; le moteur doit rendre un rapport (éventuellement partiel) avant. */
  timeoutMs: number;
}

/** Signature du point d'entrée du moteur, telle que le banc l'invoque. */
export type Scanner = (url: string, options: OptionsScan) => Promise<Rapport>;

// ===========================================================================
// Pipeline du scanner (brique 2) : EXPLORATION → OBSERVATION → DÉTECTION → CONFIRMATION
// ===========================================================================

/** Un viewport nommé ; les dimensions vivent dans config/scanner.json. */
export interface Viewport {
  nom: string;
  largeur: number;
  hauteur: number;
  /** true si ce viewport représente un usage mobile (catégorie `mobile` des anomalies qui en dépendent). */
  mobile: boolean;
}

/**
 * Localisation STRUCTURELLE d'un élément : balise, sélecteur et attributs
 * techniques. Jamais son texte visible (Mur 1).
 */
export interface LocalisationElement {
  /** Balise en minuscules. */
  balise: string;
  /** Sélecteur CSS structurel (balise, id, name, type, rang) permettant de retrouver l'élément. */
  selecteur: string;
  /** Attributs techniques (id, name, type, role, href, action…), jamais de libellé. */
  attributs: Record<string, string>;
}

// ---- Exploration ----------------------------------------------------------

export interface ChampFormulaire {
  localisation: LocalisationElement;
  /** Type technique : `email`, `text`, `textarea`, `select`… */
  type: string;
  autocomplete: string | null;
  requis: boolean;
  /** Valeurs techniques (attribut `value`) des options d'un `select`, dans l'ordre ; jamais leurs libellés. */
  options?: string[];
}

export interface DescriptionFormulaire {
  localisation: LocalisationElement;
  methode: string;
  /** URL de soumission résolue. */
  action: string;
  champs: ChampFormulaire[];
  /** Contrôle qui déclenche la soumission (bouton), ou null si aucun contrôle cliquable. */
  declencheur: LocalisationElement | null;
}

export interface PageVisitee {
  url: string;
  viewport: string;
  /** Statut HTTP du document, ou null si la navigation a échoué. */
  statutHttp: number | null;
  /** URLs internes (même origine) découvertes sur la page, normalisées. */
  liensInternes: string[];
  formulaires: DescriptionFormulaire[];
  horodatage: string;
}

/** Menu FERMÉ d'actions (constitution §3) : la décision ne rédige jamais d'action libre. */
export type TypeAction = 'naviguer' | 'remplir' | 'soumettre' | 'terminer';

export interface ValeurChamp {
  champ: LocalisationElement;
  valeur: string;
}

export type Action =
  | { type: 'naviguer'; url: string }
  | { type: 'remplir'; formulaire: LocalisationElement; valeurs: ValeurChamp[] }
  | { type: 'soumettre'; formulaire: LocalisationElement; declencheur: LocalisationElement | null }
  | { type: 'terminer'; raison: string };

/** `interdite` : refusée par le filtre d'actions destructives ; `bloquee` : impossible à exécuter (ex. clic intercepté). */
export type ResultatAction = 'ok' | 'bloquee' | 'interdite' | 'echec';

export interface ActionExecutee {
  /** Identifiant unique dans le parcours (`a1`, `a2`…), clé de liaison avec les signaux. */
  id: string;
  action: Action;
  /** URL de la page au moment de l'action. */
  page: string;
  viewport: string;
  debut: string;
  fin: string;
  resultat: ResultatAction;
  details?: unknown;
}

export interface Parcours {
  urlDepart: string;
  pages: PageVisitee[];
  actions: ActionExecutee[];
  /** Pourquoi l'exploration s'est arrêtée. */
  arret: 'complet' | 'limite-pages' | 'echeance' | 'erreur';
}

/** Ce que la politique de décision voit avant de choisir la prochaine action. */
export interface ContexteDecision {
  pageCourante: PageVisitee;
  /** Sélecteurs des formulaires déjà remplis / déjà soumis sur la page courante. */
  formulairesRemplis: string[];
  formulairesSoumis: string[];
  /** URLs découvertes, non encore visitées, dans l'ordre de découverte. */
  urlsEnAttente: string[];
  nbPagesVisitees: number;
}

/** La structure de décision que l'IA pilotera plus tard ; ici, une politique déterministe. */
export interface Politique {
  nom: string;
  decider(contexte: ContexteDecision): Action;
}

export interface ContexteExploration {
  urlDepart: string;
  /** Instant (epoch ms) avant lequel l'exploration doit avoir rendu son parcours. */
  echeance: number;
  journaliser(type: string, details?: unknown): void;
}

export interface Explorateur {
  nom: string;
  explorer(contexte: ContexteExploration, observateur: Observateur): Promise<Parcours>;
}

// ---- Observation ----------------------------------------------------------

interface SignalBase {
  /** ISO 8601 avec millisecondes ; sert aussi à l'ordre chronologique. */
  horodatage: string;
  /** URL de la page au moment du signal. */
  page: string;
  viewport: string;
  /** Action pendant la fenêtre d'observation de laquelle le signal est survenu. */
  actionId?: string;
}

export type TypeRessource = string;

/** Événements techniques bruts collectés pendant l'exploration. Aucune interprétation ici. */
export type Signal =
  | (SignalBase & {
      type: 'reponse-reseau';
      urlRessource: string;
      methode: string;
      statut: number;
      typeRessource: TypeRessource;
      /** Durée entre l'envoi et la fin de la réponse ; null si inconnue. */
      dureeMs: number | null;
      /** Même origine que l'URL de départ. */
      interne: boolean;
    })
  | (SignalBase & {
      type: 'requete-echouee';
      urlRessource: string;
      methode: string;
      typeRessource: TypeRessource;
      erreur: string;
      interne: boolean;
    })
  | (SignalBase & {
      type: 'requete-en-attente';
      urlRessource: string;
      methode: string;
      typeRessource: TypeRessource;
      /** Temps déjà écoulé sans réponse à la fin de la fenêtre d'observation. */
      attenteMs: number;
      interne: boolean;
    })
  | (SignalBase & { type: 'erreur-js'; message: string })
  | (SignalBase & { type: 'navigation'; de: string; vers: string })
  | (SignalBase & {
      type: 'mutation-dom';
      /**
       * Nombre de mutations du lot, et nombre dans la zone de l'action
       * (formulaire et son parent) hors bruit de fond.
       */
      nb: number;
      nbZone: number;
    })
  | (SignalBase & {
      type: 'etat-image';
      ressource: string;
      element: LocalisationElement;
      complete: boolean;
      largeurNaturelle: number;
      hauteurNaturelle: number;
    })
  | (SignalBase & {
      type: 'interception-clic';
      element: LocalisationElement;
      /** Élément qui reçoit le point de clic à la place de la cible, ou null si inconnu. */
      intercepteur: LocalisationElement | null;
      /** `geometrie` : constaté par elementFromPoint ; `clic` : clic refusé par le navigateur. */
      source: 'geometrie' | 'clic';
    })
  | (SignalBase & {
      type: 'fin-action';
      effets: {
        requetes: number;
        requetesEnAttente: number;
        navigation: boolean;
        mutations: number;
        /** Mutations dans la zone de l'action, hors bruit de fond. */
        mutationsZone: number;
        /** Mutations hors bruit de fond (cibles qui ne mutaient pas déjà spontanément avant l'action). */
        mutationsHorsBruit: number;
        attenteMs: number;
      };
    });

export interface Observateur {
  emettre(signal: Signal): void;
  signaux(): Signal[];
}

// ---- Détection ------------------------------------------------------------

export interface ContexteReproduction {
  url: string;
  viewport: Viewport;
  /** Action déclenchante, ou null pour une anomalie constatée au chargement. */
  action: ActionExecutee | null;
  /**
   * État requis pour rejouer l'action déclenchante isolément : les actions
   * exécutées avant elle qu'il faut refaire (typiquement le `remplir` qui
   * précède un `soumettre`).
   *
   * APPROXIMATION assumée (docs/DETTES.md, dette n°2) : limitée à la page et
   * au viewport courants depuis la dernière navigation. Un parcours
   * multi-étapes dont l'état vient des pages précédentes n'est pas couvert.
   */
  actionsPrealables: ActionExecutee[];
}

export interface AnomalieCandidate extends Anomalie {
  detecteur: string;
  reproduction: ContexteReproduction;
  /** Signaux qui fondent la candidate. */
  preuves: Signal[];
}

export interface ContexteDetection {
  urlDepart: string;
  parcours: Parcours;
  viewports: Viewport[];
}

export interface Detecteur {
  nom: string;
  /** true si la même anomalie constatée sur deux viewports est comptée deux fois (ex. recouvrement). */
  dependDuViewport: boolean;
  detecter(signaux: Signal[], contexte: ContexteDetection): AnomalieCandidate[];
}

// ---- Confirmation ---------------------------------------------------------

export interface CandidateEcartee {
  candidate: AnomalieCandidate;
  raison: string;
}

export interface ContexteConfirmation {
  urlDepart: string;
  options: OptionsScan;
  /** Instant (epoch ms) avant lequel la confirmation doit avoir rendu son résultat. */
  echeance: number;
  journaliser(type: string, details?: unknown): void;
}

export interface ResultatConfirmation {
  retenues: Anomalie[];
  ecartees: CandidateEcartee[];
  coutApi: number;
}

/**
 * Le logement du protocole anti-faux-positifs (brique 3). Cette brique
 * fournit une implémentation « passe-plat ».
 */
export interface ProtocoleConfirmation {
  nom: string;
  confirmer(candidates: AnomalieCandidate[], contexte: ContexteConfirmation): Promise<ResultatConfirmation>;
}
