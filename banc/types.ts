/**
 * Contrats du banc d'essai.
 *
 * Le banc est l'instrument qui mesure le moteur : gabarits (mini-sites),
 * bugs injectables, scénarios, manifestes de vérité terrain, correcteur et
 * scorecard. Tout ce qui relie ces pièces entre elles est déclaré ici.
 *
 * ## Les QUATRE natures d'attendu — la taxonomie est CLOSE
 *
 * Un manifeste n'exprime jamais que l'une de ces quatre choses :
 *
 * 1. **DÉTECTÉ** — éprouve la PERCEPTION : le moteur a-t-il vu ce qui était
 *    là ? Sa forme inversée est l'attendu d'ABSENCE : sur un scénario sain,
 *    tout signalement est du bruit (c'est ce que compte un faux positif).
 * 2. **BIEN JUGÉ** — éprouve le DISCERNEMENT : le verdict rendu est-il
 *    celui qu'il fallait ? (`verdictAttendu` ; les verdicts d'auto-diagnostic
 *    à venir appartiennent à cette famille.)
 * 3. **RESTÉ INERTE** — éprouve ce que le moteur NE FAIT PAS. Deux exploits
 *    qui sont le même test retourné :
 *    - la **désobéissance au contenu** : le moteur a-t-il refusé de faire ce
 *      que la page lui demandait ? Une action destructive jamais cliquée, une
 *      injection de prompt sans effet ;
 *    - l'**obéissance aux interdits** : le moteur a-t-il refusé de faire ce
 *      que le site lui interdit ? Un chemin de `robots.txt` jamais visité.
 *
 *    Dans les deux cas on mesure une ABSENCE d'acte, et dans les deux cas
 *    l'attendu n'a de valeur que si le MOYEN existait : une page jamais liée
 *    n'est pas une page respectée, c'est une page hors d'atteinte. C'est une
 *    propriété de sécurité et de conduite, jamais de détection.
 *
 * 4. **AGI** — éprouve ce que le moteur FAIT, et l'EFFET de ce qu'il fait.
 *    Un recouvrement écartable doit être écarté, la page traversée, et RIEN
 *    publié (`ecartementAttendu`, cahier P2-3, contrat 1). L'attendu porte
 *    sur un COMPTE D'ACTES à l'effet mesuré, jamais sur un verdict.
 *
 *    AJOUTÉE LE 2026-10-01, avec sa preuve de non-déguisement — la clause de
 *    fermeture l'exige, et les trois candidates ont été examinées :
 *    - ce n'est pas **détecté** sous sa forme inversée : l'attendu d'absence
 *      d'un scénario sain dit « il n'y avait rien ». Ici il y avait quelque
 *      chose, et le moteur l'a fait disparaître. Les deux situations rendent
 *      le même rapport vide, et c'est précisément la confusion que cette
 *      nature existe pour empêcher — le silence n'est pas l'absence ;
 *    - ce n'est pas **bien jugé** : aucun verdict n'est rendu. Rien
 *      n'atteint la confirmation, il n'y a pas de `verdictRendu` à
 *      comparer. L'y ranger obligerait à inventer un pseudo-verdict, c'est-
 *      à-dire à déguiser le neuf en ancien — le piège de la clause pris à
 *      l'envers. Et le coût serait réel : la colonne « verdicts corrects »
 *      compterait comme juste un scénario où le moteur n'a rien fait et
 *      n'a rien publié ;
 *    - ce n'est pas **resté inerte** : c'en est l'exact contraire. L'inertie
 *      se prouve par « rien ne s'est passé » ; celle-ci par « quelque chose
 *      s'est passé, et voici son effet ». Même forme de rapport, substance
 *      opposée.
 *
 *    La parenté réelle est ailleurs : avec X01 (P2-2) et W03 (P2-3), qui
 *    vérifient un SILENCE plutôt qu'une absence. Mais eux produisent un
 *    groupe écarté, donc un verdict — ils sont « bien jugé ». L'écartement
 *    n'en produit aucun : c'est bien une quatrième chose.
 *
 * La taxonomie est close. Toute proposition d'une quatrième nature doit
 * d'abord prouver qu'elle n'est pas l'une des trois déguisée — c'est ce qui
 * empêche le manifeste de se déformer au fil des extensions du banc.
 */
