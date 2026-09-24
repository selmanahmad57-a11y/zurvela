/**
 * Couche d'abstraction IA : SEUL point de contact avec les API de modèles
 * (constitution §4). Le reste du moteur appelle des fonctions métier
 * (`profiler`, `decider`, `diagnostiquer`, `rediger`), jamais un SDK.
 *
 * Ce fichier porte les CONTRATS et le client sans capacité (mode dégradé).
 * Le client concret vit dans `anthropic.ts` — seul fichier du dépôt qui
 * importe le SDK —, les prompts dans `prompts/profilage/v1.ts` et
 * `prompts/navigation/v2.ts`, la validation dans `schema-profil.ts` et
 * `schema-decision.ts`, le mode rejouable dans `cassettes.ts`.
 */
import type {
  Rapport,
  DecisionIa,
  EtatDecisionEnumere,
  ProvenanceDecision, ProvenanceSortieIa } from '../types.js';
import type { ConfigScanner } from '../scanner/config.js';
import type { EtatNormalise } from './etat-decision.js';
import type { ContexteDiagnosticNormalise } from './contexte-diagnostic.js';

export type ModeIa = 'actif' | 'degrade';

/**
 * Résultat d'un appel IA : indisponible (mode dégradé, panne) ou valeur +
 * coût.
 *
 * `message` et `coutApi` sur la branche indisponible ne sont pas décoratifs :
 * un appel peut échouer APRÈS avoir dépensé (une relance dont la seconde
 * réponse est encore hors schéma), et un coût dépensé qui ne se voit pas est
 * un coût qui ment (APPRENTISSAGES n°3). `message` porte le détail
 * opérationnel — la commande à lancer, le statut HTTP — que la `raison`,
 * stable et machinable, ne doit pas porter.
 */
export type ResultatIa<T> =
  | { disponible: false; raison: string; message?: string; coutApi?: number }
  | { disponible: true; valeur: T; coutApi: number };

/**
 * Profil d'un site — CONTRAT FERMÉ, jamais de la prose que le moteur
 * interpréterait. Même logique que le menu fermé de navigation : le modèle
 * choisit et remplit des champs contraints, Ajv rejette le reste.
 *
 * Les quatre derniers champs sont l'ESTAMPILLE DE PROVENANCE : ils ne sont
 * jamais demandés au modèle, ils sont apposés en code. Règle du patron,
 * valable pour toute sortie IA à venir (4b, 4c) : toute sortie IA porte sa
 * version de prompt, son modèle DEMANDÉ et son modèle SERVI. Sans eux, on ne
 * sait pas ce qu'on mesure.
 */
export interface ProfilPage {
  /**
   * Type de site, pris dans le vocabulaire de `config/profilage.json`. Le
   * code n'en connaît aucune valeur : le schéma de validation est dérivé de
   * la config (constitution §2).
   */
  typeSite: string;
  /**
   * Description libre accompagnant la valeur d'échappement, PUREMENT
   * JOURNALISÉE : jamais lue par une logique, jamais notée au banc. Elle
   * existe parce qu'une énumération sans échappatoire pousse le modèle à
   * mentir ; elle nourrit l'extension future du vocabulaire de config.
   * `null` dès que `typeSite` n'est pas la valeur d'échappement.
   *
   * C'est le SEUL champ du profil influençable mot à mot par le contenu de
   * la page. Depuis la brique 4b, il FRANCHIT la frontière du journal : le
   * profil entre dans le bloc non fiable du prompt de navigation, donc ce
   * champ aussi — la phrase « ne franchit jamais la frontière du journal »
   * qui figurait ici était devenue fausse, et un contrat faux est cru comme
   * un diagnostic faux (APPRENTISSAGES n°6).
   *
   * Il reste PUREMENT JOURNALISÉ au sens strict : aucune logique ne le lit,
   * aucune décision n'en dépend, il n'est jamais noté. Mais il est MONTRÉ à
   * un modèle qui dirige des actes, et il est donc borné comme toute autre
   * chaîne du bloc non fiable (`exploration.libelleMaxChars`, appliqué dans
   * `normaliserEtatDecision` puis refait à l'affichage). Son ancien plafond,
   * `profilage.maxTokensReponse`, était le réglage d'un AUTRE module : le
   * relever aurait élargi en silence la surface d'injection de la navigation.
   */
  natureLibre: string | null;
  /** Langue détectée (code BCP 47). */
  langue: string;
  /** Confiance déclarée par le modèle, bornée à [0, 1] en code (invariant). */
  confiance: number;
  /** Version du prompt qui l'a produit. */
  versionPrompt: string;
  /**
   * ALIAS demandé (celui de `config/scanner.json`). Il entre dans la clé de
   * cassette parce qu'il est connu AVANT l'appel et qu'il est stable.
   */
  modeleDemande: string;
  /**
   * Forme RÉSOLUE que le serveur a servie, EXTRAITE de la réponse — jamais
   * déduite de l'alias. Un alias est un pointeur : le jour où il désigne un
   * instantané plus récent, une estampille réduite à l'alias mesurerait la
   * bonne réponse du MAUVAIS modèle. Une estampille que rien ne distingue de
   * sa voisine n'estampille rien (APPRENTISSAGES n°6).
   */
  modeleServi: string;
  /** true si une relance a été nécessaire : la confiance est alors plafonnée. */
  apresRelance: boolean;
}

