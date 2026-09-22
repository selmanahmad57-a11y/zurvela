/**
 * Observation : collecte des Signaux bruts pendant l'exploration (cahier §1
 * étape 2). L'observateur est un tampon en mémoire ; `brancherPage` relie
 * les événements Playwright d'une page à ce tampon et fournit la fenêtre
 * d'effet (`attendreEffets`) qui suit chaque action.
 *
 * Aucune interprétation ici : les détecteurs (flux D) lisent les signaux.
 * Tous les horodatages sont en epoch ms, rendus en ISO 8601 avec
 * millisecondes : ceux des réponses viennent de Playwright (`timing`),
 * ceux des mutations de la page (`performance.timeOrigin + now`).
 */
import type { Frame, Page, Request, Response } from 'playwright';
import type { Observateur, Signal } from '../../types.js';
import type { LectureMutations, MutationLue } from '../exploration/en-page.js';

export function creerObservateur(): Observateur {
  const signaux: Signal[] = [];
  return {
    emettre(signal) {
      signaux.push(signal);
    },
    signaux() {
      return [...signaux];
    },
  };
}

export interface ParametresBranchement {
  observateur: Observateur;
  viewport: string;
  /** Origine de l'URL de départ : une ressource de même origine est `interne`. */
  origine: string;
  /** Action en cours (undefined hors fenêtre d'action) : chaque signal la reçoit. */
  actionCouranteId(): string | undefined;
  pageCourante(): string;
}

export interface OptionsFenetre {
  stabilisationMs: number;
  /** Durée maximale de la fenêtre. */
  plafondMs: number;
  sondageMs: number;
}

export interface OptionsEffets extends OptionsFenetre {
  actionId: string;
  /** Horodatage de la dernière mutation en attente dans la page, sans vider le tampon. */
  derniereMutation(): Promise<number | null>;
  /** Lit et vide le tampon de mutations de la page. */
  lireMutations(): Promise<LectureMutations>;
}

export type EffetsAction = Extract<Signal, { type: 'fin-action' }>['effets'];

export interface PageBranchee {
  /** Ouvre une fenêtre d'effet : remet à zéro les compteurs (à appeler juste AVANT l'action). */
  ouvrirFenetre(): void;
  /** Attend la stabilisation de la page sans émettre de signal (après un chargement). */
  attendreStabilite(options: OptionsFenetre, derniereMutation: () => Promise<number | null>): Promise<void>;
  /**
   * Attend la fin des effets de l'action puis émet `mutation-dom` (un lot par
   * instant de mutation), `requete-en-attente` (requêtes encore en vol) et
   * `fin-action`.
   */
  attendreEffets(options: OptionsEffets): Promise<EffetsAction>;
  /** Statut HTTP du dernier document chargé dans le cadre principal, ou null si aucun. */
  statutDocument(): number | null;
  /** true si une navigation du cadre principal est partie sans avoir abouti (réponse jamais reçue). */
  navigationEnCours(): boolean;
  debrancher(): void;
}

/** État observable d'une page pendant une fenêtre ; abstrait pour tester la boucle sans navigateur. */
export interface EtatFenetre {
  requetesEnVol(): number;
  /** Epoch ms du dernier événement réseau ou de navigation. */
  derniereActivite(): number;
  navigationEnCours(): boolean;
  /** Attend la fin du chargement en cours, au plus `ms` (ne lève jamais). */
  attendreChargement(ms: number): Promise<void>;
  /** true si la page (ou son navigateur) est fermée : plus rien à attendre. */
  pageFermee(): boolean;
}

export interface Horloge {
  maintenant(): number;
  dormir(ms: number): Promise<void>;
}

export const HORLOGE_REELLE: Horloge = {
  maintenant: () => Date.now(),
  dormir: (ms) => new Promise((resoudre) => setTimeout(resoudre, ms)),
};

/**
 * Boucle de stabilisation : termine quand (aucune requête en vol) ET
 * (aucune navigation en cours) ET (aucune mutation ni requête depuis
 * `stabilisationMs`), ou au plafond, ou aussitôt si la page est fermée.
 * Renvoie la durée attendue. Pendant une navigation du cadre principal, la
 * page n'est jamais évaluée (une évaluation y resterait pendante).
 */