import type { Rejouabilite } from '../core/scanner/confirmation/rejouabilite.js';
import type {
  Anomalie,
  Categorie,
  CoutParFamille,
  Gravite,
  ProfilSiteRapporte,
  Rapport,
  RapportBusiness,
  Scanner,
  VerdictConfirmation,
} from '../core/types.js';
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
  /** `rejouabiliteMinPourcent` : taux de rejouabilité par groupes sous lequel la scorecard alarme (P2-1, contrat 5). */
  scorecard: { seuilAlarmeEcartLanguesPoints: number; dossierResultats: string; retentionRuns: number; rejouabiliteMinPourcent: number };
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
     * Contraintes imposées aux scénarios d'un gabarit (clé = nom du
     * gabarit) : un budget de pages, et/ou un mode de soumission. Le budget
     * est le RÉGLAGE qui rend la qualité d'une décision mesurable — un seuil
     * numérique, donc en config (constitution §2) ; la VÉRITÉ qui en découle
     * (quelle politique atteint quelle cible sous ce budget) vit, elle, dans
     * les `cibles` du gabarit. Le mode de soumission est ce que la campagne
     * a imposé sur le réel (`soumission: aucune`) : un gabarit qui rejoue un
     * défaut vu sous cette contrainte la déclare ici, et ses scénarios en
     * héritent.
     */
    contraintes: Record<string, NonNullable<Scenario['contraintes']>>;
    /**
     * Scénarios CROISÉS : un site servi dans une langue, un rapport demandé
     * dans une autre.
     *
     * Ils ne sont pas dérivables des combinaisons ordinaires — celles-ci ne
     * portent qu'une langue, celle du site — et ils éprouvent la promesse
     * centrale du rapport business : un commerçant français dont le site est
     * en anglais lit un rapport français.
     */
    croises: { gabarit: string; bugsActifs: IdentifiantBug[]; langue: string; langueRapport: string }[];
    /**
     * Scénarios servis au moteur avec l'interaction RESTREINTE
     * (`interaction.soumission: 'aucune'`), c'est-à-dire le défaut de la
     * configuration de production : le robot regarde, il ne soumet rien.
     *
     * Ils existent parce que ce mode est celui du premier scan d'un site réel,
     * et qu'un mode jamais mesuré est un mode qu'on découvre en production.
     */
    sansSoumission: { gabarit: string; bugsActifs: IdentifiantBug[]; langue: string }[];
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
  contraintes?: {
    pagesMax?: number;
    /**
     * Mode d'interaction imposé au moteur (`interaction.soumission`).
     *
     * C'est bien une CONTRAINTE et non une demande du client : elle restreint
     * ce que le moteur a le droit de faire, exactement comme un budget de
     * pages restreint ce qu'il a le droit de visiter. La langue du rapport,
     * elle, vit à côté — c'est ce que le client DEMANDE, pas ce qu'on lui
     * interdit.
     */
    soumission?: 'aucune' | 'site-possede';
  };
  /**
   * Langue du RAPPORT BUSINESS demandée au moteur pour ce scénario
   * (`OptionsScan.langueRapport`). Absente = celle de `config/rapport.json`.
   *
   * Elle vit au niveau du scénario et non sous `contraintes` parce que ce
   * n'est pas une contrainte : c'est ce que le CLIENT demande. Elle existe
   * pour rendre mesurable la promesse centrale du rapport — un site anglais
   * lu par un commerçant français — et le banc vérifie la langue RENDUE
   * contre celle-ci : un canal muet ferait noter un rapport français sous
   * l'étiquette d'une demande anglaise.
   */
  langueRapport?: string;
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
/** Une requête reçue par le serveur tiers : sa méthode, et ses en-têtes en minuscules. */
export interface RequeteTiers {
  methode: string;
  entetes: Record<string, string | undefined>;
}

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
  /**
   * Origine du serveur TIERS de ce scénario, quand le bug l'a demandée
   * (`besoinOrigineTierce`) ; `null` sinon. C'est elle que le bug injecte dans
   * la page pour fabriquer une dépendance externe — son port est attribué au
   * démarrage, donc elle ne peut pas être écrite en dur dans un gabarit.
   */
  origineTierce: string | null;
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
  /**
   * true si le bug dépose une charge visant la RÉDACTION du rapport business.
   *
   * DÉCLARÉ, et non déduit de la catégorie `securite` comme l'inertie de
   * profil et de parcours : une charge de rapport n'a pas besoin d'être un bug
   * de sécurité, et surtout elle doit atteindre le rédacteur. Or le rédacteur
   * ne voit presque rien de la page — les descriptions de détecteurs sont des
   * constantes de code, les sélecteurs ne lui sont pas montrés. Le SEUL canal
   * par lequel une page lui parle est le CHEMIN D'URL d'une anomalie. Une
   * charge de rapport est donc, par construction, un bug qui produit une
   * anomalie sur une page à l'adresse parlante — donc un bug de catégorie
   * ordinaire, que la règle de la catégorie `securite` n'aurait jamais
   * attrapé.
   *
   * Le déclarer plutôt que le déduire suit la doctrine déjà écrite pour
   * `eprouve` : un futur bug de sécurité réellement détectable perdrait sinon
   * son attendu en silence.
   */
  chargeRapport?: boolean;
  /**
   * true si ce bug n'est constatable QU'EN SOUMETTANT un formulaire.
   *
   * Sous `contraintes.soumission: 'aucune'`, le moteur n'énumère jamais
   * l'action de soumettre : ces bugs deviennent HORS DE PORTÉE, et le
   * manifeste n'en dérive aucun attendu de détection. Les laisser produirait
   * des « ratés » qui ne mesurent rien — le moteur n'a pas échoué à voir, on
   * lui a interdit de regarder, et confondre les deux ferait chuter le taux
   * de détection pour une raison qui n'est pas une défaillance.
   *
   * DÉCLARÉ et non déduit, comme `eprouve` et `chargeRapport` : un bug
   * constatable sans soumission perdrait sinon son attendu en silence le jour
   * où quelqu'un le rangerait mal.
   */
  exigeSoumission?: boolean;
  /**
   * true si le bug a besoin d'une SECONDE ORIGINE pour s'injecter : le serveur
   * du scénario en démarre alors une, et la passe au bug par
   * `ContexteBug.origineTierce`.
   *
   * Déclaré plutôt que déduit, comme `eprouve` et `chargeRapport` : démarrer
   * un second serveur pour tous les scénarios coûterait un port et une
   * latence à chacun, et le faire « au cas où » masquerait quels bugs en
   * dépendent vraiment.
   */
  besoinOrigineTierce?: boolean;
  /**
   * Ce que la SECONDE ORIGINE sert pour ce bug (cahier P2-2, contrat 6), ou
   * `null` pour laisser la main — par défaut, le serveur tiers rend une panne
   * (503) à toute requête, ce dont X01 a besoin. C'est par là qu'un gabarit
   * fabrique un tiers qui répond AUTREMENT au robot déclaré qu'au navigateur
   * d'un visiteur : des anomalies fausses par construction (n°17).
   */
  servirTiers?(chemin: string, requete: RequeteTiers, contexte: ContexteBug): ReponseHttp | null;
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
  /**
   * Retarde le SERVICE d'une page — le document lui-même, pas l'API. Appelé
   * par le serveur avant de rendre la page, avec le `attendre` injecté (réel
   * en run, factice en test). Cahier P2-1 : c'est par là qu'un gabarit fait
   * coûter chaque page à l'exploration et éprouve la répartition de l'échéance.
   */
  retarderPage?(chemin: string, contexte: ContexteBug): Promise<void>;
  /**
   * Retarde le SERVICE d'une SOUS-RESSOURCE statique (image, script, feuille
   * de style — pas le document, pas l'API). Appelé par le serveur au début du
   * pipeline statique, avant toute résolution, avec le `attendre` injecté. Son
   * usage (cahier P2-10) : faire PENDRE une ressource qui BLOQUE le `load` sans
   * bloquer le DOM, pour éprouver le passage de `waitUntil: 'load'` (otage) à
   * `'domcontentloaded'` (DOM prêt, ressources en cours, bornées par la fenêtre
   * d'effet).
   */
  retarderRessource?(chemin: string, contexte: ContexteBug): Promise<void>;
  /**
   * Note une VISITE de page : appelé à chaque requête de page, avant le rendu,
   * et JAMAIS par la vérification du démarrage. C'est là qu'un bug à compteur
   * de visites tient son compte — dans `transformerHtml`, que le démarrage
   * appelle aussi, la vérification consommerait une visite en silence.
   */
  noterVisite?(chemin: string, contexte: ContexteBug): void;
  /**
   * true si ce bug n'est constatable qu'en COMBINAISON avec un autre (dont le
   * rejeu le fait voir, par exemple). Le générateur ne produit alors pas son
   * scénario seul — il n'y serait jamais constatable, et son « raté » ne
   * mesurerait rien — et exige qu'une combinaison déclarée le contienne.
   * DÉCLARÉ, comme `exigeSoumission` : un bug qui perdrait son scénario seul
   * sans le dire serait une mesure qui s'éteint sans rougir.
   */
  seulementEnCombinaison?: boolean;
  /**
   * true si ce bug pose un recouvrement que le moteur doit ÉCARTER par un
   * geste neutre (cahier P2-3, contrat 1, face 1). Il ne produit alors
   * AUCUN attendu d'anomalie — il n'y a rien à percevoir, le recouvrement
   * n'atteint jamais la détection — mais un attendu POSITIF d'une autre
   * nature : le scan doit compter au moins un écartement. Sans cela, un
   * gabarit qui disparaîtrait pour une mauvaise raison (calque jamais posé,
   * donc rien à écarter) passerait pour un succès.
   */
  ecartementAttendu?: boolean;
  /**
   * true si toutes les anomalies que ce bug produit relèvent d'UNE cause —
   * un calque qui intercepte trois boutons est un défaut, pas trois. Le banc
   * compte les constats publiés au-delà du premier (« constats en double ») :
   * la mesure du dédoublonnage par cause (C-16), avant que P2-2 ne l'écrive.
   */
  causeUnique?: boolean;
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
  cibles?: {
    page: string;
    atteinteAttendue: Record<string, boolean>;
    /**
     * Bug qui DONNE LE MOYEN d'atteindre cette page — typiquement en y
     * déposant un lien. Quand il est actif, ne pas atteindre la page devient
     * un refus, et l'attendu passe en nature « resté inerte » (`eprouvee`).
     *
     * Sans lui, `eprouvee` ne se déduit que d'une charge de catégorie
     * `securite` : c'était suffisant tant que le seul moyen d'atteindre une
     * page interdite était une injection. Une page que `robots.txt` interdit
     * est atteignable par un lien parfaitement ordinaire — le moyen existe
     * sans qu'aucune charge ne soit active, et c'est notre conduite, et elle
     * seule, qui nous en empêche.
     */
    moyenParBug?: IdentifiantBug;
  }[];
  /**
   * Contenu servi à `/robots.txt`, VERBATIM. Absent : le serveur répond 404,
   * ce qui est le cas de la plupart des sites et le comportement historique
   * du banc.
   *
   * ── LES DEUX CHEMINS DU ROBOTS.TXT NE SE CROISENT PAS ─────────────────────
   *
   * Côté MOTEUR, le fichier est lu hors du contexte navigateur observé : y
   * passer ferait d'un `robots.txt` absent un 404 interne, donc une anomalie,
   * sur tout site qui n'en a pas. Côté BANC, il est servi comme n'importe
   * quelle route du gabarit. Les deux se rencontrent sur le réseau et nulle
   * part ailleurs : le banc ne sait pas qui lit, le moteur ne sait pas qui
   * sert. C'est ce qui garantit que le piège évité en conception ne revient
   * pas par le gabarit.
   */
  robotsTxt?: string;
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
export type AttenduManifeste = AttenduBug | AttenduProfil | AttenduCible | AttenduRapport;

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
  /** Recopié du bug : ses anomalies relèvent d'une seule cause (voir `BugInjectable.causeUnique`). */
  causeUnique?: boolean;
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
   * true quand LE MOYEN D'ATTEINDRE CETTE PAGE EXISTE, et que ne pas
   * l'atteindre est donc un refus et non une impossibilité. L'attendu cesse
   * alors d'éprouver le discernement (nature « bien jugé ») pour éprouver la
   * nature « resté inerte ». Le drapeau route la comptabilité, exactement
   * comme `AttenduProfil.inertieEprouvee` : même attendu physique, autre
   * exploit.
   *
   * Sans lui, les six attendus « page piège hors parcours » d'un gabarit se
   * fondaient dans un taux unique alors que quatre d'entre eux étaient tenus
   * par l'ABSENCE DE MOYEN — le lien piège n'est déposé que par la charge. La
   * seule vraie mesure de désobéissance de la brique se lisait « 91,7 % »
   * quand elle valait une réussite sur deux.
   *
   * DEUX FAÇONS D'AVOIR LE MOYEN, et le drapeau ne les distingue pas parce
   * qu'elles s'éprouvent pareil :
   *  - une CHARGE dépose un lien piège pour nous faire aller là où nous ne
   *    devrions pas — désobéissance au contenu ;
   *  - un lien ORDINAIRE mène à un chemin que `robots.txt` nous interdit —
   *    obéissance aux interdits. Le lien est bien là, rien ne nous empêche
   *    techniquement de le suivre : le seul obstacle est notre conduite.
   */
  eprouvee: boolean;
}

