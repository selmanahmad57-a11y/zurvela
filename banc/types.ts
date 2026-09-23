/**
 * Contrats du banc d'essai.
 *
 * Le banc est l'instrument qui mesure le moteur : gabarits (mini-sites),
 * bugs injectables, scénarios, manifestes de vérité terrain, correcteur et
 * scorecard. Tout ce qui relie ces pièces entre elles est déclaré ici.
 *
 * ## Les TROIS natures d'attendu — la taxonomie est CLOSE
 *
 * Un manifeste n'exprime jamais que l'une de ces trois choses :
 *
 * 1. **DÉTECTÉ** — éprouve la PERCEPTION : le moteur a-t-il vu ce qui était
 *    là ? Sa forme inversée est l'attendu d'ABSENCE : sur un scénario sain,
 *    tout signalement est du bruit (c'est ce que compte un faux positif).
 * 2. **BIEN JUGÉ** — éprouve le DISCERNEMENT : le verdict rendu est-il
 *    celui qu'il fallait ? (`verdictAttendu` ; les verdicts d'auto-diagnostic
 *    à venir appartiennent à cette famille.)
 * 3. **RESTÉ INERTE** — éprouve la DÉSOBÉISSANCE : le moteur a-t-il refusé
 *    de faire ce que le contenu de la page lui demandait ? Une action
 *    destructive jamais cliquée, une injection de prompt sans effet. C'est
 *    une propriété de SÉCURITÉ, pas de détection : on mesure ce que le
 *    moteur ne fait pas.
 *
 * La taxonomie est close. Toute proposition d'une quatrième nature doit
 * d'abord prouver qu'elle n'est pas l'une des trois déguisée — c'est ce qui
 * empêche le manifeste de se déformer au fil des extensions du banc.
 */
import type { Anomalie, Categorie, Gravite, ProfilSiteRapporte, Rapport, VerdictConfirmation } from '../core/types.js';

// ---------------------------------------------------------------------------
// Configuration (miroir typé de config/banc.json, validé par config/banc.schema.json)
// ---------------------------------------------------------------------------

/** Sujets que le banc sait noter : le moteur réel, ou le scanner factice (contrôle du banc lui-même). */
export type NomSujet = 'reel' | 'factice';

export interface ConfigBanc {
  langueConsole: string;
  langues: string[];
  serveur: { portDeBase: number; nombrePortsEssayes: number };
  scan: { timeoutMs: number; sujetParDefaut: NomSujet };
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
  /**
   * État mutable propre au bug, créé vide au DÉMARRAGE du serveur de
   * scénario : c'est ce qui permet des bugs déterministes à compteur (une
   * requête sur deux, la première requête seulement). Un scénario redémarré
   * repart de zéro — condition des trois exécutions identiques du banc.
   */
  etat: Record<string, unknown>;
  /**
   * Temporisation d'un bug qui simule une lenteur. Injectable pour que les
   * tests puissent OBSERVER l'attente au lieu de la CHRONOMÉTRER : un seuil
   * de durée sous contention n'est pas une assertion, c'est un pari — et un
   * seuil plus large est le même pari avec une meilleure cote.
   */
  attendre(delaiMs: number): Promise<void>;
}

/**
 * Temporisation réelle. `unref` : un délai en cours ne retient pas le
 * processus quand le banc a fini.
 */
export function attendreReellement(delaiMs: number): Promise<void> {
  return new Promise<void>((resoudre) => setTimeout(resoudre, delaiMs).unref());
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
  /**
   * Ce que le bug éprouve, au sens de la taxonomie en tête de ce fichier.
   *
   * - `anomalie` (défaut) : le bug dégrade le site, il doit être DÉTECTÉ puis
   *   BIEN JUGÉ — un `AttenduBug` en est dérivé.
   * - `inertie` : le bug n'introduit AUCUNE anomalie à percevoir ; il dépose
   *   une charge qui demande au moteur de faire autre chose. Aucun
   *   `AttenduBug` n'en est dérivé, et `verdictAttendu` y serait sans objet :
   *   noter une injection de prompt en « ratée » ferait mentir le taux de
   *   DÉTECTION en imputant à la perception ce qui relève de la
   *   désobéissance. L'attendu correspondant est l'`AttenduProfil` du
   *   gabarit, rangé dans la famille « inerties tenues ».
   *
   * Déclaré explicitement plutôt que déduit de la catégorie `securite` : un
   * futur bug de sécurité RÉELLEMENT détectable perdrait sinon son attendu
   * en silence.
   */
  eprouve?: 'anomalie' | 'inertie';
  /** Gravité attendue du point de vue métier. */
  gravite: Gravite;
  /** Chemins d'URL des pages où l'anomalie est constatable (clé d'appariement avec le rapport). */
  pages: string[];
  /**
   * Verdict que le protocole de confirmation DOIT rendre sur ce bug.
   * Absent = `confirmee` (le cas ordinaire : un vrai défaut, reproductible).
   * Un bug dont le verdict attendu n'est pas retenu (`non-reproduite`…) est
   * un FAUX POSITIF SIMULÉ : le banc compte sa mise à l'écart comme une
   * réussite.
   */
  verdictAttendu?: VerdictConfirmation;
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
  /**
   * Profil que l'IA doit produire sur ce gabarit. Porté par le GABARIT et
   * non par un bug : c'est une propriété du site, pas d'une injection.
   * Absent = le gabarit ne se prononce pas (aucun attendu de profil dérivé).
   */
  profilAttendu?: { typeSite: string; langue: string | null };
}

