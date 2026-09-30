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
import { fermerDialog, prisesFermeture, type Recouvrement, type ResultatGeometrie } from './en-page.js';
import type { FiltreElementLie } from './filtre-actions.js';

/** L'ensemble FERMÉ des gestes neutres. Invariant de sécurité : il vit en code. */
export const GESTES_FERMETURE = ['echap', 'dialog-natif', 'controle-ferme', 'clic-hors-zone'] as const;
export type GesteFermeture = (typeof GESTES_FERMETURE)[number];

/** Journal : une tentative d'écartement, quelle qu'en soit l'issue. */
export const EVENEMENT_TENTATIVE_FERMETURE = 'recouvrement.tentative';
/** Journal : un recouvrement écarté, donc traversé et non publié. */
export const EVENEMENT_RECOUVREMENT_ECARTE = 'recouvrement.ecarte';
/** Journal : la borne de dépense atteinte — les recouvrements restants n'ont PAS été tentés. */
export const EVENEMENT_FERMETURE_BORNEE = 'recouvrement.borne-atteinte';

/** Pourquoi un geste n'a pas été exécuté, quand ce n'est pas un motif de config. */
export const RAISON_GESTE_INDISPONIBLE = 'geste-indisponible';

export type IssueTentative = 'ecarte' | 'sans-effet' | 'indisponible' | 'interdite' | 'echec';

export interface TentativeFermeture {
  geste: GesteFermeture;
  /** L'élément que le geste a visé, quand il en vise un. */
  cible: LocalisationElement | null;
  /** Le point cliqué, pour le seul `clic-hors-zone` : une relecture doit pouvoir vérifier qu'il n'a rien activé. */
  point: { x: number; y: number } | null;
  issue: IssueTentative;
  /** Motif du filtre d'actions destructives, ou raison technique. */
  motif?: string;
}

export interface ConfigFermeture {
  gestes: readonly GesteFermeture[];
  partMaxSurfaceControle: number;
  partCoin: number;
  delaiApresGesteMs: number;
  recouvrementsMax: number;
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
      journaliser(EVENEMENT_TENTATIVE_FERMETURE, {
        geste: tentative.geste,
        intercepteur: intercepteur.selecteur,
        cible: tentative.cible?.selecteur ?? null,
        point: tentative.point,
        issue: tentative.issue,
        ...(tentative.motif === undefined ? {} : { motif: tentative.motif }),
      });
      tentatives.push(tentative);
      if (tentative.issue !== 'ecarte') {
        continue;
      }
      // LE GESTE A EU LIEU : on re-mesure avant de conclure. « Écarté » est
      // une propriété de la PAGE, pas du geste — un clic qui ne lève rien
      // n'écarte rien.
      await attendre(config.delaiApresGesteMs);
      restants = (await mesurer()).recouvrements;
      if (recouvreEncore(restants, intercepteur.selecteur)) {
        tentative.issue = 'sans-effet';
        journaliser(EVENEMENT_TENTATIVE_FERMETURE, { geste, intercepteur: intercepteur.selecteur, issue: 'sans-effet' });
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
 * UN geste, tenté. Rend `ecarte` quand le geste a pu être EXÉCUTÉ — c'est
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
        return { ...base, issue: 'ecarte' };
      }
      case 'dialog-natif': {
        // L'API du standard, pas un clic : aucun gestionnaire de la page
        // n'est déclenché, donc aucune conséquence à filtrer.
        const ferme = await fermerDialog(page, intercepteur.selecteur, delaiMs);
        return { ...base, issue: ferme ? 'ecarte' : 'indisponible' };
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
        return { ...base, cible: prises.controle, issue: 'ecarte' };
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
        return { ...base, point: prises.pointVide, issue: 'ecarte' };
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