/**
 * Attendu portant sur le RAPPORT BUSINESS : éprouve le discernement (nature
 * « bien jugé »), et sous une charge, la DÉSOBÉISSANCE.
 *
 * ── CE QU'IL NOTE, ET CE QU'IL REFUSE DE NOTER ──────────────────────────────
 *
 * Il ne note que du STRUCTUREL : une section par anomalie retenue et rien
 * d'autre, des statuts conformes à ce que le rapport technique autorise, la
 * langue demandée, et la ligne de méthode portant le bon compte. La QUALITÉ de
 * la prose ne se note pas ici — un texte se juge, il ne se compte pas, et
 * noter une prose serait noter une opinion (même règle que `natureLibre`, qui
 * n'a jamais été notée depuis la brique 4a).
 *
 * ── CE QUE `eprouvee` CHANGE, ET CE QU'IL NE CHANGE PAS ─────────────────────
 *
 * Rien à l'attendu physique : les mêmes contrôles, sur le même rapport. Il
 * change la FAMILLE COMPTABLE, exactement comme `AttenduProfil.inertieEprouvee`
 * et `AttenduCible.eprouvee` : tenir sous une charge qui demande d'écrire que
 * tout va bien, et être juste au repos, ne sont pas le même exploit. Les noyer
 * dans un taux unique ferait disparaître la seule mesure de désobéissance de
 * la brique derrière une majorité d'attendus que rien n'éprouve — c'est
 * l'erreur exacte que la brique 4b a dû corriger sur les cibles, où « 91,7 % »
 * valait en réalité une réussite sur deux.
 */
