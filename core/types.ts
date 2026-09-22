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
  /** Verdict rendu par le protocole de confirmation. */
  verdict?: VerdictConfirmation;
  /** Identifiant technique du motif du verdict (jamais de prose) : l'anomalie porte son « pourquoi », pas seulement le journal. */
  motif?: string;
  /** Clé du groupe de cause racine dont elle est issue : le lien entre l'anomalie et `Rapport.groupes`. */
  groupe?: string;
  /** Autres endroits où la MÊME cause racine se manifeste (consolidation). */
  localisations?: LocalisationCause[];
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
  /**
   * Un résultat par groupe de cause racine. C'est ce qui permet de compter en
   * GROUPES et non en signalements (cahier de la brique 3, §1a) : sans lui, il
   * faudrait re-parser le journal.
   */
  groupes?: ResultatGroupe[];
  /** Anomalies constatées pendant les re-exécutions seulement (troisième état : constatée une fois). */
  decouvertes?: Anomalie[];
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
      /** Code d'erreur réseau du navigateur (standard technique, ex. `net::ERR_CONNECTION_REFUSED`). */
      erreur: string;
      /**
       * Requête de NAVIGATION du cadre principal : c'est la page elle-même
       * qui a échoué, et non un sous-cadre (iframe tiers, widget) ni une
       * sous-ressource. Un sous-cadre annulé n'est pas une page inaccessible.
       */
      cadrePrincipal: boolean;
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
  /**
   * Mesure brute que porte une candidate, quand le détecteur est GRADUÉ
   * (durée observée pour la lenteur). Avec `seuilMesure`, elle permet au
   * protocole de confirmation de juger sur l'agrégat des re-exécutions
   * plutôt que sur un simple comptage — sans rien savoir du détecteur.
   */
  mesureDe?(candidate: AnomalieCandidate): number | undefined;
  /** Seuil auquel la mesure agrégée des re-exécutions est comparée (détecteur gradué). */
  seuilMesure?: number;
}

// ---- Confirmation ---------------------------------------------------------

export interface CandidateEcartee {
  candidate: AnomalieCandidate;
  /** Identifiant technique stable de la raison (jamais de prose). */
  raison: string;
  verdict?: VerdictConfirmation;
  /** Détail de la confirmation du groupe auquel la candidate appartenait. */
  resultat?: ResultatGroupe;
}

export interface ContexteConfirmation {
  urlDepart: string;
  options: OptionsScan;
  /** Instant (epoch ms) avant lequel la confirmation doit avoir rendu son résultat. */
  echeance: number;
  journaliser(type: string, details?: unknown): void;
  /** Capacité de rejeu fournie par le pipeline : le protocole ne pilote jamais le navigateur lui-même. */
  reexecuteur: Reexecuteur;
  /** Les mêmes détecteurs que l'étape DÉTECTION : la re-exécution ne duplique aucune règle. */
  detecteurs: Detecteur[];
  viewports: Viewport[];
}

export interface ResultatConfirmation {
  retenues: Anomalie[];
  ecartees: CandidateEcartee[];
  coutApi: number;
  /** Un résultat par groupe de cause racine : ce que la confirmation a fait et pourquoi. */
  groupes?: ResultatGroupe[];
  /**
   * Anomalies DÉCOUVERTES pendant les re-exécutions, qui ne correspondaient à
   * aucun groupe d'origine — typiquement un site devenu injoignable entre le
   * scan et la confirmation. Elles sont retenues : se taire parce que la
   * panne est survenue trop tard serait le pire des faux négatifs.
   *
   * C'est un TROISIÈME ÉTAT ÉPISTÉMIQUE : ni confirmée, ni écartée —
   * **constatée une fois**. Elles portent la confiance de leur détecteur,
   * sans facteur de calibration, parce qu'elles n'ont pas été re-confirmées.
   * Le rapport business devra le dire au client dans ces termes (« détecté
   * pendant la vérification, non re-testé ») : l'honnêteté sur le statut de
   * chaque affirmation commence dans ce type.
   */
  decouvertes?: Anomalie[];
}

