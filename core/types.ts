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

/**
 * Le coût des appels aux modèles, par famille d'appel. Les QUATRE familles
 * partitionnent : leur somme est le coût total du scan.
 *
 * La rédaction est arrivée en quatrième et n'a PAS été rangée dans l'une des
 * trois existantes, bien que ce fût la modification la plus courte : un coût
 * ne dit quelque chose que placé à côté de ce qu'il achète (APPRENTISSAGES
 * n°3), et un coût placé à côté de ce qu'il n'achète pas est un diagnostic
 * faux (n°6). C'est exactement ce que la ventilation a été créée pour
 * réparer quand la navigation IA faisait lire un coût de PARCOURS sous
 * l'étiquette du profilage.
 */
export interface CoutParFamille {
  /** Décisions de navigation, engagées pendant l'exploration. */
  exploration: number;
  /** Profilage du site : un appel par scan. */
  profilage: number;
  /** Protocole de confirmation. */
  confirmation: number;
  /** Rédaction du rapport business : un appel par scan, après tout le reste. */
  redaction: number;
}

/** Le résultat complet d'un scan. */
export interface Rapport {
  /** URL de départ du scan. */
  url: string;
  anomalies: Anomalie[];
  /** Coût total des appels aux API de modèles, en euros. */
  coutApi: number;
  /**
   * Le même total, VENTILÉ par famille d'appel. Absent pour un scanner qui
   * n'appelle aucun modèle.
   *
   * Pourquoi il existe : tant que l'exploration ne coûtait rien, `coutApi`
   * valait le seul profilage, et l'afficher à côté des taux de profil était
   * juste. Depuis que la navigation appelle un modèle à chaque point de
   * décision, le même total est majoritairement du coût de PARCOURS — publié
   * sous l'étiquette du profilage, il faisait lire un facteur treize comme une
   * dérive du profilage, alors que les cassettes de profil, elles, n'avaient
   * pas bougé. Un coût ne dit quelque chose que placé à côté de ce qu'il
   * achète (APPRENTISSAGES n°3) ; un coût placé à côté de ce qu'il n'achète
   * pas est un diagnostic faux (n°6).
   *
   * Rien n'est RÉPARTI ici : les trois montants sont mesurés séparément à la
   * source, et leur somme est exactement `coutApi`.
   */
  coutApiParFamille?: CoutParFamille;
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
  /**
   * Profil du site produit par l'IA (brique 4a). Absent en mode dégradé — la
   * raison est alors au journal. RIEN ne le consomme encore : la brique 4b
   * sera son premier lecteur.
   */
  profil?: ProfilSiteRapporte;
  /**
   * Le rapport tel qu'un humain le lit (brique 5). Produit APRÈS tout le
   * reste et À PARTIR DU PRÉSENT RAPPORT SEUL.
   *
   * Il voyage DANS le rapport technique plutôt qu'à côté parce que le contrat
   * du moteur est `Scanner → Rapport` : un second canal de sortie obligerait
   * chaque consommateur — le banc aujourd'hui, l'interface demain — à savoir
   * qu'il existe. Absent quand rien ne l'a demandé (`OptionsScan.langueRapport`
   * jamais résolue) ; PRÉSENT même sans IA, structurel et sans prose.
   */
  rapportBusiness?: RapportBusiness;
}

