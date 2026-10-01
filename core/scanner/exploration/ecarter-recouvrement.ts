/**
 * ÉCARTER UN RECOUVREMENT (cahier P2-3, contrat 1).
 *
 * Un recouvrement n'est un défaut que si RIEN ne l'écarte. Le moteur tente
 * donc, dans l'ordre fixé en config, une liste FERMÉE de gestes neutres, et
 * re-mesure après chacun. S'il réussit, le recouvrement n'est pas publié —
 * c'est l'état normal du web moderne, pas une panne. S'il échoue partout,
 * l'élément est déclaré NON ÉCARTABLE, et c'est un vrai défaut.
 *
 * TROIS RÈGLES DE SÉCURITÉ, qui ne sont pas des réglages (constitution §3,
 * clause inscrite le 2026-09-30) :
 *  1. l'ENSEMBLE des gestes possibles vit ici, en code ; la config n'en
 *     choisit que l'ordre et l'activation. Un geste absent de ce module
 *     n'existe pas, quoi qu'en dise un fichier de config ;
 *  2. tout geste qui ACTIVE un élément passe par le filtre d'actions
 *     destructives, exactement comme une action décidée par l'IA — un geste
 *     n'y échappe pas parce que c'est le code qui l'a choisi. Les deux
 *     gestes qui n'activent aucun élément le disent par construction :
 *     `echap` ne vise rien, et `clic-hors-zone` ne clique qu'un point
 *     vérifié sans élément interactif ;
 *  3. chaque tentative est JOURNALISÉE — son geste, sa cible exacte, son
 *     issue, et pour le clic hors zone LE POINT choisi. Un moteur qui agit
 *     sur la page d'autrui sans laisser trace de ce qu'il a fait n'est pas
 *     relisible.
 *
 * LA VOIE C — ESSAYER, PAS RECONNAÎTRE. Les quatre premiers gestes
 * cherchent des prises CONNUES D'AVANCE : une touche, un `<dialog>`, une
 * croix ARIA dans un coin, un point vide. Le réel a montré leur frontière :
 * le modal de the-internet se ferme par un `<p>Close</p>` sans rôle, sans
 * ARIA, pleine largeur — reconnaissable par son seul TEXTE, que la règle
 * maîtresse §2 interdit de lire en détection. Le cinquième geste renverse
 * la question : le contrôle de fermeture EST, par définition, ce dont
 * l'activation ferme. On ne le nomme pas, on l'essaie et on mesure l'effet
 * — c'est « écarté est une propriété de la page, pas du geste »
 * (APPRENTISSAGES n°27) poussé à sa conclusion. Un « Später », un « 关闭 »
 * ou une icône muette sont traités à l'identique : aucune langue n'est lue,
 * aucun modèle n'est appelé.
 *
 * TROIS GARDES LUI SONT PROPRES, sans quoi essayer serait dangereux :
 *  - le filtre d'actions destructives passe sur CHAQUE candidat, pas
 *    seulement sur le geste final : un « supprimer mon compte » dans un
 *    modal ne se clique pas « pour voir s'il ferme » ;
 *  - les candidats sont les descendants du RECOUVREMENT, jamais de la
 *    page, et leur nombre est borné par la config ;
 *  - l'effet se vérifie dans les DEUX sens : le recouvrement a disparu ET
 *    rien d'autre n'a changé (même URL, même nombre de formulaires). Un
 *    clic qui ferme en naviguant n'est pas un écartement, c'est une action
 *    aux conséquences : il est compté `sans-effet`, jamais revendiqué.
 * Ce qu'aucun essai ne ferme reste « non écartable par un geste neutre » —
 * le résidu de C est plus petit que celui de A, mais il existe, et il tombe
 * dans le constat déjà validé.
 *
 * LE MOTEUR NE CONSENT JAMAIS POUR AUTRUI, et n'a pas besoin de reconnaître
 * un bandeau de consentement pour cela : on tente les gestes neutres, et
 * s'ils échouent tous l'élément est « non écartable par un geste neutre ».
 * Un mur de consentement et un modal sans croix tombent dans le même
 * constat — dans les deux cas, la page exige une décision qui n'est pas la
 * nôtre. Le résultat éthique est atteint sans aucune connaissance du monde
 * (règle maîtresse §2 : aucun texte n'est lu pour décider).
 */