/**
 * Ce que le profileur reçoit. Du TEXTE EXTRAIT, jamais le HTML brut :
 * surface d'injection minimale, coût minimal. Le contenu est une DONNÉE NON
 * FIABLE (constitution §3) — il peut contenir des tentatives d'instruction,
 * qui sont du contenu à analyser, pas des ordres.
 */
export interface ContexteProfilage {
  url: string;
  /** Texte visible + titre + métadonnées, déjà tronqué à `contexteMaxChars`. */
  texte: string;
  /** Attribut `lang` du document s'il existe : un indice technique, pas une vérité. */
  langueDeclaree: string | null;
}

/**
 * Ce que le client rend RÉELLEMENT sur une décision : l'élection du modèle,
 * plus son estampille de provenance.
 *
 * `DecisionEstampillee` ÉTEND `DecisionIa` (contrat posé) sans le modifier :
 * tout appelant qui n'attend qu'une `DecisionIa` compile et fonctionne à
 * l'identique. L'extension existe parce que la provenance trois champs est
 * exigée sur CHAQUE décision, et que deux de ces informations — le modèle
 * réellement servi et le fait qu'une relance ait eu lieu — ne sont connues
 * que d'ici : aucun autre canal ne peut les faire sortir de `core/ia`. Une
 * estampille reconstituée par l'appelant serait une décoration, pas une
 * provenance (APPRENTISSAGES n°6).
 */
export interface DecisionEstampillee extends DecisionIa {
  provenance: ProvenanceDecision;
}

/**
 * À qui la faute, selon le modèle.
 *
 * Vocabulaire DISTINCT de `VerdictConfirmation` : celui-ci qualifie une
 * CAUSE, celui-là une DÉCISION du protocole. Les aligner serait une fausse
 * symétrie ; le passage de l'un à l'autre est une table de traduction
 * explicite, unique et testée cas par cas.
 *
 * Distinct aussi de `CauseEchecRejeu`, qui classe mécaniquement l'échec d'un
 * rejeu : ici le modèle juge le RÉSIDU que la mécanique a renoncé à trancher.
 *
 * `indetermine` est une RÉPONSE ATTENDUE et légitime. Un diagnostic qui
 * répond toujours `outil` ou `site` devant un journal indécidable fabrique de
 * la certitude — exactement ce que le produit ne doit jamais faire devant un
 * commerçant. L'aveu est la bonne réponse quand il n'y en a pas d'autre.
 */
export type AvisCause = 'outil' | 'site' | 'indetermine';

/** Un diagnostic, plus sa provenance : toute sortie IA porte son estampille. */
export interface DiagnosticEstampille extends Diagnostic {
  provenance: ProvenanceSortieIa;
}

export interface Diagnostic {
  avis: AvisCause;
  /** Prose du modèle, TERMINALE : journalisée, jamais lue par une logique (statut de `natureLibre`). */
  justification: string;
}