/** Le profil tel qu'il voyage dans un rapport : la valeur, plus d'où elle vient. */
export interface ProfilSiteRapporte {
  typeSite: string;
  /**
   * Description libre de la valeur d'échappement : journalisée, jamais lue par
   * une logique. Elle est en revanche MONTRÉE au modèle de navigation depuis
   * la brique 4b (le profil entre dans son bloc non fiable), et y est bornée
   * comme toute autre chaîne venue de la page — voir `ProfilPage.natureLibre`.
   */
  natureLibre: string | null;
  langue: string;
  confiance: number;
  /** Version du prompt qui l'a produit : sans elle, on ne sait pas ce qu'on mesure. */
  versionPrompt: string;
  /** ALIAS de modèle demandé (celui de la configuration). */
  modeleDemande: string;
  /**
   * Forme RÉSOLUE servie par le fournisseur, extraite de sa réponse. Un alias
   * est un pointeur : sans ce second champ, le jour où il désigne un autre
   * instantané, le rapport attribuerait la réponse au mauvais modèle.
   */
  modeleServi: string;
  /** true si le profil a demandé une relance (sa confiance est alors plafonnée). */
  apresRelance: boolean;
}

/** Options d'un scan. */
export interface OptionsScan {
  /** Durée maximale du scan ; le moteur doit rendre un rapport (éventuellement partiel) avant. */
  timeoutMs: number;
  /**
   * Langue du RAPPORT BUSINESS, indépendante de celle du site : c'est la
   * langue du CLIENT. Un commerçant français dont le site est en anglais lit
   * un rapport français — le plan l'exige, et le banc l'éprouve par un
   * scénario croisé.
   *
   * Absente = celle de `config/rapport.json`. C'est un PARAMÈTRE DE SCAN et
   * non un réglage de moteur : deux clients du même moteur n'ont pas la même
   * langue, et le jour où le scan est déclenché par une interface, c'est
   * l'interface qui la porte.
   */
  langueRapport?: string;
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
  /** Politique qui a tranché, et sa provenance si c'est l'IA : la traçabilité descend jusqu'à l'acte. */
  decision?: { politique: string; provenance?: ProvenanceDecision; raisonRepli?: string };
}