// ---------------------------------------------------------------------------
// Manifeste de vérité terrain (dérivé du scénario, jamais écrit à la main)
// ---------------------------------------------------------------------------

/**
 * Un attendu du manifeste. Union DISCRIMINÉE : la taxonomie des trois
 * natures d'attendu (en tête de ce fichier) n'impose pas un type unique,
 * elle impose que chaque attendu DÉCLARE la sienne. Le correcteur route
 * par le discriminant `nature`.
 */
export type AttenduManifeste = AttenduBug | AttenduProfil;

/**
 * Attendu portant sur un BUG injecté : éprouve la perception (détecté) et
 * le discernement (bien jugé). Forme historique, inchangée.
 */
export interface AttenduBug {
  nature: 'bug';
  bugId: IdentifiantBug;
  nom: string;
  categorie: Categorie;
  pages: string[];
  gravite: Gravite;
  /** Verdict attendu du protocole de confirmation (défaut : `confirmee`). */
  verdictAttendu: VerdictConfirmation;
}

/**
 * Attendu portant sur le PROFIL que l'IA doit produire : éprouve le
 * discernement, et — sous un bug d'injection — la désobéissance (le profil
 * doit rester correct malgré une charge qui demande au modèle autre chose).
 *
 * Seuls les champs OBJECTIFS sont notés. Les champs indicatifs du profil
 * (description libre, confiance déclarée) sont journalisés et jamais notés :
 * noter une prose serait noter une opinion.
 */
export interface AttenduProfil {
  nature: 'profil';
  /** Valeur attendue de `typeSite`, prise dans le vocabulaire de config/profilage.json. */
  typeSite: string;
  /**
   * Langue attendue. `null` = celle du scénario (le cas ordinaire : un
   * gabarit servi en `fr` doit être profilé `fr`).
   */
  langue: string | null;
  /**
   * true si un bug actif tente de détourner le profil : l'attendu éprouve
   * alors l'INERTIE (le profil doit rester celui du site sain), et le banc
   * le compte dans la famille « inerties tenues », pas « profils corrects ».
   */
  inertieEprouvee: boolean;
}

export interface Manifeste {
  scenarioId: string;
  gabarit: string;
  langue: string;
  attendus: AttenduManifeste[];
}

/** Les attendus de nature `bug` d'un manifeste (raccourci de routage). */
export function attendusBug(manifeste: Manifeste): AttenduBug[] {
  return manifeste.attendus.filter((attendu): attendu is AttenduBug => attendu.nature === 'bug');
}

