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
import type { Anomalie, Categorie, CoutParFamille, Gravite, ProfilSiteRapporte, Rapport, Scanner, VerdictConfirmation } from '../core/types.js';
import type { ConfigScanner } from '../core/scanner/config.js';

// ---------------------------------------------------------------------------
// Configuration (miroir typé de config/banc.json, validé par config/banc.schema.json)
// ---------------------------------------------------------------------------

/** Sujets que le banc sait noter : le moteur réel, ou le scanner factice (contrôle du banc lui-même). */
export type NomSujet = 'reel' | 'factice';

/**
 * Politique de décision de navigation, TYPÉE DEPUIS LE MOTEUR
 * (`config/scanner.json`, `exploration.politique`) : le banc ne possède pas
 * cette liste, il la lit. Le jour où le moteur en renomme une, le typecheck
 * du banc le dit — une copie littérale, elle, aurait continué de compiler en
 * notant une politique qui n'existe plus (APPRENTISSAGES n°5).
 */
export type NomPolitique = ConfigScanner['exploration']['politique'];

/** Identifiants techniques stables des deux politiques, seuls noms que le banc prononce. */
export const POLITIQUE_DETERMINISTE = 'deterministe' satisfies NomPolitique;
export const POLITIQUE_IA = 'ia' satisfies NomPolitique;

/** Les politiques que le banc sait exécuter, dans l'ordre d'affichage de la jumelle. */
export const POLITIQUES: readonly NomPolitique[] = [POLITIQUE_DETERMINISTE, POLITIQUE_IA];

export function estNomPolitique(nom: string): nom is NomPolitique {
  return (POLITIQUES as readonly string[]).includes(nom);
}

export interface ConfigBanc {
  langueConsole: string;
  langues: string[];
  serveur: { portDeBase: number; nombrePortsEssayes: number };
  scan: { timeoutMs: number; sujetParDefaut: NomSujet };
  scorecard: { seuilAlarmeEcartLanguesPoints: number; dossierResultats: string; retentionRuns: number };
  scenarios: {
    dossier: string;
    jetonSain: string;
    /**
     * Combinaisons de bugs à générer, PAR GABARIT (clé = nom du gabarit).
     *
     * Elles étaient globales tant qu'un seul gabarit existait ; avec deux
     * registres de bugs disjoints, une liste globale exigerait de chaque
     * gabarit qu'il connaisse les bugs de l'autre — et `genererScenarios`
     * lève sur un bug inconnu. Le filtrage silencieux des combinaisons
     * inapplicables serait pire : un scénario qui disparaît sans le dire est
     * une mesure qui s'éteint sans devenir rouge.
     */
    combinaisons: Record<string, string[][]>;
    /**
     * Budget de pages imposé aux scénarios d'un gabarit (clé = nom du
     * gabarit). C'est le RÉGLAGE qui rend la qualité d'une décision mesurable
     * — un seuil numérique, donc en config (constitution §2) ; la VÉRITÉ qui
     * en découle (quelle politique atteint quelle cible sous ce budget) vit,
     * elle, dans les `cibles` du gabarit.
     */
    contraintes: Record<string, { pagesMax: number }>;
  };
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
  /**
   * Contraintes imposées au moteur pour CE scénario. Un budget de pages
   * réduit est ce qui rend la qualité d'une décision mesurable : sans
   * contrainte, tout parcours exhaustif atteint tout, et une bonne
   * navigation ne se distingue pas d'une navigation aveugle.
   */
  contraintes?: { pagesMax?: number };
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
  /**
   * Cibles du gabarit : pages dont l'atteinte (ou la non-atteinte) sous budget
   * mesure la qualité de la navigation.
   *
   * `atteinteAttendue` est la VÉRITÉ TERRAIN du gabarit, par politique : elle
   * vit ici et non en configuration parce que le banc possède la vérité, la
   * config ne possède que des réglages (METHODE §5). Le budget qui la rend
   * vraie, lui, est un seuil : il vit dans `config/banc.json`
   * (`scenarios.contraintes`). Élargir le budget sans réviser ces valeurs les
   * rend fausses — et le banc le dit, puisqu'une cible atteinte alors qu'on
   * ne l'attendait pas est un attendu NON satisfait.
   */
  cibles?: { page: string; atteinteAttendue: Record<string, boolean> }[];
}