export interface Parcours {
  urlDepart: string;
  pages: PageVisitee[];
  actions: ActionExecutee[];
  /** Pourquoi l'exploration s'est arrêtée. `reserve-confirmation` : la part d'échéance de l'exploration est épuisée, la confirmation garde la sienne (P2-1). */
  arret: 'complet' | 'limite-pages' | 'echeance' | 'reserve-confirmation' | 'erreur';
  /**
   * URLs internes découvertes et JAMAIS visitées au moment où l'exploration
   * s'est arrêtée, tous viewports confondus.
   *
   * Pourquoi ce compteur existe, et pourquoi il est un champ plutôt qu'une
   * valeur d'`arret` : depuis que la politique de décision peut être l'IA,
   * `arret: 'complet'` a cessé d'être un FAIT du moteur pour devenir une
   * AFFIRMATION qu'un contenu de page peut rendre fausse. `terminer` est
   * toujours énuméré (une politique doit toujours pouvoir s'arrêter) et
   * l'élire est parfaitement légitime au regard des trois couches — aucune ne
   * s'allume. Une page qui obtient du modèle un arrêt immédiat obtiendrait
   * donc, sans ce chiffre, un rapport « exploration complète » après une page.
   *
   * Interdire `terminer` détruirait l'économie que la navigation guidée
   * achète : on rend donc l'arrêt VISIBLE plutôt qu'impossible. Un champ
   * additif, et non une quatrième valeur d'`arret`, parce qu'il ne périme
   * aucun consommateur existant et qu'il vaut toujours 0 en politique
   * déterministe, qui ne rend `terminer` que la file vide.
   */
  enAttenteALArret: number;
  /** Pages que le budget permettait encore à l'arrêt (somme sur les viewports). */
  pagesRestantesALArret: number;
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

/**
 * Une action POSSIBLE, énumérée par le moteur et offerte au choix.
 *
 * RÈGLE CENTRALE de la navigation IA : le modèle CHOISIT, il ne désigne
 * jamais. C'est le moteur qui énumère, qui attribue l'identifiant opaque, et
 * qui a déjà jugé chaque action légitime. Le modèle répond un identifiant de
 * cette liste — il n'a physiquement pas les moyens d'inventer un acte, ni de
 * produire un sélecteur, une URL ou un texte d'action. L'énumération est la
 * PREMIÈRE couche de sécurité, avant le filtre d'actions destructives.
 */
export interface ActionProposee {
  /** Identifiant OPAQUE attribué par le moteur (`c1`, `c2`…) : le modèle ne peut en inventer aucun. */
  id: string;
  type: TypeAction;
  /** L'action réelle, jamais transmise au modèle telle quelle : lui ne voit que l'identifiant et les repères ci-dessous. */
  action: Action;
  /** Repères techniques montrés au modèle (balise, type, chemin d'URL…) : jamais de sélecteur exécutable. */
  reperes: Record<string, string>;
  /** Libellé visible de l'élément, tronqué et balisé comme CONTENU : c'est par lui que la page parle au modèle. */
  libelle: string | null;
}

/** Ce que le modèle voit d'un point de décision. Tout y est donnée non fiable, sauf les identifiants. */
export interface EtatDecisionEnumere {
  /** Chemin d'URL de la page courante. */
  page: string;
  viewport: string;
  /**
   * Profil du site, s'il a été produit. C'est une sortie de NOTRE IA, et elle
   * entre ici comme DONNÉE NON FIABLE : une sortie de modèle reste du contenu
   * dérivé de la page — la chaîne de méfiance ne se rompt pas parce qu'on
   * s'est parlé à soi-même.
   */
  profil: ProfilSiteRapporte | null;
  /** Les actions parmi lesquelles élire. Jamais vide quand une décision est demandée. */
  actions: ActionProposee[];
  /** Historique court des actions déjà exécutées (type + chemin), pour situer la décision. */
  historique: { type: TypeAction; page: string }[];
  nbPagesVisitees: number;
  /** Budget de pages restant : ce qui rend une décision autre chose qu'un parcours exhaustif. */
  pagesRestantes: number;
}

/** La réponse du modèle à un point de décision : une élection, rien d'autre. */
export interface DecisionIa {
  /** Doit appartenir aux identifiants énumérés ; sinon la réponse est hors schéma. */
  actionId: string;
  /** Justification en prose, PUREMENT JOURNALISÉE : terminale, lue par rien (même statut que `natureLibre`). */
  raison: string | null;
}

/**
 * Politique capable de décider à partir d'une énumération, éventuellement de
 * façon asynchrone (appel de modèle). La politique déterministe l'implémente
 * aussi : elle ignore l'énumération et tranche sur le contexte.
 */
export interface PolitiqueDecision {
  nom: string;
  decider(contexte: ContexteDecision, etat: EtatDecisionEnumere): Promise<DecisionPrise>;
}

/** Ce qu'une politique rend : l'action retenue, et d'où elle vient. */
export interface DecisionPrise {
  action: Action;
  /** Politique qui a RÉELLEMENT tranché — peut différer de celle demandée (dégradé par décision). */
  politique: string;
  /** Provenance, quand une IA a décidé. Absente pour la politique déterministe. */
  provenance?: ProvenanceDecision;
  /** Identifiant technique stable de la raison d'un repli sur la politique déterministe. */
  raisonRepli?: string;
}

/**
 * Provenance d'une sortie de modèle, quelle qu'elle soit. Les TROIS champs du
 * patron — version de prompt, modèle demandé, modèle servi — plus le drapeau
 * de relance. Un alias est un pointeur : sans le modèle SERVI, on mesure la
 * bonne réponse d'un modèle inconnu.
 */
export interface ProvenanceSortieIa {
  versionPrompt: string;
  modeleDemande: string;
  modeleServi: string;
  apresRelance: boolean;
}

/** Provenance d'une décision de navigation : le patron, plus ce qui lui est propre. */
export interface ProvenanceDecision extends ProvenanceSortieIa {
  /** Prose du modèle, terminale : journalisée, jamais lue par une logique. */
  raison: string | null;
  actionId: string;
}

export interface ContexteExploration {
  urlDepart: string;
  /**
   * Instant (epoch ms) avant lequel l'exploration doit avoir rendu son parcours.
   * Depuis le cahier P2-1 (contrat 2), c'est l'échéance de la PHASE — une part
   * de l'échéance du scan —, pas celle du scan : la confirmation a sa réserve,
   * l'exploration ne peut plus la manger.
   */
  echeance: number;
  /**
   * Motif d'arrêt à rendre quand `echeance` est atteinte : `reserve-confirmation`
   * quand c'est une part réservée qui s'est épuisée (le cas normal depuis P2-1),
   * `echeance` (défaut) quand c'est l'échéance du scan elle-même.
   */
  arretEcheance?: ArretEcheance;
  journaliser(type: string, details?: unknown): void;
}

/** Les deux façons de s'arrêter par le temps : l'échéance du scan, ou la part réservée aux phases suivantes. */
export type ArretEcheance = 'echeance' | 'reserve-confirmation';

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
  /** Page où l'anomalie a été OBSERVÉE : c'est elle que le rapport localise. */
  url: string;
  /**
   * Page où la recette S'OUVRE : celle où l'action déclenchante a été exécutée
   * (`action.page`), et donc celle d'où viennent les préalables. Pour une
   * anomalie constatée au chargement, c'est `url`. Pour une NAVIGATION, c'est
   * la page d'ORIGINE — et c'est toute la différence : la campagne 6b a vu le
   * rejeu ouvrir la page d'arrivée et y chercher le formulaire de la page de
   * départ, sur 100 % des candidates dès qu'un remplissage précédait une
   * navigation (carnet C-09, cahier P2-1, contrat 1).
   *
   * INVARIANT (en code, pas en config) : tout préalable vient de `pageDepart`.
   * `construireCandidate` le tient à la construction, le rejeu le vérifie
   * avant d'ouvrir quoi que ce soit.
   */
  pageDepart: string;
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
  /**
   * Clé du groupe de cause racine qui a porté le verdict — une RÉFÉRENCE vers
   * `Rapport.groupes`, jamais une copie. Une écartée recopiait son groupe entier
   * avec tous ses membres : à 1 649 candidates, 35 Mo d'écartées sur 42 de
   * journal, en O(n²) (campagne 6b, carnet C-13, cahier P2-1 contrat 7). La
   * preuve complète existe une fois, dans le groupe.
   */
  cle?: string;
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
  | 'basse-confiance'
  /**
   * DÉCOUVERTE (cahier P2-1, contrat 8) : PUBLIÉE, jamais re-confirmée —
   * constatée une fois pendant une re-exécution, ou suspectée côté site par
   * l'auto-diagnostic. Ce n'est pas un verdict de retenue : aucun re-test ne
   * l'a éprouvée. La distinction vit dans le rapport TECHNIQUE lui-même, et
   * plus seulement dans la phrase du rapport business : un consommateur du
   * journal (banc, métriques, bestiaire) qui lisait `confirmee` sur une
   * découverte comptait comme vérifié ce qui ne l'avait pas été, et la
   * gravité du détecteur ouvrait le rapport (expandtesting : six sections
   * « Bloquant » pour une iframe publicitaire vue pendant un rejeu).
   */
  | 'decouverte';

/** Verdicts dont les anomalies sont RETENUES dans le rapport final APRÈS re-vérification. */
export const VERDICTS_RETENUS: readonly VerdictConfirmation[] = ['confirmee', 'intermittente'];

/**
 * Verdicts dont les anomalies sont PUBLIÉES : les retenus, plus la découverte,
 * publiée comme une observation. Deux listes et non une : « publié » n'est
 * pas « vérifié » (cahier P2-1, contrat 8).
 */
export const VERDICTS_PUBLIES: readonly VerdictConfirmation[] = [...VERDICTS_RETENUS, 'decouverte'];

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

/**
 * Ce que le rejeu a OBSERVÉ — jusqu'où il est allé, et ce qu'il a vu passer.
 *
 * Pourquoi ces chiffres entrent dans le résultat du rejeu, et de là dans le
 * journal : sans eux, une tentative en échec dit qu'elle a échoué et ne dit
 * PAS si le site a été interrogé. « delai-depasse en 10 623 ms » se lit
 * exactement pareil quand le robot n'a jamais atteint le bouton et quand le
 * serveur a reçu la requête et ne l'a jamais servie — or c'est précisément la
 * question que le protocole pose. Le manque a été découvert en MESURANT
 * l'auto-diagnostic sur un corpus de journaux : le modèle a répondu cinq fois
 * qu'il lui manquait de savoir si la requête avait été émise et à quelle
 * étape l'attente avait expiré. C'est un manque du JOURNAL — un lecteur
 * humain a le même — pas une commodité pour un modèle.
 *
 * Aucun de ces champs n'interprète : ce sont des comptes, des statuts HTTP et
 * des codes d'erreur du navigateur (standards techniques universels,
 * constitution §2). L'imputation reste au-dessus.
 */
export interface ObservationsRejeu {
  /** Pages effectivement chargées. 0 : la page n'a jamais été obtenue. */
  nbPages: number;
  /** Statut HTTP du document de la dernière page chargée ; null si la navigation n'a pas abouti. */
  statutDocument: number | null;
  /** Actions menées à leur terme, le chargement compris. */
  nbActions: number;
  /** Actions que le rejeu devait mener : chargement, actions préalables, action déclenchante. */
  nbActionsPrevues: number;
  /** Type de la première action NON menée ; null quand le rejeu est allé au bout. */
  arreteA: string | null;
  /** Signaux collectés pendant le rejeu, tous types confondus. */
  nbSignaux: number;
  /** Statuts HTTP distincts observés, triés. */
  statuts: number[];
  /**
   * Réponses dont le statut est HORS de la classe 2xx : `<statut> <MÉTHODE>
   * <url>`, distinctes et triées.
   *
   * `statuts` seul est ANONYME — « un 503 est passé » ne dit pas sur quelle
   * requête, et la mesure l'a montré : le modèle a refusé d'imputer un 503
   * faute de savoir s'il concernait la soumission examinée. La classe 2xx est
   * un standard technique du web (constitution §2, « le code peut connaître LE
   * WEB »), pas un jugement : la liste dit quelles réponses n'y appartiennent
   * pas, elle ne dit pas qu'elles sont fautives.
   */
  reponsesHors2xx: string[];
  /**
   * Requêtes en ÉCHEC réseau : `<code> <MÉTHODE> <url>`, distinctes et triées.
   *
   * Le code seul ne suffisait pas, et c'est la mesure qui l'a montré : « une
   * requête a échoué » ne dit pas si c'est celle dont l'anomalie parle. La
   * ressource NOMME ce qui a échoué, et c'est elle qui fait la différence
   * entre « le site a cassé la requête que nous lui avons envoyée » et « une
   * image tierce n'est pas arrivée ».
   */
  echecsReseau: string[];
  /**
   * Requêtes restées SANS RÉPONSE à la fin d'une fenêtre d'observation :
   * `<MÉTHODE> <url>`, distinctes et triées. Même raison que ci-dessus — une
   * requête pendante ANONYME est une information qu'on ne peut pas utiliser.
   */
  requetesEnAttente: string[];
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
  /**
   * Détecteur GRADUÉ seulement : le rejeu a tourné mais la ressource visée
   * n'a pas été rechargée, donc rien n'a été mesuré. Un troisième état,
   * compté, jamais confondu avec « non reproduite » : la campagne 6b a vu
   * douze rejeux de lenteur écarter par ABSENCE de mesure, pas par re-mesure
   * (carnet C-04, cahier P2-1 contrat 4).
   */
  nonMesuree?: boolean;
  dureeMs: number;
  /**
   * Ce que le rejeu a observé. Optionnel parce que le champ est arrivé après
   * le type : une tentative fabriquée par un test peut s'en passer, un rejeu
   * réel jamais — un test de `reexecuterGroupe` l'exige sur CHAQUE tentative,
   * y compris celles qui ont échoué, parce que c'est là qu'il sert.
   */
  observations?: ObservationsRejeu;
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
  /**
   * Ce que le rejeu de contre-épreuve a observé. C'est souvent la pièce la
   * plus parlante du dossier : un rejeu qui va jusqu'au bout dans l'AUTRE
   * viewport, au même instant, prouve que le site répondait.
   */
  observations?: ObservationsRejeu;
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
  /**
   * Découverte à émettre en plus du verdict. C'est le SEUL effet d'un avis
   * « cause site » : le groupe RESTE écarté — une opinion ne remonte jamais
   * un verdict (principe du doute) — et l'anomalie est publiée dans le
   * troisième état épistémique, « constatée, non re-confirmée », avec une
   * confiance minorée : un avis n'est pas une preuve.
   *
   * Le jour où l'on voudra retenir sur avis, ce sera par une RE-EXÉCUTION
   * supplémentaire déclenchée par l'avis — une preuve achetée, pas une
   * opinion crue. C'est une brique future, pas un ajustement de cette table.
   */
  decouverte?: { facteurConfiance: number; motif: string };
  /** Provenance, quand l'avis vient d'un modèle. Absente pour l'auto-diagnostic mécanique. */
  provenance?: ProvenanceSortieIa;
  /** Prose du modèle, terminale : journalisée, jamais lue par une logique. */
  justification?: string | null;
}

// ===========================================================================
// RAPPORT BUSINESS (brique 5) — le moteur parle à un humain
// ===========================================================================

/**
 * Statut épistémique d'une section, tel qu'un lecteur non technicien doit le
 * comprendre. C'est la VOIX DE LA MARQUE : aucune formulation ne promet plus
 * que son statut, et le statut est posé par le CODE depuis le rapport
 * technique — jamais par le modèle.
 */
export type StatutSection =
  /** Reproduite par les re-exécutions. */
  | 'confirmee'
  /** Reproduite partiellement : un défaut sur deux tentatives est un défaut. */
  | 'intermittente'
  /** Constatée pendant la vérification seulement, jamais re-testée (troisième état épistémique). */
  | 'constatee-au-rejeu'
  /** Constatée une fois, non reproduite, cause site suspectée par le diagnostic — non re-confirmée. */
  | 'diagnostic-site';

/** Où une anomalie se manifeste, dit à un humain : des pages et des viewports, pas des sélecteurs. */
export interface LocalisationLisible {
  /** Chemin d'URL de la page. */
  page: string;
  /**
   * Viewports concernés. Une anomalie vue sur un seul viewport reste
   * distinguable jusqu'ici — « mobile uniquement » a été préservé trois
   * briques durant pour arriver dans cette phrase.
   */
  viewports: string[];
}

/**
 * Chiffrage monétaire de l'impact. LOGEMENT VIDE en Phase 1, et
 * délibérément.
 *
 * Le moteur ne connaît ni le panier moyen ni le trafic : un montant estimé
 * par le modèle serait un diagnostic faux adressé à la personne la moins
 * armée pour s'en défendre. Ce champ se remplira quand le client aura fourni
 * ses grandeurs, jamais par estimation.
 */
export interface ImpactChiffre {
  montantParJour: number;
  devise: string;
  /** Grandeurs fournies par le client d'où le montant est dérivé. Sans elles, pas de montant. */
  hypotheses: Record<string, number>;
}

/**
 * Une anomalie retenue, dite à un humain.
 *
 * SÉPARATION STRICTE — les champs de PROSE sont rédigés par le modèle, les
 * champs de FAIT sont posés par le code depuis le rapport technique. Le
 * modèle rédige des phrases DANS des champs ; il ne produit jamais un
 * chiffre, une gravité ni un statut. Un rapport où le modèle aurait PU
 * altérer un fait est un rapport où il l'a peut-être fait.
 */
export interface SectionRapport {
  /**
   * Identifiant OPAQUE attribué par le moteur (`s1`, `s2`…), dans l'ordre des
   * anomalies retenues.
   *
   * C'est l'ÉNUMÉRATION de la brique 4b appliquée à la rédaction, et pour la
   * même raison : le contrat de sortie envoyé au modèle porte ces
   * identifiants en `enum`, donc le modèle ne peut ni en inventer un, ni en
   * omettre un, ni en dupliquer un — la bijection entre les sections et les
   * anomalies retenues devient impossible à rompre, au lieu d'être vérifiée
   * après coup. Un identifiant dérivé de la page (clé de groupe, URL) aurait
   * en plus fait entrer du contenu de site dans un champ structurant.
   */
  id: string;
  /** Clé du groupe de cause racine d'où vient la section : la traçabilité descend jusqu'au moteur. */
  groupe?: string;
  // --- FAITS (posés par le code, jamais par le modèle) ---
  categorie: Categorie;
  gravite: Gravite;
  statut: StatutSection;
  /** Formulation du statut, prise dans la table code → texte. Jamais rédigée librement. */
  statutFormule: string;
  localisations: LocalisationLisible[];
  /** Chiffrage monétaire : absent en Phase 1. */
  impactChiffre?: ImpactChiffre;
  // --- PROSE (rédigée par le modèle, terminale : aucune logique ne la lit) ---
  titre: string;
  constat: string;
  impact: string;
  actionSuggeree: string;
}

/**
 * Le rapport tel qu'un propriétaire de site le lit. Produit APRÈS le rapport
 * technique et À PARTIR DE LUI SEUL : aucun accès à la page, aucun réseau
 * hors l'appel de rédaction.
 */
export interface RapportBusiness {
  /** Langue du rapport, indépendante de celle du site : c'est la langue du CLIENT. */
  langue: string;
  /** État global en une phrase (prose). */
  synthese: string;
  sections: SectionRapport[];
  /**
   * Nombre de signalements écartés par les re-vérifications. Le chiffre
   * NEUTRE : sa décomposition (fausses alertes évitées / anomalies perdues)
   * appartient au banc, qui seul possède la vérité terrain.
   *
   * `null` quand le protocole de confirmation n'a PAS consolidé en groupes de
   * cause racine — parce qu'il est tombé, ou parce que l'implémentation
   * utilisée ne consolide pas. Dans ces deux cas, il n'existe aucun compte de
   * signalements écartés PAR DES RE-VÉRIFICATIONS, puisqu'il n'y a pas eu de
   * re-vérification. Publier le nombre de candidates à la place serait
   * doublement faux : mauvaise unité (des signalements, pas des causes) et
   * mauvaise phrase (« écartés par nos re-vérifications » alors que rien n'a
   * été rejoué). Le rendu dit alors qu'il ne peut pas se prononcer — c'est le
   * seul énoncé honnête, et c'est au pire moment qu'il compte : quand la
   * confirmation vient de tomber.
   */
  nbEcartes: number | null;
  /**
   * Signalements écartés SANS avoir été re-vérifiés : échéance atteinte avant
   * leur tour, ou aucun rejeu exploitable.
   *
   * Ils sont comptés À PART de `nbEcartes`, et ce n'est pas une nuance. Le
   * protocole les a écartés, mais il ne les a pas ÉPROUVÉS : les additionner
   * ferait dire au rapport « nos re-vérifications ont écarté N signalements »
   * alors qu'une partie d'entre eux n'a jamais été rejouée — le différenciateur
   * commercial du produit, affiché à son maximum au moment précis où il n'a pas
   * fonctionné. Les taire serait l'autre mensonge : le lecteur croirait que
   * tout ce qui a été vu a été jugé.
   *
   * `null` dans le même cas que `nbEcartes` : aucune consolidation, donc aucun
   * compte possible.
   */
  nbNonVerifies: number | null;
  /**
   * Ce que le protocole a physiquement rejoué, en GROUPES (P2-1, contrat 5) :
   * quand rien n'a pu l'être, la première ligne du rapport le dit, avant
   * « aucune anomalie ». null quand la confirmation n'a pas consolidé.
   */
  rejouabilite: { groupes: number; groupesRejoues: number } | null;
  /**
   * Phrase de méthode, rédigée par le modèle, posée À CÔTÉ de ce chiffre.
   *
   * Elle ne le PORTE pas : tout chiffre est refusé dans la prose (le modèle
   * n'énonce jamais un fait), et c'est le rendu qui écrit le compte à partir
   * de `nbEcartes` et `nbNonVerifies`. Un consommateur qui n'afficherait que
   * ce champ rendrait une méthode sans son chiffre.
   */
  ligneMethode: string;
  /**
   * Combien de sections PUBLIÉES portent une prose.
   *
   * Ce n'est pas la même chose que `sansProse`. La rédaction se fait en un
   * appel, sur un bloc de faits BORNÉ : quand les faits dépassent la borne,
   * des sections entières en sortent — elles restent publiées, avec leurs
   * faits, mais sans titre, sans constat, sans impact et sans action. Le
   * rapport est alors PARTIEL, et un partiel muet est le pire des deux
   * mondes : le lecteur ne peut pas distinguer « nous n'avons rien à en dire »
   * de « le budget s'est arrêté là ». Le rendu le dit, et il lui faut ce
   * compte pour le dire.
   */
  nbSectionsRedigees: number;
  /**
   * Localisations PUBLIÉES que le rédacteur n'a PAS vues.
   *
   * Le rapport publie toutes les pages d'une section ; le bloc factuel montré
   * au modèle, lui, est borné (`localisationsMaxParSection`). L'écart n'est pas
   * une curiosité d'implémentation : c'est par le CHEMIN d'une page qu'un site
   * inspecté peut adresser une phrase à notre rédacteur, donc c'est par cette
   * borne qu'une charge peut disparaître avant de l'atteindre. Le banc a besoin
   * de ce compte pour distinguer « le rédacteur a résisté » de « le rédacteur
   * n'a jamais rien vu » — la première fois, il a crédité la seconde comme la
   * première (APPRENTISSAGES n°11).
   *
   * `null` quand aucune rédaction n'a été demandée : rien n'a été montré, et
   * un zéro laisserait croire que tout l'a été.
   */
  nbLocalisationsMasquees: number | null;
  /** Provenance de la rédaction. Absente quand le rapport est produit en mode dégradé. */
  provenance?: ProvenanceSortieIa;
  /**
   * Les formulaires du site ont-ils été SOUMIS pendant le scan ?
   *
   * `false` sous `interaction.soumission: 'aucune'` — le mode par défaut de la
   * production, où le robot regarde sans rien envoyer. Une part du site n'est
   * alors PAS TESTÉE : ce qui ne se constate qu'en soumettant un formulaire
   * n'a pas pu l'être.
   *
   * Le rapport doit le DIRE. Un rapport muet sur ce point laisserait croire à
   * une couverture qu'il n'a pas eue — et « aucune anomalie retenue » se
   * lirait « votre formulaire fonctionne » alors que personne ne l'a essayé.
   * C'est le même principe que le compte des signalements non re-vérifiés :
   * ce que nous n'avons pas éprouvé se dit, il ne se tait pas.
   */
  soumissionsTestees: boolean;
  /** true si aucune prose n'a pu être rédigée : le rapport est STRUCTUREL, et il reste lisible. */
  sansProse: boolean;
}