/**
 * Ce que le diagnostic reçoit : des extraits STRUCTURÉS du journal d'une
 * tentative de rejeu, tronqués et balisés comme contenu.
 *
 * Le journal transporte des chaînes issues de la page (libellés, messages
 * d'erreur, URL) : la chaîne de méfiance s'applique au journal comme à la
 * page. Un journal n'est pas plus fiable parce que c'est nous qui l'avons
 * écrit — nous y avons recopié ce que la page a dit.
 */
export interface ContexteDiagnostic {
  /** Clé du groupe de cause racine concerné. */
  groupe: string;
  /** Description technique de l'anomalie (identifiant stable, jamais de prose). */
  description: string;
  /** Extraits du journal des tentatives, déjà tronqués. */
  extraits: string[];
}

export interface ClientIa {
  mode: ModeIa;
  /** Pourquoi le client est en mode dégradé (clé absente, fonctions non implémentées) ; null en mode actif. */
  raisonDegrade: string | null;
  profiler(contexte: ContexteProfilage): Promise<ResultatIa<ProfilPage>>;
  /**
   * ÉLIT une action parmi celles que le moteur a énumérées. Le modèle ne
   * produit jamais d'action : il rend l'identifiant opaque de son choix.
   */
  decider(etat: EtatDecisionEnumere): Promise<ResultatIa<DecisionEstampillee>>;
  diagnostiquer(contexte: ContexteDiagnostic): Promise<ResultatIa<DiagnosticEstampille>>;
  rediger(rapport: Rapport, langue: string): Promise<ResultatIa<string>>;
}

/**
 * Réponse BRUTE du modèle, telle qu'elle sera figée dans une cassette.
 *
 * Elle n'existe que pour l'enregistrement : une cassette doit contenir ce que
 * le modèle a RÉELLEMENT répondu, pas notre relecture de sa réponse. Si on
 * n'enregistrait que le profil analysé, le rejeu ne mesurerait plus le
 * modèle mais notre propre analyseur, et un changement de validation
 * passerait inaperçu.
 */
export interface ReponseBrute {
  texte: string;
  /** Coût CUMULÉ de l'appel, relance comprise. */
  coutApi: number;
  apresRelance: boolean;
  /** Modèle réellement servi, lu dans la réponse du serveur (jamais l'alias recopié). */
  modeleServi: string;
}

/**
 * Client capable de rendre la réponse brute : seul le mode ENREGISTREMENT du
 * décorateur rejouable en a besoin. Le moteur, lui, ne connaît que `ClientIa`.
 */
export interface ClientIaEnregistrable extends ClientIa {
  profilerBrut(contexte: ContexteProfilage): Promise<ResultatIa<ReponseBrute>>;
  /**
   * Même rôle que `profilerBrut`, pour une décision. L'état reçu est déjà
   * NORMALISÉ par le décorateur rejouable : la cassette doit figer la réponse
   * du prompt qui a servi à calculer sa clé, pas celle d'un prompt voisin.
   */
  deciderBrut(etat: EtatNormalise): Promise<ResultatIa<ReponseBrute>>;
  /**
   * Même rôle, pour un diagnostic. Le contexte reçu est déjà NORMALISÉ par le
   * décorateur rejouable, pour la même raison qu'à la navigation : la cassette
   * doit figer la réponse du prompt qui a servi à calculer sa clé.
   */
  diagnostiquerBrut(contexte: ContexteDiagnosticNormalise): Promise<ResultatIa<ReponseBrute>>;
}

export const RAISON_CLE_ABSENTE = 'cle-absente';
export const RAISON_NON_IMPLEMENTE = 'non-implemente';

/**
 * Fabrique un client SANS capacité IA : toutes les fonctions répondent
 * « indisponible » sans lever et sans réseau, le moteur fonctionne avec ses
 * détecteurs techniques seuls (constitution §4, mode dégradé obligatoire).
 *
 * Le mode reflète la disponibilité EFFECTIVE, pas la seule présence d'une
 * clé : le journal `ia.mode` ne doit pas annoncer un moteur actif qui ne
 * l'est pas. Le client CONCRET se construit avec `creerClientAnthropic` —
 * cette fabrique reste le chemin explicite du « sans IA ».
 */