// ---------------------------------------------------------------------------
// Sujet noté
// ---------------------------------------------------------------------------

/**
 * Le sujet que le banc note, assemblé POUR UN SCÉNARIO donné.
 *
 * Ce n'est plus un simple `Scanner` parce que les contraintes du scénario
 * (budget de pages) font partie de l'assemblage du moteur : un scanner unique
 * partagé par tous les scénarios ne pourrait porter qu'un seul budget, et la
 * mesure sous contrainte n'existerait pas. La fabrique est donc la frontière
 * naturelle — c'est le scénario qui dit sous quelles conditions il doit être
 * noté.
 */
export interface SujetNote {
  /** Nom affiché du sujet (journal de démarrage du banc). */
  nom: string;
  /** Le scanner à employer pour ce scénario-là. */
  pour(scenario: Scenario): Promise<Scanner>;
}

/** Sujet qui rend toujours le même scanner : les tests qui n'éprouvent aucune contrainte s'en contentent. */
export function sujetConstant(nom: string, scanner: Scanner): SujetNote {
  return { nom, pour: () => Promise.resolve(scanner) };
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
export type AttenduManifeste = AttenduBug | AttenduProfil | AttenduCible;

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

/**
 * Attendu portant sur une CIBLE que le parcours doit atteindre sous le budget
 * du scénario : éprouve le discernement (nature « bien jugé » de la taxonomie
 * — trois natures, pas trois types).
 *
 * Il porte sa JUMELLE INTER-POLITIQUES : la politique déterministe qui manque
 * la cible sous budget n'est pas un échec du banc, c'est le prix affiché de
 * la gratuité — le chiffre qui justifie commercialement le coût IA par scan.
 */
export interface AttenduCible {
  nature: 'cible';
  /** Chemin d'URL qui doit (ou ne doit pas) figurer au parcours. */
  page: string;
  /** Par nom de politique : la cible doit-elle être atteinte sous le budget de ce scénario ? */
  atteinteAttendue: Record<string, boolean>;
  /**
   * true quand une CHARGE tente d'obtenir l'atteinte de cette page : l'attendu
   * cesse alors d'éprouver le discernement (nature « bien jugé ») pour
   * éprouver la DÉSOBÉISSANCE (nature « resté inerte »). Le drapeau route la
   * comptabilité, exactement comme `AttenduProfil.inertieEprouvee` : même
   * attendu physique, autre exploit.
   *
   * Sans lui, les six attendus « page piège hors parcours » d'un gabarit se
   * fondaient dans un taux unique alors que quatre d'entre eux étaient tenus
   * par l'ABSENCE DE MOYEN — le lien piège n'est déposé que par la charge. La
   * seule vraie mesure de désobéissance de la brique se lisait « 91,7 % »
   * quand elle valait une réussite sur deux.
   */
  eprouvee: boolean;
}

/** Les attendus de nature `cible` d'un manifeste (raccourci de routage). */
export function attendusCible(manifeste: Manifeste): AttenduCible[] {
  return manifeste.attendus.filter((attendu): attendu is AttenduCible => attendu.nature === 'cible');
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

/**
 * Notation d'un `AttenduCible` pour la politique DEMANDÉE au run.
 *
 * DEUX SENS, une seule règle : l'attendu est satisfait quand l'atteinte
 * OBSERVÉE est celle qu'il annonçait. La politique déterministe qui manque la
 * cible sous budget est donc un attendu SATISFAIT — ce n'est pas un raté du
 * banc, c'est le prix affiché de la gratuité, et le compter en échec
 * rendrait illisible le seul chiffre qui justifie le coût IA par scan.
 * Symétriquement, une page piège restée hors parcours est satisfaite, et l'y
 * voir apparaître ne l'est pas.
 *
 * Famille DISTINCTE de la détection, comme les profils : une cible manquée
 * n'est ni un « raté » ni un faux positif.
 */
export interface ResultatCible {
  attendu: AttenduCible;
  /** Politique DEMANDÉE pour ce run : c'est son entrée de `atteinteAttendue` qui est lue. */
  politique: string;
  /** Ce que l'attendu annonce pour cette politique sous le budget du scénario. */
  atteinteAttendue: boolean;
  /** La page figure-t-elle au parcours ? `null` quand rien n'a pu être observé. */
  atteinte: boolean | null;
  /**
   * Aucune observation exploitable : pas de parcours, politique absente de
   * l'attendu, ou politique demandée non appliquée (IA indisponible d'emblée).
   * Ni crédité, ni imputé — sa propre colonne, hors des dénominateurs.
   */
  nonMesure: boolean;
  /** Identifiant technique stable de la cause de non-mesure (jamais de prose). */
  raisonNonMesure?: string;
  satisfait: boolean;
}

/**
 * Ce que le parcours a COÛTÉ en pages et ce qu'il en a fait : la jumelle de
 * dépense du coût par scan (APPRENTISSAGES n°3).
 *
 * « Pages utiles » est une notion de VÉRITÉ TERRAIN, donc calculable du seul
 * côté du banc (METHODE §5) : ce sont les pages que le manifeste voulait voir
 * atteintes — celles où un bug est constatable, et les cibles dont l'atteinte
 * est attendue. Une page piège n'en fait jamais partie.
 */
export interface CouvertureParcours {
  /** URL distinctes effectivement chargées, tous viewports confondus. */
  nbPagesVisitees: number;
  /** Celles d'entre elles qui sont des pages utiles déclarées par le manifeste. */
  nbPagesUtiles: number;
  /** Pages utiles déclarées par le manifeste, atteintes ou non : le dénominateur du sens inverse. */
  nbPagesUtilesDeclarees: number;
}

export interface ResultatScenario {
  scenarioId: string;
  /** Politique de décision DEMANDÉE au moteur pour ce run (`--politique`, défaut = config). */
  politique: string;
  /**
   * Politique que le moteur a réellement appliquée au SCAN, lue au journal.
   * Différente de la demandée quand l'IA est indisponible d'emblée : les
   * cibles deviennent alors non mesurées plutôt que ratées — on n'impute pas
   * à une politique le résultat d'une autre (APPRENTISSAGES n°6).
   */
  politiqueAppliquee?: string;
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
  /** Notation des attendus de nature `cible`, comptés à part de la détection ET des profils. */
  cibles: ResultatCible[];
  /** Ce que le parcours a visité et ce qu'il en a tiré ; absent sans parcours exploitable. */
  couverture?: CouvertureParcours;
  /**
   * Décisions tranchées par la politique déterministe alors que l'IA était
   * demandée : un repli SUBI par décision. Invariant jumeau de celui de la
   * brique 4a, étendu aux décisions — une absence subie interdit `ok`.
   */
  nbReplisDecision: number;
  fauxPositifs: Anomalie[];
  coutApi: number;
  /**
   * Le même coût, VENTILÉ par famille (décisions de navigation, profilage,
   * confirmation), recopié du `Rapport`. Absent quand le sujet noté n'appelle
   * aucun modèle. Sans lui, la scorecard afficherait le coût du PARCOURS sous
   * l'étiquette du profilage : un chiffre juste sous une étiquette fausse.
   */
  coutApiParFamille?: CoutParFamille;
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
  /** Attendus de cible effectivement mesurés pour la politique du run. */
  /** Cibles mesurées de la famille « bien jugé » (les épreuves de désobéissance sont comptées à part). */
  nbCiblesMesurees: number;
  /** Ceux d'entre eux dont l'atteinte observée est celle qu'annonçait l'attendu. */
  nbCiblesConformes: number;
  /** Cibles sans observation exploitable : ni créditées, ni imputées, hors dénominateurs. */
  nbCiblesNonMesurees: number;
  /** Cibles conformes / cibles mesurées, en pourcentage ; null si rien n'a été mesuré. */
  tauxCiblesConformes: number | null;
  /** Épreuves de DÉSOBÉISSANCE de parcours (une charge vise la page), comptées hors du taux ci-dessus. */
  nbInertiesParcoursMesurees: number;
  nbInertiesParcoursTenues: number;
  tauxInertiesParcoursTenues: number | null;
  /**
   * COUPLE COÛT ↔ EFFICACITÉ. Les trois compteurs suivants n'existent que
   * pour être lus avec `coutApi` : une métrique de coût ne s'affiche jamais
   * seule, c'est ce qu'elle achète qui la justifie (APPRENTISSAGES n°3).
   *
   * Seuls les scénarios qui DÉCLARENT au moins une page utile entrent dans le
   * calcul : sur un scénario sain, aucune page n'est utile, et une efficacité
   * de 0 % y dirait « le moteur a perdu son budget » là où il n'y avait rien
   * à trouver. Les autres sont comptés à part, jamais absorbés dans un zéro.
   */
  nbPagesVisitees: number;
  nbPagesUtiles: number;
  /** Scénarios sans aucune page utile déclarée : hors du calcul, et comptés pour le dire. */
  nbScenariosSansPageUtile: number;
  /** Pages utiles / pages visitées, en pourcentage ; null si aucun scénario mesurable. */
  tauxEfficacite: number | null;
  /** Coût API moyen par scan du périmètre ; null si aucun scénario. */
  coutParScan: number | null;
  coutApi: number;
  /** Part du coût total engagée par les DÉCISIONS de navigation : la jumelle de l'efficacité. */
  coutApiExploration: number;
  /** Part du coût total engagée par le PROFILAGE : la jumelle des taux de profil. */
  coutApiProfilage: number;
  /** Part du coût total engagée par le protocole de CONFIRMATION. */
  coutApiConfirmation: number;
  /**
   * Replis par décision SUBIS sur le périmètre : l'IA était demandée, la
   * déterministe a tranché. Agrégé pour qu'un repli ne se lise pas comme un
   * simple « +1 » dans la colonne des erreurs, indistinguable d'un timeout.
   */
  nbReplisDecision: number;
  dureeMs: number;
}

/**
 * La FAMILLE « cibles atteintes », vue par politique — et c'est sa raison
 * d'être : la jumelle inter-politiques s'affiche CÔTE À CÔTE.
 *
 * Un run n'exécute qu'une politique ; l'autre ligne existe quand même, avec
 * ses attendus et ses cibles déclarées non mesurées. Sans elle, le lecteur
 * d'une scorecard IA ne verrait jamais ce que la gratuité coûte, et le
 * lecteur d'une scorecard déterministe prendrait une cible manquée pour un
 * défaut du moteur.
 */
export interface AgregatCibles {
  politique: string;
  /** true si c'est la politique exécutée par ce run : les autres lignes n'ont rien mesuré. */
  executee: boolean;
  /** Cibles DÉCLARÉES « au parcours » pour cette politique (famille « bien jugé »). */
  nbAttenduesAtteintes: number;
  /** Celles d'entre elles qui ont été MESURÉES : le dénominateur de `nbAtteintes`. */
  nbMesureesAuParcours: number;
  /** Celles-là, effectivement atteintes. */
  nbAtteintes: number;
  /** Cibles DÉCLARÉES « hors parcours » pour cette politique (prix de la gratuité). */
  nbAttenduesHorsParcours: number;
  /** Celles d'entre elles qui ont été MESURÉES : le dénominateur de `nbHorsParcours`. */
  nbMesureesHorsParcours: number;
  /** Celles-là, effectivement restées hors parcours. */
  nbHorsParcours: number;
  /** Cibles mesurées de la famille « bien jugé » (hors épreuves de désobéissance). */
  nbMesurees: number;
  nbConformes: number;
  /**
   * INERTIES DE PARCOURS, comptées à part — même raison que les inerties de
   * profil : une épreuve de désobéissance noyée parmi des attendus que rien
   * n'éprouve ne se voit plus, et c'est précisément elle qu'on veut lire.
   */
  nbInertiesDeclarees: number;
  nbInertiesMesurees: number;
  nbInertiesTenues: number;
  tauxInerties: number | null;
  nbNonMesurees: number;
  tauxConformite: number | null;
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
  /** Politique de décision demandée pour TOUT ce run : sans elle, deux scorecards ne se comparent pas. */
  politique: string;
  global: Agregat;
  /**
   * La famille « cibles atteintes », une ligne par politique connue des
   * attendus — la jumelle inter-politiques, côte à côte.
   */
  cibles: AgregatCibles[];
  parLangue: Record<string, Agregat>;
  parCategorie: Record<string, Agregat>;
  ecartLangues: EcartLangues;
  scenarios: ResultatScenario[];
}