import type { Page } from 'playwright';
import type { LocalisationElement } from '../../types.js';
import { descendantsActivables, empreintePage, fermerDialog, prisesFermeture, type Recouvrement, type ResultatGeometrie } from './en-page.js';
import type { FiltreElementLie } from './filtre-actions.js';

/** L'ensemble FERMÉ des gestes neutres. Invariant de sécurité : il vit en code. */
export const GESTES_FERMETURE = ['echap', 'dialog-natif', 'controle-ferme', 'clic-hors-zone', 'descendant-essaye'] as const;
export type GesteFermeture = (typeof GESTES_FERMETURE)[number];

/** Journal : une tentative d'écartement, quelle qu'en soit l'issue. */
export const EVENEMENT_TENTATIVE_FERMETURE = 'recouvrement.tentative';
/** Journal : un recouvrement écarté, donc traversé et non publié. */
export const EVENEMENT_RECOUVREMENT_ECARTE = 'recouvrement.ecarte';
/** Journal : la borne de dépense atteinte — les recouvrements restants n'ont PAS été tentés. */
export const EVENEMENT_FERMETURE_BORNEE = 'recouvrement.borne-atteinte';

/** Pourquoi un geste n'a pas été exécuté, quand ce n'est pas un motif de config. */
export const RAISON_GESTE_INDISPONIBLE = 'geste-indisponible';

/**
 * Un essai a bien fait disparaître le recouvrement, mais il a CHANGÉ AUTRE
 * CHOSE — navigué, soumis. Ce n'est pas une fermeture, c'est une action aux
 * conséquences : on la journalise et on ne la revendique jamais (voie C).
 */
export const RAISON_EFFET_DE_BORD = 'effet-de-bord';

/**
 * `execute` est un état INTERMÉDIAIRE, jamais journalisé : il dit que le
 * geste a eu lieu, pas qu'il a produit un effet. La re-mesure le remplace
 * par `ecarte` ou `sans-effet` avant que quoi que ce soit ne soit écrit.
 */
export type IssueTentative = 'execute' | 'ecarte' | 'sans-effet' | 'indisponible' | 'interdite' | 'echec';

export interface TentativeFermeture {
  geste: GesteFermeture;
  /** L'élément que le geste a visé, quand il en vise un. */
  cible: LocalisationElement | null;
  /** Le point cliqué, pour le seul `clic-hors-zone` : une relecture doit pouvoir vérifier qu'il n'a rien activé. */
  point: { x: number; y: number } | null;
  issue: IssueTentative;
  /** Motif du filtre d'actions destructives, ou raison technique. */
  motif?: string;
  /**
   * Ce que la VOIE C a réellement fait : combien de candidats proposés,
   * combien refusés par le filtre, combien activés. Sans ces comptes,
   * `indisponible` couvre aussi bien « aucun candidat » que « douze
   * essayés, aucun n'a fermé » — et l'on ne peut rien diagnostiquer. Un
   * moteur qui agit sans laisser trace de ce qu'il a fait n'est pas
   * relisible (constitution §3).
   */
  essais?: { candidats: number; refuses: number; actives: number };
}

export interface ConfigFermeture {
  gestes: readonly GesteFermeture[];
  partMaxSurfaceControle: number;
  partCoin: number;
  delaiApresGesteMs: number;
  recouvrementsMax: number;
  /** Descendants d'un recouvrement qu'on peut ESSAYER d'activer (voie C) : borne la dépense. */
  descendantsEssayesMax: number;
}

export interface OptionsEcartement {
  page: Page;
  /** Les recouvrements constatés par la géométrie, avant toute tentative. */
  constats: readonly Recouvrement[];
  config: ConfigFermeture;
  /** Le filtre d'actions destructives, déjà lié à la page : il tranche avant tout clic. */
  filtreElement: FiltreElementLie;
  /** Budget d'évaluation en page, en millisecondes. */
  delaiMs: number;
  /** Bornes de la mesure géométrique, pour re-mesurer à l'identique. */
  geometrie: { max: number; budgetMs: number };
  /**
   * Re-mesure de la géométrie après un geste. INJECTÉE : « écarté » est une
   * propriété de la PAGE, et un test doit pouvoir dire ce que la page est
   * devenue sans monter un navigateur.
   */
  mesurer: () => Promise<ResultatGeometrie>;
  journaliser: (type: string, details?: unknown) => void;
  attendre: (ms: number) => Promise<void>;
}