export function creerClientIa(
  config: ConfigScanner['ia'],
  env: NodeJS.ProcessEnv = process.env,
): ClientIaEnregistrable {
  const cle = env[config.variableCle];
  const raison = cle === undefined || cle === '' ? RAISON_CLE_ABSENTE : RAISON_NON_IMPLEMENTE;
  return creerClientSansCapacite(raison);
}

/** Client dégradé sur une raison donnée : aucun appel, aucune exception. */
export function creerClientSansCapacite(raison: string, message?: string): ClientIaEnregistrable {
  const indisponible = async <T>(): Promise<ResultatIa<T>> => ({ disponible: false, raison, message });
  return {
    mode: 'degrade',
    raisonDegrade: raison,
    profiler: () => indisponible<ProfilPage>(),
    profilerBrut: () => indisponible<ReponseBrute>(),
    decider: () => indisponible<DecisionEstampillee>(),
    deciderBrut: () => indisponible<ReponseBrute>(),
    diagnostiquer: () => indisponible<DiagnosticEstampille>(),
    diagnostiquerBrut: () => indisponible<ReponseBrute>(),
    rediger: () => indisponible<string>(),
  };
}

// ===========================================================================
// Mode rejouable (brique 4a) : l'instrument de mesure doit rester déterministe
// ===========================================================================

/**
 * Une réponse de modèle figée, rejouée à l'identique par le banc.
 *
 * Les cassettes sont COMMITÉES : chaque réponse figée a ainsi un auteur, une
 * date et un hash dans l'historique, et le renouvellement du parc est un
 * commit lisible plutôt qu'une dérive silencieuse. On sait toujours QUELLE
 * réponse le banc mesure.
 */
export interface Cassette {
  /** hash(version du prompt + modèle + entrée normalisée). */
  cle: string;
  metadonnees: {
    /** Date d'enregistrement, ISO 8601. */
    date: string;
    /** ALIAS demandé : celui qui entre dans la clé, donc celui qui doit rester stable. */
    modeleDemande: string;
    /**
     * Forme résolue servie par le serveur au moment de l'enregistrement.
     * Elle ne vit QUE dans les métadonnées : la clé doit être calculable
     * avant l'appel. C'est elle qui permet à la garde d'écriture de nommer
     * la vraie cause d'une divergence (prompt modifié ou alias glissé).
     */
    modeleServi: string;
    versionPrompt: string;
    /** Coût réel de l'appel enregistré, relance comprise. */
    coutApi: number;
    /**
     * true si l'enregistrement a dû relancer le modèle. Sans ce champ, le
     * rejeu rendrait une confiance NON plafonnée là où l'appel réel avait
     * douté : l'instrument mentirait à la hausse, exactement ce que le
     * plafonnement existe pour empêcher.
     */
    apresRelance: boolean;
  };
  /** Réponse brute du modèle, telle qu'elle a été reçue. */
  reponse: string;
}

export interface DepotCassettes {
  lire(cle: string): Promise<Cassette | null>;
  /**
   * Écrit une cassette. DOIT refuser d'écrire une réponse différente sous une
   * clé existante : c'est le symptôme d'un prompt modifié sans incrément de
   * version, et l'échec doit être bruyant — jamais un écrasement silencieux
   * (constitution §6 : on ne modifie pas un prompt sans incrémenter sa
   * version ; la cassette rend la règle mécaniquement obligatoire).
   */
  ecrire(cassette: Cassette): Promise<void>;
}