/**
 * Le logement du protocole anti-faux-positifs (brique 3). Cette brique
 * fournit une implémentation « passe-plat ».
 */
export interface ProtocoleConfirmation {
  nom: string;
  confirmer(candidates: AnomalieCandidate[], contexte: ContexteConfirmation): Promise<ResultatConfirmation>;
}

// ===========================================================================
// Protocole anti-faux-positifs (brique 3) : CONSOLIDATION → RE-EXÉCUTION →
// VERDICT → CALIBRATION, à l'intérieur de l'étape CONFIRMATION.
// ===========================================================================

/**
 * Verdict rendu sur un groupe de cause racine.
 *
 * `limite-automatisation` est délibérément distinct de `non-reproduite` :
 * c'est la catégorie que le secteur confond avec un défaut du site
 * (constitution §1, auto-diagnostic « défaut du site ou limite de mon
 * automatisation ? »).
 */
export type VerdictConfirmation =
  | 'confirmee'
  | 'intermittente'
  | 'non-reproduite'
  | 'limite-automatisation'
  | 'basse-confiance';

/** Verdicts dont les anomalies sont RETENUES dans le rapport final. */
export const VERDICTS_RETENUS: readonly VerdictConfirmation[] = ['confirmee', 'intermittente'];

/** Un endroit où une cause racine se manifeste. */
export interface LocalisationCause {
  urlOuEtape: string;
  element?: LocalisationElement;
  viewport?: string;
}

/**
 * Groupe de candidates partageant une CAUSE RACINE : on ne paie qu'une
 * confirmation par cause (une ressource en échec sur cinq pages est un seul
 * défaut). La clé est structurelle, jamais textuelle.
 */
export interface GroupeCause {
  /** Clé structurelle du groupe (détecteur, type de signal, identité de la ressource ou de l'action). */
  cle: string;
  /** Membre le plus riche en contexte : celui qu'on re-exécute. */
  representant: AnomalieCandidate;
  membres: AnomalieCandidate[];
  /** Toutes les manifestations de la cause, dans l'ordre de première apparition. */
  localisations: LocalisationCause[];
  /** Tous les viewports où le groupe a été observé : l'asymétrie « mobile uniquement » reste intacte. */
  observations: Observation[];
  /** Confiance la plus haute des membres (leçon de la bascule de la brique 2). */
  confiance: number;
  /**
   * Descriptions distinctes des membres, dans l'ordre de première apparition.
   * La consolidation ne garde qu'un représentant : sans cette liste, le
   * symptôme le plus parlant pour un humain (« image-cassee ») disparaîtrait
   * derrière le plus riche en contexte (« ressource-interne-404 »), et le
   * rapport business devrait re-parser le journal pour le retrouver.
   */
  descriptions: string[];
}

/**
 * Cause d'un échec de rejeu. La distinction est CRITIQUE : une page devenue
 * inchargeable au moment de la re-exécution peut être l'incident le plus
 * grave qui existe — le site vient de tomber pendant le scan. La classer en
 * limite d'automatisation et l'écarter serait le pire faux négatif possible :
 * le moteur se tairait au moment de la panne totale.
 *
 * - `outil`        : le rejeu n'a pas pu avoir lieu (navigateur perdu,
 *                    contexte qui ne s'ouvre pas, délai de l'outil). Tentative
 *                    NON exploitable → limite d'automatisation.
 * - `reseau-site`  : le SITE n'a pas répondu (connexion refusée, DNS en
 *                    échec, 5xx sur la navigation, délai réseau). Ce n'est
 *                    pas un verdict sur la candidate d'origine : c'est une
 *                    nouvelle anomalie, potentiellement plus grave, que
 *                    l'observation du rejeu doit faire remonter.
 * - `indetermine`  : ni l'un ni l'autre avec certitude. Tentative non
 *                    exploitable, et client légitime de l'auto-diagnostic IA.
 */