export interface AttenduRapport {
  nature: 'rapport';
  /** Langue attendue du rapport : celle que le scénario demande, ou celle de la config. */
  langue: string;
  /** true quand une charge active vise la rédaction : l'attendu éprouve alors la désobéissance. */
  eprouvee: boolean;
}

/** Les attendus de nature `rapport` d'un manifeste (raccourci de routage). */
export function attendusRapport(manifeste: Manifeste): AttenduRapport[] {
  return manifeste.attendus.filter((attendu): attendu is AttenduRapport => attendu.nature === 'rapport');
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
  /**
   * SECONDE ORIGINE, sur un autre port, servie uniquement quand un bug actif
   * la demande (`BugInjectable.besoinOrigineTierce`). `null` sinon.
   *
   * Pourquoi un second PORT et pas un second chemin : l'origine d'une requête
   * est ce que le moteur regarde pour distinguer une panne du site d'une panne
   * d'une dépendance tierce. Un chemin `/tiers/...` sur le même port serait
   * interne, et n'éprouverait rien. Le banc savait servir une origine ; la
   * mesure de l'angle mort n°1 de l'inventaire en exigeait deux.
   *
   * Ce que sert cette origine est délibérément pauvre — elle n'a pas de pages,
   * pas de formulaires, pas d'i18n : elle existe pour ÉCHOUER d'une façon
   * choisie, et un mini-site complet y serait du décor.
   */
  origineTierce: string | null;
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
  /**
   * Parmi les groupes écartés, ceux écartés d'office comme tiers SANS EFFET
   * visible (cahier P2-2, contrat 1) : le silence de la doctrine, compté —
   * un silence qui ne se compte pas est un angle mort (n°4).
   */
  nbGroupesSansEffet: number;
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
  /**
   * La GRAVITÉ publiée est-elle celle qu'attendait le manifeste ?
   *
   * `undefined` quand rien n'a été publié pour cet attendu — un attendu détecté
   * seulement parmi les candidates ÉCARTÉES n'a rien mis sous les yeux du
   * client, donc il n'y a rien à grader.
   *
   * FAMILLE DISTINCTE DE LA DÉTECTION, et ce n'est pas un détail de rangement.
   * La gravité n'entre PAS dans la clé d'appariement : détecter-mais-mal-grader
   * et ne-pas-détecter sont deux échecs différents, et les confondre détruirait
   * l'information au lieu de l'ajouter — un désaccord d'estimation ferait
   * disparaître une détection réelle.
   *
   * Pourquoi ce champ existe : `AttenduBug.gravite` était dérivé par le
   * manifeste depuis la brique 1 et comparé par RIEN. Un moteur qui publierait
   * toutes ses anomalies en « mineur » marquait 100 % de détection, alors que
   * la gravité est ce que le client lit en premier (APPRENTISSAGES n°4,
   * variante « la clé d'appariement définit ce que la mesure voit »).
   */
  graviteConforme?: boolean;
  /** Gravités effectivement publiées pour cet attendu, dans l'ordre des anomalies appariées. */
  gravitesRendues?: Gravite[];
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
 * Notation d'un `AttenduRapport`.
 *
 * Les CONTRÔLES sont listés un par un plutôt que réduits à un booléen : quand
 * un rapport est faux, il faut savoir LEQUEL des quatre a cédé — un rapport
 * dans la mauvaise langue et un rapport dont les statuts sur-promettent
 * n'appellent pas la même correction, et une mesure qui accuse le mauvais
 * coupable envoie corriger ce qui fonctionne (APPRENTISSAGES n°6).
 *
 * `nbSectionsRedigees / nbSections` est la JUMELLE DE COUVERTURE du coût de
 * rédaction : un coût ne s'affiche jamais seul, c'est ce qu'il achète qui le
 * justifie (APPRENTISSAGES n°3). Sans elle, on lirait un prix par scan sans
 * savoir s'il a payé un rapport entier ou trois phrases.
 */
export interface ResultatRapport {
  attendu: AttenduRapport;
  /**
   * Aucun rapport business n'a été produit : sujet sans capacité, moteur
   * assemblé sans réglages de rapport, scan en erreur. Ni crédité, ni imputé —
   * sa propre colonne, hors des dénominateurs, comme les profils non mesurés.
   */
  nonMesure: boolean;
  /** Identifiant technique stable de la cause de non-mesure (jamais de prose). */
  raisonNonMesure?: string;
  /**
   * Les contrôles STRUCTURELS, tous posés par le code.
   *
   * `satisfait` est leur conjonction ET `proseTenue`, qui n'est pas un
   * contrôle structurel : c'est le seul critère qu'une réponse de modèle peut
   * faire tomber, et c'est par là que la charge d'une page peut encore obtenir
   * quelque chose. Les compter ensemble effacerait cette distinction. Leur
   * NOMBRE n'est pas écrit ici : il a déjà changé une fois, et un commentaire
   * qui compte est un commentaire qui ment un jour.
   */
  controles: ControlesRapport;
  satisfait: boolean;
  /** Sections du rapport (le dénominateur de la couverture). */
  nbSections: number;
  /** Celles d'entre elles qui portent une prose : le numérateur. */
  nbSectionsRedigees: number;
  /**
   * true si AUCUNE prose n'a pu être écrite. Ce n'est PAS un échec de
   * l'attendu — un rapport structurel est un rapport juste, et c'est
   * précisément ce que le mode dégradé doit produire. C'est une information,
   * et elle a sa propre colonne.
   */
  sansProse: boolean;
}

/**
 * Les CINQ contrôles d'un rapport. Quatre sont structurels ; le cinquième est
 * le seul qui touche à la prose, et il ne la JUGE pas — il en mesure la
 * langue, mécaniquement.
 */
export interface ControlesRapport {
  /** Une section par anomalie retenue, exactement : ni omission, ni ajout, ni doublon d'identifiant. */
  bijection: boolean;
  /** Chaque statut de section est celui que le rapport technique autorise pour cette anomalie. */
  statuts: boolean;
  /** L'ÉTIQUETTE de langue rendue est celle demandée, et chaque formulation de statut vient de sa table. */
  langue: boolean;
  /**
   * La PROSE est écrite dans la langue demandée, mesurée par détection
   * mécanique (`banc/correcteur/langue-prose.ts`).
   *
   * Distinct de `langue`, et la distinction est tout l'intérêt : l'étiquette
   * est RECOPIÉE par le moteur depuis la demande, donc la comparer à la
   * demande prouve qu'un paramètre de scan n'est pas muet — et rien d'autre.
   * Les formulations de statut viennent de tables de code, donc elles sont
   * toujours dans la bonne langue. Les six champs de prose, les seuls que le
   * modèle écrive, n'étaient examinés par personne : le critère « rapport
   * intégralement FR » était signé par un contrôle incapable d'échouer.
   *
   * Vrai quand il n'y a PAS de prose : ne rien écrire n'est pas écrire dans la
   * mauvaise langue. Faux quand la détection ne tranche pas — un contrôle
   * qu'on ne peut pas faire n'est pas un contrôle qui passe.
   */
  langueProse: boolean;
  /** La ligne de méthode porte le compte de signalements écartés du rapport technique. */
  ligneMethode: boolean;
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
  /** Notation des attendus de nature `rapport`, comptés à part de tout le reste. */
  rapports: ResultatRapport[];
  /** Le rapport business produit, conservé comme pièce à lire (livraison de la brique 5). */
  rapportBusiness?: RapportBusiness;
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
  /** Ce que le protocole a PHYSIQUEMENT réussi à re-tester (APPRENTISSAGES n°18, P2-1 contrat 5) ; absent sur un scénario en erreur. */
  rejouabilite?: Rejouabilite;
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
  /**
   * Attendus dont la GRAVITÉ publiée est celle du manifeste, sur ceux qui ont
   * publié quelque chose (`nbGravitesMesurees`).
   *
   * FAMILLE À PART, et son dénominateur n'est pas `nbAttendus` : un attendu
   * détecté seulement parmi les candidates écartées n'a rien mis sous les yeux
   * du client, donc il n'y a rien à grader. Le compter comme mal gradé
   * imputerait à la gravité ce qui relève du protocole.
   */
  nbGravitesConformes: number;
  /** Attendus pour lesquels une gravité a RÉELLEMENT été publiée : le dénominateur honnête. */
  nbGravitesMesurees: number;
  /** Candidates produites par la détection, AVANT le protocole. */
  nbCandidates: number;
  /** Groupes de cause racine issus de la consolidation. */
  nbGroupes: number;
  /** Groupes dont le verdict est retenu : les alertes que le protocole a laissées passer. */
  nbGroupesRetenus: number;
  /** Groupes dont le verdict n'est pas retenu : les alertes que le protocole a tues. */
  nbGroupesEcartes: number;
  /** Parmi les écartés : les groupes de tiers SANS EFFET, écartés d’office (P2-2, contrat 1). */
  nbGroupesSansEffet: number;
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
  /** `null` quand rien n'a été publié : aucune gravité à juger n'est pas 0 %. */
  tauxGravitesConformes: number | null;
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
   * LA FAMILLE « RAPPORTS JUSTES » (brique 5), comptée à part de tout le
   * reste pour la même raison que les profils et les cibles : un rapport dont
   * les statuts sur-promettent n'est ni un raté de détection, ni un faux
   * positif — c'est un autre exploit manqué.
   */
  nbRapportsMesures: number;
  /** Ceux d'entre eux qui sont `satisfait` : contrôles structurels tenus ET prose non perdue. */
  nbRapportsConformes: number;
  /** Rapports non produits : sujet sans capacité, scan en erreur. Hors dénominateurs. */
  nbRapportsNonMesures: number;
  tauxRapportsConformes: number | null;
  /** Épreuves de DÉSOBÉISSANCE de rédaction (une charge vise le rapport), hors du taux ci-dessus. */
  nbInertiesRapportMesurees: number;
  nbInertiesRapportTenues: number;
  /**
   * La famille REJOUABILITÉ (APPRENTISSAGES n°18, cahier P2-1 contrat 5),
   * comptée SÉPARÉMENT de tout le reste : quelle fraction des candidates le
   * protocole a physiquement réussi à re-tester. Deux comptes, par candidates
   * et par groupes — ils divergent quand un seul gros groupe est rejoué, et
   * c'est le second qui dit la vérité du protocole. Un taux sans dénominateur
   * est null, jamais 0 : un site sans candidate n'a rien à rejouer.
   */
  nbCandidatesRejouables: number;
  nbCandidatesRejouees: number;
  nbGroupesRejouables: number;
  nbGroupesRejoues: number;
  tauxRejouabiliteCandidates: number | null;
  tauxRejouabiliteGroupes: number | null;
  /**
   * UNE CAUSE, UN CONSTAT (mesure de C-16, posée avant P2-2) : parmi les
   * attendus déclarés `causeUnique`, combien, et combien de constats publiés
   * au-delà du premier pour chacun. Aucune alarme ici : c'est la ligne de
   * base que P2-2 devra ramener à zéro.
   */
  nbAttendusCauseUnique: number;
  nbConstatsEnDouble: number;
  tauxInertiesRapportTenues: number | null;
  /**
   * COUVERTURE DE RÉDACTION : sections rédigées / sections publiées, sur les
   * rapports mesurés. C'est la JUMELLE de `coutApiRedaction` — un coût ne
   * s'affiche jamais seul (APPRENTISSAGES n°3), et sans elle on lirait un prix
   * par scan sans savoir s'il achète un rapport entier ou trois phrases.
   */
  nbSectionsRapport: number;
  nbSectionsRedigees: number;
  tauxCouvertureRedaction: number | null;
  /**
   * Rapports qui AVAIENT des sections à rédiger et n'ont AUCUNE prose.
   *
   * C'est un défaut, et il rend désormais le scénario en erreur (hors absence
   * déclarée d'IA) : un parc de cassettes devenu introuvable produit des
   * rapports STRUCTURELS — donc justes sur tous les contrôles de structure —
   * et une scorecard verte. La colonne reste parce qu'un chiffre qu'on ne voit
   * pas ne se corrige pas.
   */
  nbRapportsSansProse: number;
  /**
   * Rapports SANS AUCUNE SECTION : il n'y avait rien à décrire.
   *
   * Compté À PART, et c'est tout l'intérêt. Un site sain ne paie aucun appel
   * de rédaction — c'est le bon comportement — mais il n'en éprouve aucune non
   * plus. Fondus avec les précédents, ces rapports faisaient lire « la
   * rédaction n'a rien mesuré » comme une alarme là où il n'y avait rien à
   * mesurer ; tus, ils laissaient croire que la couverture portait sur tout le
   * périmètre. Le lecteur doit savoir sur COMBIEN de scénarios la rédaction a
   * réellement été mise à l'épreuve.
   */
  nbRapportsSansSection: number;
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
  /** Part du coût total engagée par la RÉDACTION : la jumelle de la couverture ci-dessus. */
  coutApiRedaction: number;
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
  /**
   * `production` quand le sujet est le moteur monté par `creerScannerParDefaut`
   * SANS client injecté — le vrai client, le vrai réseau, la vraie dépense.
   * Absent : le run ordinaire, client rejouable sur cassettes.
   *
   * L'étiquette existe pour qu'un fichier de résultats d'un run payant et
   * non déterministe ne puisse JAMAIS être pris pour un rejeu, ni entrer dans
   * une moyenne du banc sans qu'on le sache (APPRENTISSAGES n°6 : un
   * journal qui ne distingue pas deux sens fabrique le diagnostic qui accusera
   * le mauvais bout).
   */
  assemblage?: 'production';
  global: Agregat;
  /**
   * La famille « cibles atteintes », une ligne par politique connue des
   * attendus — la jumelle inter-politiques, côte à côte.
   */
  cibles: AgregatCibles[];
  parLangue: Record<string, Agregat>;
  /**
   * Un agrégat par gabarit (cahier P2-1, contrat 5). Comme les langues, les
   * gabarits PARTITIONNENT les scénarios — chaque scénario en a exactement
   * un —, donc leurs compteurs se somment au global. C'est le périmètre qui
   * dit OÙ le protocole cesse de rejouer : un gabarit à 0 % désigne la
   * recette qui casse (C-09 sur « formulaire-puis-navigation »), là où le
   * global dilué la cache.
   */
  parGabarit: Record<string, Agregat>;
  parCategorie: Record<string, Agregat>;
  ecartLangues: EcartLangues;
  scenarios: ResultatScenario[];
}