/** Raison technique stable : cassette absente alors que le réseau est interdit. */
export const RAISON_CASSETTE_ABSENTE = 'cassette-absente';
/** Raison technique stable : la réponse du modèle ne valide pas son schéma, relances épuisées. */
export const RAISON_PROFIL_INVALIDE = 'profil-invalide';
/** Raison technique stable : le modèle a élu un identifiant qui n'était pas au menu. */
export const RAISON_ACTION_INCONNUE = 'action-inconnue';
/** Raison technique stable : une décision a basculé sur la politique déterministe. */
export const RAISON_REPLI_DETERMINISTE = 'repli-deterministe';
/**
 * Raison technique stable : la réponse de décision ne valide pas son contrat
 * pour une autre cause qu'un identifiant hors menu (JSON inanalysable, champ
 * manquant, propriété inventée), relances épuisées.
 *
 * Distincte de `RAISON_ACTION_INCONNUE` parce que les deux causes n'appellent
 * pas la même correction, et qu'une garde qui accuse le mauvais coupable est
 * pire qu'une garde absente (APPRENTISSAGES n°6) : l'une dit « le modèle a
 * voulu sortir du menu », l'autre « le modèle n'a pas su écrire le contrat ».
 */
export const RAISON_DECISION_INVALIDE = 'decision-invalide';
/** Raison technique stable : la cassette existe mais n'est pas lisible (fichier corrompu). */
export const RAISON_CASSETTE_ILLISIBLE = 'cassette-illisible';
/**
 * Diagnostics STABLES d'une divergence de cassette. Deux causes produisent le
 * même symptôme — une réponse différente sous une clé existante — et une garde
 * qui accuse le mauvais coupable est pire qu'une garde absente : elle envoie
 * corriger ce qui fonctionne (APPRENTISSAGES n°6). La garde les distingue en
 * comparant les modèles SERVIS.
 */
export const DIVERGENCE_PROMPT_SANS_INCREMENT = 'cassette-divergente:prompt-modifie-sans-increment';
/** L'alias a changé d'instantané : ce n'est PAS un défaut de versionnement, il faut renouveler le parc. */
export const DIVERGENCE_GLISSEMENT_ALIAS = 'cassette-divergente:glissement-alias';

/**
 * Raison technique stable : la réponse de diagnostic ne valide pas son contrat
 * — avis hors des trois valeurs, champ manquant, JSON inanalysable,
 * justification vide —, relances épuisées.
 *
 * UNE seule raison pour ces causes, là où la navigation en distingue deux, et
 * c'est délibéré. En 4b, `RAISON_ACTION_INCONNUE` existe parce que l'élection
 * hors menu porte une conséquence de SÉCURITÉ que l'autre branche n'a pas :
 * les deux appellent des corrections différentes. Ici, les branches finissent
 * toutes au même endroit — pas d'avis, donc le silence d'avant la brique — et
 * aucune correction ne se déduit de l'une plutôt que de l'autre. Une garde qui
 * invente une distinction dont le produit ne peut rien faire n'est pas plus
 * précise, elle est décorative. Le détail STRUCTUREL reste lisible au journal,
 * dans `message` (`avis:valeurHorsEnumeration`, `reponse:reponseNonJson`…).
 *
 * Et elle ne s'allume JAMAIS sur un avis `indetermine` valide : l'aveu est une
 * réponse du contrat, pas un défaut de contrat.
 */
export const RAISON_DIAGNOSTIC_INVALIDE = 'diagnostic-invalide';
/**
 * Raison technique stable : la porte `diagnostic.actif` est fermée.
 *
 * Le déclenchement est filtré en amont, dans le protocole — c'est là que la
 * porte doit vivre. Celle-ci est une SECONDE serrure, posée sur le seul chemin
 * qui dépense : aucun appel réseau ne part quand la porte est fermée, même si
 * un appelant oublie de la lire. Le cahier exige qu'un diagnostic coupé rende
 * un comportement STRICTEMENT identique à la brique 4b ; une exigence de cette
 * nature ne se garde pas à un seul endroit.
 */
export const RAISON_DIAGNOSTIC_INACTIF = 'diagnostic-inactif';