/** Les attendus de nature `profil` d'un manifeste (raccourci de routage). */
export function attendusProfil(manifeste: Manifeste): AttenduProfil[] {
  return manifeste.attendus.filter((attendu): attendu is AttenduProfil => attendu.nature === 'profil');
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

/**
 * Ce que le protocole a fait sur un scénario : avant, pendant, après.
 *
 * Tout se compte en GROUPES DE CAUSE RACINE, sauf les deux compteurs de
 * décomposition, qui comptent des ATTENDUS DISTINCTS du manifeste (voir plus
 * bas) : trois groupes écartés qui apparient le même bug simulé ne sont pas
 * trois fausses alertes évitées, sans quoi dégrader la consolidation
 * améliorerait mécaniquement le chiffre commercial.
 */
export interface ComptesProtocole {
  nbCandidates: number;
  nbGroupes: number;
  /**
   * Groupes dont le verdict est RETENU. Compté à part plutôt que déduit de
   * `nbGroupes - nbGroupesEcartes` : c'est ce qui rend vérifiable (et non
   * tautologique) l'invariant `nbGroupes === nbGroupesRetenus +
   * nbGroupesEcartes` du tableau affiché.
   */
  nbGroupesRetenus: number;
  nbGroupesEcartes: number;
  /** Attendus NON retenus par le manifeste dont au moins un groupe a été écarté. */
  nbFaussesAlertesEvitees: number;
  /** Attendus À RETENIR écartés sans qu'aucune anomalie retenue ne les couvre. */
  nbPertesProtocole: number;
  /**
   * Groupes écartés qui n'apparient AUCUN attendu du manifeste. Ce peut être
   * du bruit légitime comme un vrai bug que l'appariement structurel n'a pas
   * su rattacher (localisation en libellé d'étape, page hors liste) : le banc
   * ne sait pas trancher, donc il ne tranche pas — ce compteur a sa propre
   * colonne et n'est JAMAIS additionné au chiffre commercial.
   *
   * Seul compteur de décomposition à compter des GROUPES et non des attendus
   * distincts : sans attendu apparié, il n'y a rien sur quoi dédoublonner.
   */
  nbEcartesNonApparies: number;
}

export interface ResultatAttendu {
  /**
   * Toujours un attendu de nature `bug` : le correcteur route par
   * discriminant, et un attendu de PROFIL ne s'apparie à aucune anomalie. Le
   * type le dit pour qu'aucun consommateur n'ait à redemander la nature.
   */
  attendu: AttenduBug;
  verdict: Verdict;
  /** Anomalies du rapport appariées à cet attendu (plusieurs possibles : doublons, pas des faux positifs). */
  anomaliesAppariees: Anomalie[];
  /** Verdict de confirmation effectivement rendu (retenu ou écarté), ou null si l'anomalie n'apparaît nulle part. */
  verdictRendu?: VerdictConfirmation | null;
  /** true quand le verdict rendu est celui qu'attendait le manifeste. */
  bienJuge?: boolean;
}

/**
 * Notation d'un `AttenduProfil`. Famille DISTINCTE de la détection : un
 * attendu de profil non satisfait n'est JAMAIS un « faux positif » et ne
 * retire rien au taux de détection — ce sont deux choses différentes, et les
 * mélanger rendrait les deux chiffres illisibles.
 *
 * Seuls `typeSite` et la langue sont notés : `natureLibre` et la confiance
 * déclarée sont journalisés et jamais notés (noter une prose serait noter une
 * opinion).
 */
export interface ResultatProfil {
  attendu: AttenduProfil;
  /** Langue effectivement attendue : celle du scénario quand l'attendu dit `null`. */
  langueAttendue: string;
  /** Profil rendu par le moteur ; absent en mode dégradé (pas de clé, pas de cassette). */
  profil?: ProfilSiteRapporte;
  /**
   * Aucun profil n'a été produit. Ni crédité, ni imputé : le moteur n'a pas
   * eu tort, il n'a rien dit. Ce cas a sa propre colonne et sa propre ligne de
   * synthèse — un zéro silencieux serait exactement l'angle mort de
   * l'apprentissage n°4 (une mesure qui devient aveugle doit le DIRE).
   */
  nonMesure: boolean;
  /** true si `typeSite` ET la langue sont conformes à l'attendu. */
  satisfait: boolean;
}

export interface ResultatScenario {
  scenarioId: string;
  /** Comptes du protocole pour ce scénario (0 si le sujet n'en a pas). */
  protocole?: ComptesProtocole;
  gabarit: string;
  langue: string;
  /** `erreur` si le scanner a levé, dépassé le timeout ou rendu un rapport inexploitable : rien n'est compté comme détecté. */
  statut: 'ok' | 'erreur';
  erreur?: string;
  /** Notation des attendus de nature `bug` (détection et verdicts), et d'eux seuls. */
  attendus: ResultatAttendu[];
  /** Notation des attendus de nature `profil`, comptés à part de la détection. */
  profils: ResultatProfil[];
  fauxPositifs: Anomalie[];
  coutApi: number;
  dureeMs: number;
  rapport?: Rapport;
}

/**
 * Agrégat de scores sur un ensemble de scénarios (global, par langue, par
 * catégorie).
 *
 * ATTENTION aux compteurs du protocole (`nbCandidates`… `nbEcartesNonApparies`)
 * : ils ne sont ADDITIFS que sur un périmètre qui PARTITIONNE les scénarios —
 * le global et les langues. Le périmètre « catégorie de bug » compte chaque
 * scénario ayant au moins un attendu de la catégorie, donc un scénario
 * multi-catégories est compté dans plusieurs lignes : la somme des lignes
 * dépasse le global. Un groupe de cause racine n'est de toute façon pas
 * ventilable par catégorie de bug (une même cause réseau produit des anomalies
 * de catégories différentes). Le rendu console ne les affiche donc QUE sur les
 * périmètres qui partitionnent.
 */
export interface Agregat {
  nbScenarios: number;
  nbErreurs: number;
  nbAttendus: number;
  nbDetectes: number;
  nbRates: number;
  /** Nombre total d'anomalies signalées par le scanner. */
  nbSignalements: number;
  nbFauxPositifs: number;
  /** Attendus dont le verdict de confirmation est celui du manifeste. */
  nbVerdictsCorrects: number;
  /** Candidates produites par la détection, AVANT le protocole. */
  nbCandidates: number;
  /** Groupes de cause racine issus de la consolidation. */
  nbGroupes: number;
  /** Groupes dont le verdict est retenu : les alertes que le protocole a laissées passer. */
  nbGroupesRetenus: number;
  /** Groupes dont le verdict n'est pas retenu : les alertes que le protocole a tues. */
  nbGroupesEcartes: number;
  /**
   * ATTENDUS DISTINCTS que le manifeste ne voulait PAS voir retenus et dont
   * au moins un groupe a été écarté. C'est la mesure de l'argument central :
   * les fausses alertes que le protocole a évitées. Un groupe écarté qui
   * n'apparie aucun attendu n'y entre PAS (voir `nbEcartesNonApparies`) : le
   * banc ne crédite que ce que sa vérité terrain lui permet d'affirmer.
   */
  nbFaussesAlertesEvitees: number;
  /**
   * ATTENDUS DISTINCTS devant être RETENUS, écartés par le protocole et
   * qu'aucune anomalie retenue ne couvre : des anomalies réelles perdues. Le
   * pendant honnête de la mesure précédente — sans lui, le chiffre commercial
   * mentirait (docs/APPRENTISSAGES.md n°3).
   */
  nbPertesProtocole: number;
  /**
   * Groupes écartés sans attendu apparié : ni crédités, ni imputés. Ils ont
   * leur propre colonne parce que le banc ne sait pas s'il s'agit de bruit
   * légitime ou d'un vrai bug que l'appariement n'a pas su rattacher.
   */
  nbEcartesNonApparies: number;
  /**
   * Attendus de profil SANS inertie éprouvée et effectivement mesurés (un
   * profil a été produit) : la famille « profils corrects ».
   */
  nbProfilsMesures: number;
  /** Ceux d'entre eux dont `typeSite` et la langue sont conformes. */
  nbProfilsCorrects: number;
  /**
   * Attendus de profil AVEC inertie éprouvée et effectivement mesurés : la
   * famille « inerties tenues ». Comptée séparément parce qu'elle n'éprouve
   * pas la même chose — même attendu physique, nature comptable différente
   * selon qu'une charge d'injection est active.
   */
  nbInertiesMesurees: number;
  /** Ceux d'entre eux dont le profil est resté conforme MALGRÉ la charge. */
  nbInertiesTenues: number;
  /**
   * Attendus de profil (des deux familles) pour lesquels AUCUN profil n'a été
   * produit : mode dégradé, cassette absente, `--sans-ia`. Ni crédités, ni
   * imputés — ils ont leur propre colonne, comme `nbEcartesNonApparies`, et
   * sortent des dénominateurs : un taux calculé sur des mesures absentes
   * serait un chiffre inventé.
   */
  nbProfilsNonMesures: number;
  /** Détectés / attendus, en pourcentage ; null si aucun attendu. */
  tauxDetection: number | null;
  /** Verdicts corrects / attendus, en pourcentage ; null si aucun attendu. La 4e métrique nord. */
  tauxVerdictsCorrects: number | null;
  /** Faux positifs / signalements, en pourcentage ; null si aucun signalement. */
  tauxFauxPositifs: number | null;
  /** Profils corrects / profils mesurés, en pourcentage ; null si rien n'a été mesuré. */
  tauxProfilsCorrects: number | null;
  /** Inerties tenues / inerties mesurées, en pourcentage ; null si rien n'a été mesuré. */
  tauxInertiesTenues: number | null;
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
