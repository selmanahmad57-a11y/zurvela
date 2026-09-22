/**
 * Navigateur du scanner : lancement, contexte par viewport (identité du
 * robot, constitution §3) et script d'initialisation qui installe le tampon
 * de mutations lu ensuite par l'exploration.
 */
/// <reference lib="dom" />
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { Viewport } from '../types.js';
import type { ConfigScanner } from './config.js';

/** Nom de la propriété de `window` qui porte le tampon de mutations (partagé avec en-page.ts). */
export const NOM_TAMPON = '__zurvela';

/** Réglages du tampon, passés au script d'initialisation (jamais de valeur en dur en page). */
export interface ReglagesTampon {
  nom: string;
  /** Mutations conservées entre deux lectures ; au-delà, seulement comptées. */
  max: number;
  /** Instants distincts après le chargement à partir desquels une cible est du bruit de fond. */
  bruitFondRepetitions: number;
}

/** Forme du tampon installé dans chaque document. */
export interface TamponMutations {
  mutations: { t: number; cible: Node; fond: boolean }[];
  /** Mutations non conservées (au-delà de `max`) depuis la dernière lecture, dont celles hors bruit. */
  excedent: number;
  excedentHorsFond: number;
  /** Horodatage de la dernière mutation hors bruit de fond (null si aucune depuis la dernière lecture). */
  derniereHorsFond: number | null;
}

/**
 * S'exécute DANS la page, avant tout script du site : un MutationObserver
 * sur le document entier accumule chaque mutation avec un horodatage epoch
 * (même échelle que les horodatages Playwright côté Node).
 *
 * Bruit de fond : une cible qui mute à `bruitFondRepetitions` instants
 * distincts après le chargement (carrousel, horloge, compteur) est
 * considérée comme mutant spontanément ; ses mutations suivantes sont
 * marquées `fond` et ne comptent ni comme réaction ni pour la stabilisation.
 * Les mutations d'avant le chargement (analyse du document, scripts
 * d'initialisation) n'entrent pas dans ce comptage : un rendu unique n'est
 * pas du bruit. Le tampon est borné : au-delà de `max`, les mutations sont
 * comptées mais pas conservées (page qui mute en continu).
 */
function installerTampon(reglages: ReglagesTampon): void {
  // Filet de sécurité : un bundler qui conserve les noms (esbuild `keepNames`)
  // fait référencer `__name` par les fonctions sérialisées vers la page.
  const global = globalThis as unknown as Record<string, unknown>;
  if (global['__name'] === undefined) {
    global['__name'] = (cible: unknown): unknown => cible;
  }
  const tampon: TamponMutations = { mutations: [], excedent: 0, excedentHorsFond: 0, derniereHorsFond: null };
  (window as unknown as Record<string, unknown>)[reglages.nom] = tampon;
  // Par cible : nombre d'instants distincts de mutation après le chargement, et le dernier.
  const comptes = new WeakMap<Node, { n: number; t: number }>();
  const observateur = new MutationObserver((lot) => {
    const t = performance.timeOrigin + performance.now();
    const chargee = document.readyState === 'complete';
    for (const mutation of lot) {
      let fond = false;
      if (chargee) {
        const compte = comptes.get(mutation.target) ?? { n: 0, t: Number.NaN };
        if (compte.t !== t) {
          compte.n += 1;
          compte.t = t;
          comptes.set(mutation.target, compte);
        }
        fond = compte.n > reglages.bruitFondRepetitions;
      }
      if (!fond) {
        tampon.derniereHorsFond = t;
      }
      if (tampon.mutations.length < reglages.max) {
        tampon.mutations.push({ t, cible: mutation.target, fond });
      } else {
        tampon.excedent += 1;
        if (!fond) {
          tampon.excedentHorsFond += 1;
        }
      }
    }
  });
  observateur.observe(document, { childList: true, attributes: true, characterData: true, subtree: true });
}

export async function lancerNavigateur(config: ConfigScanner): Promise<Browser> {
  return chromium.launch({ headless: config.navigateur.sansTete, channel: config.navigateur.canal ?? undefined });
}

/** Un contexte isolé par viewport : dimensions, identité du robot, tampon de mutations. */
export async function creerContexte(navigateur: Browser, config: ConfigScanner, viewport: Viewport): Promise<BrowserContext> {
  const contexte = await navigateur.newContext({
    viewport: { width: viewport.largeur, height: viewport.hauteur },
    userAgent: config.robot.userAgent,
    extraHTTPHeaders: { [config.robot.enTete]: config.robot.valeurEnTete },
  });
  // Aucune attente Playwright ne doit dépasser le délai de chargement d'une page.
  contexte.setDefaultTimeout(config.exploration.chargementPageMs);
  contexte.setDefaultNavigationTimeout(config.exploration.chargementPageMs);
  const reglages: ReglagesTampon = {
    nom: NOM_TAMPON,
    max: config.exploration.mutationsMax,
    bruitFondRepetitions: config.exploration.bruitFondRepetitions,
  };
  await contexte.addInitScript(installerTampon, reglages);
  return contexte;
}