/** Raison technique stable : aucun tarif connu pour le modèle — on ne sait pas ce qu'on dépense. */
export const RAISON_TARIF_ABSENT = 'tarif-absent';
/** Raison technique stable : le modèle a décliné la requête (`stop_reason: refusal`). */
export const RAISON_REFUS_MODELE = 'refus-modele';
/**
 * Raison technique stable : la génération a été COUPÉE par le plafond
 * (`stop_reason: max_tokens`). Distincte d'une réponse mal formée : la cause
 * est un budget de config, pas la forme de ce que le modèle a voulu rendre, et
 * relancer à l'identique ne peut que retronquer. Une garde qui accuse le
 * mauvais coupable envoie corriger ce qui fonctionne (APPRENTISSAGES n°6).
 */
export const RAISON_REPONSE_TRONQUEE = 'reponse-tronquee';
/** Raison technique stable : l'entrée dépasse la fenêtre de contexte du modèle. */
export const RAISON_CONTEXTE_DEPASSE = 'contexte-depasse';
/** Raison technique stable : quota de débit atteint. */
export const RAISON_APPEL_LIMITE = 'appel-limite-debit';
/** Raison technique stable : l'API n'a pas été joignable. */
export const RAISON_APPEL_RESEAU = 'appel-reseau';
/** Raison technique stable : l'API a répondu une erreur. */
export const RAISON_APPEL_API = 'appel-api';
/** Raison technique stable : échec non typé par le SDK. */
export const RAISON_APPEL_INATTENDU = 'appel-inattendu';

export type { EtatNormalise, ActionNormalisee, ProfilMontre } from './etat-decision.js';
export {
  empreinteContratNavigation,
  entreeCleDepuisEtat,
  identifiantsEnumeres,
  normaliserEtatDecision,
} from './etat-decision.js';
export {
  type BornesEnumeration,
  type ConfigAppelNavigation,
  type ConfigNavigation,
  FICHIER_CONFIG_NAVIGATION,
  assemblerConfigNavigation,
  chargerConfigAppelNavigation,
  chargerConfigNavigation,
} from './config-navigation.js';
export {
  type DecisionDemandee,
  type ResultatValidationDecision,
  type ValidateurDecision,
  DEFAUT_ACTION_INCONNUE,
  creerValidateurDecision,
  raisonInvaliditeDecision,
  schemaContratModeleDecision,
  schemaValidationDecision,
} from './schema-decision.js';
export {
  type AppelDecision,
  type ParametresDecision,
  deciderBrutAvec,
  decisionDepuisReponse,
} from './decision.js';
export {
  type ConstatInvalidite,
  type ValidateurProfil,
  type ResultatValidation,
  MOTS_CLES_CONTRAT_MODELE,
  creerValidateurProfil,
  resumerConstats,
  schemaContratModele,
  schemaValidationProfil,
} from './schema-profil.js';
export {
  type PorteeSdk,
  type OptionsClientAnthropic,
  type TarifModele,
  type TarifsIa,
  ENTETE_WORKSPACE,
  FORMAT_IDENTIFIANT_MODELE,
  creerClientAnthropic,
  enTetesWorkspace,
} from './anthropic.js';
export type { ContexteDiagnosticNormalise } from './contexte-diagnostic.js';
export {
  empreinteContratDiagnostic,
  entreeCleDepuisContexteDiagnostic,
  normaliserContexteDiagnostic,
} from './contexte-diagnostic.js';
export {
  type DiagnosticDemande,
  type ResultatValidationDiagnostic,
  type ValidateurDiagnostic,
  AVIS_ADMIS,
  AVIS_AVEU,
  DEFAUT_AVIS_HORS_ENUMERATION,
  DEFAUT_JUSTIFICATION_VIDE,
  creerValidateurDiagnostic,
  schemaContratModeleDiagnostic,
  schemaValidationDiagnostic,
} from './schema-diagnostic.js';
export {
  type AppelDiagnostic,
  type ParametresDiagnostic,
  diagnosticDepuisReponse,
  diagnostiquerBrutAvec,
} from './diagnostic.js';
export {
  type OptionsRejeu,
  COMMANDE_ENREGISTREMENT_IA,
  type OptionsDiagnosticRejeu,
  cleCassette,
  cleCassetteDecision,
  cleCassetteDiagnostic,
  clientRejouable,
  depotCassettesFichiers,
  diagnostiquerDivergence,
  normaliserUrlPourCle,
} from './cassettes.js';