export async function attendreStabilisation(
  etat: EtatFenetre,
  options: OptionsFenetre,
  derniereMutation: () => Promise<number | null>,
  horloge: Horloge = HORLOGE_REELLE,
): Promise<number> {
  const debut = horloge.maintenant();
  const restant = (): number => options.plafondMs - (horloge.maintenant() - debut);
  // Activité constatée par la boucle elle-même (lecture impossible pendant une navigation).
  let activiteLocale = Number.NEGATIVE_INFINITY;
  while (restant() > 0 && !etat.pageFermee()) {
    if (etat.navigationEnCours()) {
      await etat.attendreChargement(restant());
      if (etat.navigationEnCours()) {
        await horloge.dormir(Math.max(0, Math.min(options.sondageMs, restant())));
      }
      continue;
    }
    let mutation: number | null = null;
    try {
      mutation = await derniereMutation();
    } catch {
      if (etat.pageFermee()) {
        break;
      }
      // Contexte détruit par une navigation en cours : c'est de l'activité.
      activiteLocale = horloge.maintenant();
    }
    const derniere = Math.max(etat.derniereActivite(), activiteLocale, mutation ?? Number.NEGATIVE_INFINITY);
    if (etat.requetesEnVol() === 0 && !etat.navigationEnCours() && horloge.maintenant() - derniere >= options.stabilisationMs) {
      break;
    }
    await horloge.dormir(Math.max(0, Math.min(options.sondageMs, restant())));
  }
  return horloge.maintenant() - debut;
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Un lot par instant de mutation (même horodatage = même rappel du
 * MutationObserver), dans l'ordre. `nbZone` ne compte que les mutations hors
 * bruit de fond : une animation qui vit DANS la zone du formulaire (compteur
 * de caractères, bandeau) n'est pas une réaction à l'action.
 */
export function regrouperParInstant(mutations: MutationLue[]): { t: number; nb: number; nbZone: number }[] {
  const lots: { t: number; nb: number; nbZone: number }[] = [];
  for (const mutation of mutations) {
    const zone = mutation.enZone && !mutation.fond ? 1 : 0;
    const dernier = lots[lots.length - 1];
    if (dernier !== undefined && dernier.t === mutation.t) {
      dernier.nb += 1;
      dernier.nbZone += zone;
    } else {
      lots.push({ t: mutation.t, nb: 1, nbZone: zone });
    }
  }
  return lots;
}

function estInterne(url: string, origine: string): boolean {
  try {
    return new URL(url).origin === origine;
  } catch {
    return false;
  }
}

/**
 * Durée et horodatage d'une réponse d'après `request.timing()`. À l'événement
 * `response`, `responseEnd` n'est pas encore connu (-1) et `requestfinished`
 * peut ne jamais survenir si la page navigue aussitôt : on retient
 * `responseEnd` s'il est disponible, sinon `responseStart` (premier octet).
 */
function mesurerReponse(requete: Request): { dureeMs: number | null; horodatage: string } {
  const timing = requete.timing();
  const dureeMs = timing.responseEnd >= 0 ? timing.responseEnd : timing.responseStart >= 0 ? timing.responseStart : null;
  const horodatage = timing.startTime > 0 && dureeMs !== null ? iso(timing.startTime + dureeMs) : iso(Date.now());
  return { dureeMs, horodatage };
}

export function brancherPage(page: Page, params: ParametresBranchement): PageBranchee {
  const { observateur, viewport, origine } = params;
  const base = (): { viewport: string; page: string; actionId?: string } => {
    const actionId = params.actionCouranteId();
    return actionId === undefined ? { viewport, page: params.pageCourante() } : { viewport, page: params.pageCourante(), actionId };
  };

  // Fenêtre d'effet courante : requêtes en vol parties DEPUIS l'ouverture, activité, navigation.
  let enVol = new Map<Request, number>();
  let requetes = 0;
  let derniereActivite = Date.now();
  let navigationVue = false;
  let navigationEnCours = false;
  let urlPrecedente = page.url();
  let statutDocument: number | null = null;
  // Requêtes ayant reçu leur réponse : un `requestfailed` ultérieur (corps
  // abandonné par une navigation, net::ERR_ABORTED) n'est pas un échec réseau.
  const repondues = new WeakSet<Request>();

  const activite = (): void => {
    derniereActivite = Date.now();
  };
  const terminerRequete = (requete: Request): void => {
    enVol.delete(requete);
    activite();
  };

  const surRequete = (requete: Request): void => {
    enVol.set(requete, Date.now());
    requetes += 1;
    if (requete.isNavigationRequest() && requete.frame() === page.mainFrame()) {
      navigationEnCours = true;
    }
    activite();
  };
  const surReponse = (reponse: Response): void => {
    const requete = reponse.request();
    const { dureeMs, horodatage } = mesurerReponse(requete);
    // Le document d'une navigation est attribué à sa propre URL : `page.url()` n'a pas encore changé.
    const estDocument = requete.isNavigationRequest() && requete.frame() === page.mainFrame();
    if (estDocument) {
      statutDocument = reponse.status();
    }
    repondues.add(requete);
    observateur.emettre({
      ...base(),
      ...(estDocument ? { page: reponse.url() } : {}),
      type: 'reponse-reseau',
      horodatage,
      urlRessource: reponse.url(),
      methode: requete.method(),
      statut: reponse.status(),
      typeRessource: requete.resourceType(),
      dureeMs,
      interne: estInterne(reponse.url(), origine),
    });
    terminerRequete(requete);
  };
  const surEchec = (requete: Request): void => {
    if (!repondues.has(requete)) {
      observateur.emettre({
        ...base(),
        type: 'requete-echouee',
        horodatage: iso(Date.now()),
        urlRessource: requete.url(),
        methode: requete.method(),
        typeRessource: requete.resourceType(),
        erreur: requete.failure()?.errorText ?? '',
        interne: estInterne(requete.url(), origine),
      });
    }
    if (requete.isNavigationRequest() && requete.frame() === page.mainFrame()) {
      navigationEnCours = false;
    }
    terminerRequete(requete);
  };
  const surFin = (requete: Request): void => {
    terminerRequete(requete);
  };
  const surErreurJs = (erreur: Error): void => {
    observateur.emettre({ ...base(), type: 'erreur-js', horodatage: iso(Date.now()), message: erreur.message });
  };
  const surNavigation = (cadre: Frame): void => {
    if (cadre !== page.mainFrame()) {
      return;
    }
    const vers = cadre.url();
    observateur.emettre({ ...base(), type: 'navigation', horodatage: iso(Date.now()), de: urlPrecedente, vers });
    urlPrecedente = vers;
    navigationVue = true;
    activite();
  };
  const surChargement = (): void => {
    navigationEnCours = false;
    activite();
  };

  page.on('request', surRequete);
  page.on('response', surReponse);
  page.on('requestfailed', surEchec);
  page.on('requestfinished', surFin);
  page.on('pageerror', surErreurJs);
  page.on('framenavigated', surNavigation);
  page.on('load', surChargement);

  const etat: EtatFenetre = {
    requetesEnVol: () => enVol.size,
    derniereActivite: () => derniereActivite,
    navigationEnCours: () => navigationEnCours,
    attendreChargement: (ms) => page.waitForLoadState('load', { timeout: Math.max(1, ms) }).catch(() => undefined),
    pageFermee: () => page.isClosed(),
  };

  return {
    ouvrirFenetre() {
      enVol = new Map();
      requetes = 0;
      navigationVue = false;
      derniereActivite = Date.now();
    },

    async attendreStabilite(options, derniereMutation) {
      await attendreStabilisation(etat, options, derniereMutation);
    },

    async attendreEffets(options) {
      const attenteMs = await attendreStabilisation(etat, options, options.derniereMutation);
      let lecture: LectureMutations = { mutations: [], excedent: 0, excedentHorsFond: 0 };
      // Après une navigation vue, le tampon est celui d'un nouveau document ;
      // pendant une navigation encore pendante, la page n'est pas évaluable.
      if (!navigationVue && !navigationEnCours) {
        try {
          lecture = await options.lireMutations();
        } catch {
          // Page fermée ou contexte détruit : aucune mutation lisible.
        }
      }
      const commun = { ...base(), actionId: options.actionId };
      for (const lot of regrouperParInstant(lecture.mutations)) {
        observateur.emettre({ ...commun, type: 'mutation-dom', horodatage: iso(lot.t), nb: lot.nb, nbZone: lot.nbZone });
      }
      const maintenant = Date.now();
      for (const [requete, debut] of enVol) {
        observateur.emettre({
          ...commun,
          type: 'requete-en-attente',
          horodatage: iso(maintenant),
          urlRessource: requete.url(),
          methode: requete.method(),
          typeRessource: requete.resourceType(),
          attenteMs: maintenant - debut,
          interne: estInterne(requete.url(), origine),
        });
      }
      const effets: EffetsAction = {
        requetes,
        requetesEnAttente: enVol.size,
        navigation: navigationVue,
        mutations: lecture.mutations.length + lecture.excedent,
        mutationsZone: lecture.mutations.filter((m) => m.enZone && !m.fond).length,
        mutationsHorsBruit: lecture.mutations.filter((m) => !m.fond).length + lecture.excedentHorsFond,
        attenteMs,
      };
      observateur.emettre({ ...commun, type: 'fin-action', horodatage: iso(maintenant), effets });
      return effets;
    },

    statutDocument() {
      return statutDocument;
    },

    navigationEnCours() {
      return navigationEnCours;
    },

    debrancher() {
      page.off('request', surRequete);
      page.off('response', surReponse);
      page.off('requestfailed', surEchec);
      page.off('requestfinished', surFin);
      page.off('pageerror', surErreurJs);
      page.off('framenavigated', surNavigation);
      page.off('load', surChargement);
    },
  };
}