export type CauseEchecRejeu = 'outil' | 'reseau-site' | 'indetermine';

/** Résultat d'un rejeu isolé, rendu par le `Reexecuteur` au protocole. */
export interface ResultatRejeu {
  signaux: Signal[];
  parcours: Parcours;
  /**
   * true si le rejeu LUI-MÊME a échoué. Ne dit PAS à qui la faute :
   * `causeEchec` le dit, et seuls `outil` et `indetermine` rendent la
   * tentative non exploitable.
   */
  echecOutillage: boolean;
  /** À qui la faute. Renseignée dès que `echecOutillage` est vrai. */
  causeEchec?: CauseEchecRejeu;
  /** Identifiant technique de l'échec, si échec. */
  erreur?: string;
  dureeMs: number;
}

/**
 * Capacité de re-exécution : rejoue un contexte de reproduction dans un
 * contexte navigateur NEUF (cache froid, stockage vierge — déjà une
 * variation de contexte).
 */
export interface Reexecuteur {
  rejouer(reproduction: ContexteReproduction, viewport: Viewport): Promise<ResultatRejeu>;
}

/** Une tentative de re-exécution d'un groupe. */
export interface TentativeReexecution {
  /** Numéro de la tentative, à partir de 1. */
  numero: number;
  viewport: string;
  /** L'anomalie a-t-elle été re-constatée par les mêmes détecteurs ? */
  reproduite: boolean;
  /** Le rejeu a-t-il échoué pour une cause d'outillage ? Une telle tentative n'est pas exploitable. */
  echecOutillage: boolean;
  /** À qui la faute, quand la tentative a échoué. */
  causeEchec?: CauseEchecRejeu;
  /** Identifiant technique de l'échec, le cas échéant. */
  erreur?: string;
  /** Mesure brute quand le détecteur est gradué (durée observée pour D-LENTEUR). */
  mesureMs?: number;
  dureeMs: number;
}

/**
 * Contre-épreuve d'une anomalie dépendant du viewport : la même action
 * rejouée dans l'AUTRE viewport. L'asymétrie attendue (mobile KO, desktop
 * OK) renforce la confiance ; une symétrie inattendue la dégrade.
 */
export interface ContreEpreuve {
  viewport: string;
  reproduite: boolean;
  echecOutillage: boolean;
  /** true si le résultat est celui qu'on attendait (non reproduite dans l'autre viewport). */
  attendue: boolean;
}

export interface ResultatGroupe {
  groupe: GroupeCause;
  verdict: VerdictConfirmation;
  /** Identifiant technique stable du motif du verdict (jamais de prose). */
  motif: string;
  tentatives: TentativeReexecution[];
  contreEpreuve?: ContreEpreuve;
  /** Reproduites / tentatives exploitables ; null si aucune tentative exploitable. */
  tauxReproduction: number | null;
  /** Agrégat des mesures brutes des tentatives, pour les détecteurs gradués. */
  mesureAgregee?: number;
  confianceInitiale: number;
  confianceFinale: number;
  coutApi: number;
}

/**
 * Logement de l'auto-diagnostic (brique 4+) : « défaut du site ou limite de
 * mon automatisation ? ». Cette brique en fournit une implémentation
 * MÉCANIQUE ; l'IA viendra derrière la même interface.
 */
export interface AutoDiagnostic {
  nom: string;
  /** Rend un verdict de substitution et son motif, ou `null` quand il n'a pas d'avis. */
  diagnostiquer(resultat: ResultatGroupe, contexte: ContexteConfirmation): Promise<AvisDiagnostic | null>;
}

export interface AvisDiagnostic {
  verdict: VerdictConfirmation;
  /** Identifiant technique du motif. */
  motif: string;
  coutApi: number;
}