export interface IssueEcartement {
  /** Ce qui recouvre ENCORE après toutes les tentatives : les seuls publiables. */
  restants: Recouvrement[];
  /** Combien d'intercepteurs distincts ont été écartés — le compte que le rapport déclare (contrat 7). */
  nbEcartes: number;
  tentatives: TentativeFermeture[];
}

/** Les intercepteurs distincts d'une liste de constats, dans l'ordre d'apparition. */
function intercepteursDistincts(constats: readonly Recouvrement[]): LocalisationElement[] {
  const vus = new Map<string, LocalisationElement>();
  for (const constat of constats) {
    if (constat.intercepteur !== null && !vus.has(constat.intercepteur.selecteur)) {
      vus.set(constat.intercepteur.selecteur, constat.intercepteur);
    }
  }
  return [...vus.values()];
}

/** L'intercepteur recouvre-t-il encore quelque chose ? */
function recouvreEncore(restants: readonly Recouvrement[], selecteur: string): boolean {
  return restants.some((constat) => constat.intercepteur?.selecteur === selecteur);
}

/**
 * Tente d'écarter chaque intercepteur, puis rend ce qui recouvre ENCORE.
 *
 * L'ordre est celui de la config, et la boucle s'arrête au premier geste qui
 * fonctionne : on n'accumule pas des actions sur la page d'un client pour le
 * plaisir de les essayer toutes.
 */
export async function ecarterRecouvrements(options: OptionsEcartement): Promise<IssueEcartement> {
  const { page, config, filtreElement, delaiMs, journaliser, attendre, mesurer } = options;
  const tentatives: TentativeFermeture[] = [];
  let restants = [...options.constats];
  let nbEcartes = 0;

  const cibles = intercepteursDistincts(restants);
  const tentables = cibles.slice(0, config.recouvrementsMax);
  if (cibles.length > tentables.length) {
    // Une borne SILENCIEUSE serait un angle mort : les restants seront jugés
    // sans qu'on ait tenté de les écarter, et le rapport doit pouvoir le dire.
    journaliser(EVENEMENT_FERMETURE_BORNEE, { intercepteurs: cibles.length, tentes: tentables.length });
  }

  for (const intercepteur of tentables) {
    if (!recouvreEncore(restants, intercepteur.selecteur)) {
      // Un geste précédent l'a emporté avec lui (deux bandeaux dans un même
      // conteneur fermé d'un coup) : rien à tenter.
      continue;
    }
    for (const geste of config.gestes) {
      const tentative = await executerGeste({ geste, intercepteur, page, config, filtreElement, delaiMs });
      // LE GESTE A EU LIEU : on re-mesure AVANT de conclure, et avant même
      // de journaliser. « Écarté » est une propriété de la PAGE, pas du
      // geste (APPRENTISSAGES n°27) — et une trace qui dirait « écarté »
      // puis se corrigerait à la ligne suivante ferait au journal
      // exactement l'erreur que le code refuse de faire au rapport.
      if (tentative.issue === 'execute') {
        await attendre(config.delaiApresGesteMs);
        restants = (await mesurer()).recouvrements;
        tentative.issue = recouvreEncore(restants, intercepteur.selecteur) ? 'sans-effet' : 'ecarte';
      }
      journaliser(EVENEMENT_TENTATIVE_FERMETURE, {
        geste: tentative.geste,
        intercepteur: intercepteur.selecteur,
        cible: tentative.cible?.selecteur ?? null,
        point: tentative.point,
        issue: tentative.issue,
        ...(tentative.motif === undefined ? {} : { motif: tentative.motif }),
        ...(tentative.essais === undefined ? {} : { essais: tentative.essais }),
      });
      tentatives.push(tentative);
      if (tentative.issue !== 'ecarte') {
        continue;
      }
      nbEcartes += 1;
      journaliser(EVENEMENT_RECOUVREMENT_ECARTE, { intercepteur: intercepteur.selecteur, geste });
      break;
    }
  }

  return { restants, nbEcartes, tentatives };
}

interface OptionsGeste {
  geste: GesteFermeture;
  intercepteur: LocalisationElement;
  page: Page;
  config: ConfigFermeture;
  filtreElement: FiltreElementLie;
  delaiMs: number;
}

/**
 * UN geste, tenté. Rend `execute` quand le geste a pu avoir lieu — c'est
 * l'appelant qui re-mesure et tranche si la page a changé.
 */
async function executerGeste(options: OptionsGeste): Promise<TentativeFermeture> {
  const { geste, intercepteur, page, config, filtreElement, delaiMs } = options;
  const base: TentativeFermeture = { geste, cible: null, point: null, issue: 'indisponible' };
  try {
    switch (geste) {
      case 'echap': {
        // Ne vise aucun élément : rien à filtrer, rien à activer.
        await page.keyboard.press('Escape');
        return { ...base, issue: 'execute' };
      }
      case 'dialog-natif': {
        // L'API du standard, pas un clic : aucun gestionnaire de la page
        // n'est déclenché, donc aucune conséquence à filtrer.
        const ferme = await fermerDialog(page, intercepteur.selecteur, delaiMs);
        return { ...base, issue: ferme ? 'execute' : 'indisponible' };
      }
      case 'controle-ferme': {
        const prises = await prisesFermeture(page, {
          selecteurIntercepteur: intercepteur.selecteur,
          partMaxSurface: config.partMaxSurfaceControle,
          partCoin: config.partCoin,
          delaiMs,
        });
        if (prises.controle === null) {
          return base;
        }
        // LE SEUL GESTE QUI ACTIVE UN ÉLÉMENT : le filtre tranche AVANT.
        const verdict = await filtreElement(prises.controle.selecteur);
        if (!verdict.autorisee) {
          const motif = 'motif' in verdict ? verdict.motif : verdict.raison;
          return { ...base, cible: prises.controle, issue: 'interdite', motif };
        }
        await page.click(prises.controle.selecteur, { timeout: delaiMs, noWaitAfter: true });
        return { ...base, cible: prises.controle, issue: 'execute' };
      }
      case 'clic-hors-zone': {
        const prises = await prisesFermeture(page, {
          selecteurIntercepteur: intercepteur.selecteur,
          partMaxSurface: config.partMaxSurfaceControle,
          partCoin: config.partCoin,
          delaiMs,
        });
        if (prises.pointVide === null) {
          // AUCUN POINT SÛR N'EXISTE : le geste est indisponible, on passe au
          // suivant. Jamais un clic au hasard en espérant que c'est vide (D3).
          return base;
        }
        await page.mouse.click(prises.pointVide.x, prises.pointVide.y);
        return { ...base, point: prises.pointVide, issue: 'execute' };
      }
      case 'descendant-essaye': {
        // LA VOIE C. On essaie les descendants du recouvrement, un par un,
        // et l'on garde celui dont l'activation le fait disparaître SANS
        // rien changer d'autre. Ce geste tranche lui-même son issue — il
        // mesure après chaque essai, parce que c'est l'essai qui désigne le
        // contrôle, et non l'inverse.
        const candidats = await descendantsActivables(page, intercepteur.selecteur, config.descendantsEssayesMax, delaiMs);
        const avant = await empreintePage(page, intercepteur.selecteur, delaiMs);
        const essais = { candidats: candidats.length, refuses: 0, actives: 0 };
        for (const candidat of candidats) {
          // LE FILTRE SUR CHAQUE CANDIDAT, pas seulement sur le geste
          // final : un « supprimer mon compte » dans un modal ne se clique
          // pas pour voir s'il ferme (D1, constitution §3).
          const verdict = await filtreElement(candidat.selecteur);
          if (!verdict.autorisee) {
            essais.refuses += 1;
            continue;
          }
          try {
            await page.click(candidat.selecteur, { timeout: delaiMs, noWaitAfter: true });
            essais.actives += 1;
          } catch {
            continue;
          }
          const apres = await empreintePage(page, intercepteur.selecteur, delaiMs);
          if (apres.present) {
            // Le recouvrement est toujours là : ce candidat n'était pas la
            // prise. On continue, sans rien revendiquer.
            continue;
          }
          if (apres.url !== avant.url || apres.nbFormulaires !== avant.nbFormulaires) {
            // IL A FERMÉ, MAIS IL A FAIT AUTRE CHOSE. Ce n'est pas un
            // écartement, c'est une action aux conséquences : on ne la
            // revendique pas, et on le dit.
            return { ...base, cible: candidat, issue: 'sans-effet', motif: RAISON_EFFET_DE_BORD, essais };
          }
          return { ...base, cible: candidat, issue: 'execute', essais };
        }
        return { ...base, essais };
      }
      default: {
        // Un geste que la config nomme mais que le code ne connaît pas
        // n'existe pas : l'ensemble des gestes est un invariant.
        return base;
      }
    }
  } catch {
    return { ...base, issue: 'echec' };
  }
}
