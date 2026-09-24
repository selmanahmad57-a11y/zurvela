/**
 * Exploration sans IA (cahier §2) : pour chaque viewport, découverte en
 * largeur des pages internes, puis boucle de décision (politique → filtre
 * d'actions interdites → exécution → fenêtre d'effet) jusqu'à `terminer`.
 *
 * L'explorateur ne lit jamais le DOM lui-même (en-page.ts s'en charge) et
 * n'interprète aucun signal : il produit le Parcours et alimente
 * l'observateur. L'échéance est vérifiée avant chaque action, avant chaque
 * navigation et à l'intérieur des étapes longues (saisie, évaluations en
 * page, toutes bornées par le budget restant) ; un viewport en échec
 * n'empêche pas le suivant ; les contextes ouverts ici sont fermés ici.
 *
 * Le robot reste sur le site scanné : une page qui, après son chargement,
 * emmène le navigateur hors origine n'est ni extraite ni remplie.
 */
import { errors, type Browser, type BrowserContext, type Page } from 'playwright';
import type {
  Action,
  ActionExecutee,
  ActionProposee,
  ContexteDecision,
  ContexteExploration,
  DecisionPrise,
  LocalisationElement,
  Observateur,
  PageVisitee,
  Parcours,
  PolitiqueDecision,
  ProfilSiteRapporte,
  ResultatAction,
  TypeAction,
  Viewport,
} from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { creerContexte, NOM_TAMPON } from '../navigateur.js';
import { composerContexteProfilage, type CollecteProfilage, type ExplorateurProfilant } from '../profilage.js';
import { brancherPage, type OptionsFenetre, type PageBranchee } from '../observation/observateur.js';
import {
  derniereMutation,
  etatsImages,
  extrairePage,
  extraireTexte,
  lireMutations,
  recouvrements,
  sousDelai,
  validiteFormulaire,
  viderMutations,
} from './en-page.js';
import {
  actionEnumeree,
  COUCHE_ENUMERATION,
  COUCHE_FILTRE_DESTRUCTIF,
  COUCHE_MENU_FERME,
  EVENEMENT_COUCHE,
  filtrerMenuFerme,
} from './couches.js';
import { cheminDe, composerEtat, enumererActions, libelleBorne } from './enumeration.js';
import { RAISON_LECTURE_IMPOSSIBLE, type FiltreActions, type VerdictFiltre } from './filtre-actions.js';
import { ROBOTS_PERMISSIF, chargerRobots, recupererParReseau, type RecupererRobots } from '../politesse/robots.js';

export interface DependancesExplorateur {
  config: ConfigScanner;
  /** Politique DEMANDÉE (déterministe ou IA) : c'est elle qu'on interroge à chaque point de décision. */
  politique: PolitiqueDecision;
  /**
   * Politique de SECOURS du moteur, toujours la déterministe. Elle n'est pas
   * le repli par décision de la politique IA (celui-là vit dans `politique-ia.ts`) :
   * c'est le filet de la COUCHE 1 — ce que le moteur fait quand une politique,
   * quelle qu'elle soit, lui rend une action qui n'était pas énumérée.
   */
  secours: PolitiqueDecision;
  filtre: FiltreActions;
  navigateur: Browser;
  /**
   * Récupération du `robots.txt`, HORS du contexte navigateur observé. Absente :
   * la récupération réseau réelle. Les tests en fournissent une, et aucun
   * n'appelle le réseau.
   */
  recupererRobots?: RecupererRobots;
  /**
   * Temporisation de la politesse entre deux pages. Injectable pour que les
   * tests OBSERVENT l'attente au lieu de la CHRONOMÉTRER : un seuil de durée
   * sous contention n'est pas une assertion, c'est un pari.
   */
  attendre?: (delaiMs: number) => Promise<void>;
}

type Arret = Parcours['arret'];

/** Priorité des raisons d'arrêt quand les viewports divergent. */
const PRIORITE_ARRET: Arret[] = ['echeance', 'erreur', 'limite-pages', 'complet'];

const RAISON_ECHEANCE = 'echeance';

/**
 * Raison technique stable : une politique a rendu une action qui n'était PAS
 * énumérée. La COUCHE 1 l'a arrêtée — l'action n'est pas exécutée, la
 * décision est reprise par la politique de secours.
 */
export const RAISON_HORS_ENUMERATION = 'action-hors-enumeration';

/** Types d'entrée de journal de la décision. */
export const EVENEMENT_ENUMERATION = 'decision.enumeration';
export const EVENEMENT_DECISION = 'decision';

/** Raisons techniques d'une action `bloquee` (identifiants stables, journalisés). */
export const RAISON_AUCUN_DECLENCHEUR = 'aucun-declencheur';
export const RAISON_VALIDATION_NATIVE = 'validation-native';
export const RAISON_CLIC_INTERCEPTE = 'clic-intercepte';

/** Fragment de journal Playwright signalant un clic intercepté (contrat technique de l'outil, pas un texte de page). */
export const MARQUE_INTERCEPTION = 'intercepts pointer events';

/**
 * Types de champ qui « bloquent la soumission implicite » (standard HTML) :
 * sans bouton de soumission, la touche Entrée ne soumet que si le formulaire
 * en compte exactement un.
 */
export const TYPES_SOUMISSION_IMPLICITE = ['text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'month', 'week', 'time', 'datetime-local'];

/**
 * URL normalisée pour la file d'exploration, ou null si elle n'est pas à
 * suivre : même origine que le départ, http(s) seulement, sans fragment,
 * slash final retiré (sauf racine) comme le fait le banc.
 */
export function normaliserUrl(brute: string, origine: string): string | null {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== origine) {
    return null;
  }
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.href;
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

function plusPrioritaire(a: Arret, b: Arret): Arret {
  return PRIORITE_ARRET.indexOf(a) <= PRIORITE_ARRET.indexOf(b) ? a : b;
}

interface EtatViewport {
  viewport: Viewport;
  page: Page;
  branchee: PageBranchee;
  /** URL normalisée → profondeur, pour toute URL connue (visitée ou en attente). */
  profondeurs: Map<string, number>;
  enAttente: string[];
  /** URL demandées, finales ou interdites : jamais reproposées. */
  urlsConnues: Set<string>;
  /** URL finales effectivement chargées : c'est ce que borne `pagesMax`. */
  pagesVisitees: Set<string>;
  /** Nombre de retours sur une page quittée par une soumission, par URL. */
  revisites: Map<string, number>;
  pageCourante: PageVisitee;
  /**
   * Clés `url|selecteur` des formulaires remplis / soumis dans ce viewport. Un
   * formulaire soumis n'est jamais reproposé ; un remplissage est oublié dès
   * que le document est rechargé (les valeurs saisies ne survivent pas).
   */
  formulairesRemplis: Set<string>;
  formulairesSoumis: Set<string>;
  /**
   * Libellés visibles des liens, par URL normalisée. CONTENU DE PAGE, donc
   * DONNÉE NON FIABLE (constitution §3) : transporté jusqu'à l'énumération,
   * borné, jamais interprété. Il ne voyage PAS dans le `Parcours` — le
   * rapport n'a que faire du texte des liens, et `core/types.ts` n'a pas à
   * bouger pour un besoin interne à l'exploration.
   */
  libelles: Map<string, string>;
  /** Historique court des actions exécutées dans ce viewport (type + chemin). */
  historique: { type: TypeAction; page: string }[];
}

function cleFormulaire(url: string, selecteur: string): string {
  return `${url}|${selecteur}`;
}

/** Sélecteurs des formulaires de `url` présents dans l'ensemble de clés. */
function selecteursDe(cles: Set<string>, url: string): string[] {
  const prefixe = `${url}|`;
  return [...cles].filter((cle) => cle.startsWith(prefixe)).map((cle) => cle.slice(prefixe.length));
}

/** Le document de `url` vient d'être rechargé : les formulaires non soumis y sont à remplir de nouveau. */
function oublierRemplissages(etat: EtatViewport, url: string): void {
  for (const selecteur of selecteursDe(etat.formulairesRemplis, url)) {
    const cle = cleFormulaire(url, selecteur);
    if (!etat.formulairesSoumis.has(cle)) {
      etat.formulairesRemplis.delete(cle);
    }
  }
}

/** Raisons techniques de ne pas avoir extrait le texte de profilage. */
export const PROFILAGE_PAGE_NON_CHARGEE = 'page-non-chargee';
export const PROFILAGE_PAGE_EXTERNE = 'page-externe';

export function creerExplorateur(dependances: DependancesExplorateur): ExplorateurProfilant {
  const { config, politique, secours, filtre, navigateur } = dependances;
  const { exploration, politesse } = config;
  const recupererRobots =
    dependances.recupererRobots ??
    recupererParReseau(config.robot.userAgent, { nom: config.robot.enTete, valeur: config.robot.valeurEnTete }, exploration.chargementPageMs);
  const attendre = dependances.attendre ?? ((delaiMs: number) => new Promise<void>((resoudre) => setTimeout(resoudre, delaiMs)));

  return {
    nom: 'explorateur-deterministe',

    async explorer(contexte: ContexteExploration, observateur: Observateur, collecte?: CollecteProfilage): Promise<Parcours> {
      const parcours: Parcours = { urlDepart: contexte.urlDepart, pages: [], actions: [], arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 };
      const origine = new URL(contexte.urlDepart).origin;
      // L'URL de départ obéit à la même règle que les liens suivis (http(s)) :
      // le navigateur ne charge jamais un fichier local ni une URL de données.
      const departNormalise = normaliserUrl(contexte.urlDepart, origine);
      if (departNormalise === null) {
        contexte.journaliser('exploration.url.refusee', { url: contexte.urlDepart });
        parcours.arret = 'erreur';
        contexte.journaliser('exploration.fin', { arret: parcours.arret, pages: 0, actions: 0 });
        return parcours;
      }
      const depart: string = departNormalise;

      // LA POLITESSE, AVANT LA PREMIÈRE PAGE. Un site qui nous interdit un
      // chemin est un site qu'on n'audite pas en douce, et l'interdit vaut
      // pour l'URL de départ comme pour les liens suivis.
      const robots = politesse.respecterRobotsTxt
        ? await chargerRobots(origine, config.robot.userAgent, recupererRobots, contexte.journaliser)
        : ROBOTS_PERMISSIF;
      /** Le chemin nu d'une URL : c'est sur lui que `robots.txt` se prononce. */
      const cheminInterrogeable = (url: string): string => {
        try {
          const analysee = new URL(url);
          return `${analysee.pathname}${analysee.search}`;
        } catch {
          return url;
        }
      };
      const autorise = (url: string): boolean => robots.estAutorise(cheminInterrogeable(url));

      /**
       * UNE SORTIE DE PÉRIMÈTRE, TOUJOURS DITE DE LA MÊME FAÇON.
       *
       * Nous n'auditons pas l'autre site — mais qu'une page À NOUS renvoie
       * ailleurs est un fait du site scanné, et le rapport doit pouvoir le
       * dire un jour. Encore faut-il savoir LAQUELLE de nos pages en sort.
       *
       * Les trois chemins qui mènent hors origine — la redirection au
       * chargement, la dérive APRÈS chargement, la navigation provoquée par
       * une action — journalisaient le même événement sous trois formes
       * différentes, où `url` désignait tantôt la source et tantôt la
       * destination. Un consommateur du journal ne pouvait pas les distinguer,
       * et un contrat faux est cru (APPRENTISSAGES n°6). Une seule fonction,
       * deux champs qui ne se confondent pas.
       */
      function journaliserSortie(viewport: string, depuis: string, vers: string): void {
        contexte.journaliser('exploration.page.externe', { viewport, depuis, vers });
      }
      if (!autorise(depart)) {
        contexte.journaliser('exploration.robots.refus', { url: depart, depart: true });
        parcours.arret = 'erreur';
        contexte.journaliser('exploration.fin', { arret: parcours.arret, pages: 0, actions: 0 });
        return parcours;
      }

      let compteurActions = 0;
      const prochainId = (): string => {
        compteurActions += 1;
        return `a${compteurActions}`;
      };

      const echeanceProche = (): boolean => Date.now() + exploration.margeEcheanceMs >= contexte.echeance;
      /** Budget en ms avant l'échéance (marge déduite), borné par `max`. */
      const budget = (max: number): number => Math.max(1, Math.min(max, contexte.echeance - exploration.margeEcheanceMs - Date.now()));
      /** Délai d'une évaluation en page. */
      const delai = (): number => budget(exploration.evaluationMs);
      const optionsFenetre = (): OptionsFenetre => ({
        stabilisationMs: exploration.stabilisationMs,
        plafondMs: budget(exploration.attenteEffetMaxMs),
        sondageMs: exploration.sondageMs,
      });

      let actionCourante: string | undefined;
      /** Le profilage n'est TENTÉ qu'une fois par scan : au premier viewport. */
      let profilageTente = false;
      /**
       * Profil du site, une fois produit. Il ENTRE dans les décisions de
       * navigation comme DONNÉE NON FIABLE (cahier 4b, note 2) : c'est une
       * sortie de notre propre IA, mais une sortie de modèle reste du contenu
       * dérivé de la page. Absent tant que le profilage n'a pas répondu, et
       * absent pour toujours en mode dégradé : la navigation décide alors sans.
       */
      let profilSite: ProfilSiteRapporte | null = null;

      function enregistrer(
        etat: EtatViewport,
        id: string,
        action: Action,
        pageAvant: string,
        debut: string,
        resultat: ResultatAction,
        details?: unknown,
        decision?: ActionExecutee['decision'],
      ): void {
        const executee: ActionExecutee = {
          id,
          action,
          page: pageAvant,
          viewport: etat.viewport.nom,
          debut,
          fin: new Date().toISOString(),
          resultat,
          ...(details === undefined ? {} : { details }),
          // La traçabilité descend jusqu'à l'ACTE : qui a tranché, d'où vient
          // la décision, et si c'est un repli, pourquoi.
          ...(decision === undefined ? {} : { decision }),
        };
        parcours.actions.push(executee);
        etat.historique.push({ type: action.type, page: cheminDe(pageAvant, origine) });
        contexte.journaliser('action', { id, type: action.type, resultat, page: pageAvant, viewport: etat.viewport.nom, details, ...(decision === undefined ? {} : { decision }) });
      }

      /**
       * Une navigation du cadre principal est partie sans aboutir (serveur
       * muet) : tant qu'elle est pendante, toute évaluation en page reste
       * suspendue. La revenir sur `url` l'annule (le document est rechargé).
       */
      async function abandonnerNavigation(etat: EtatViewport, url: string): Promise<void> {
        if (!etat.branchee.navigationEnCours()) {
          return;
        }
        contexte.journaliser('navigation.abandonnee', { viewport: etat.viewport.nom, page: url });
        await etat.page.goto(url, { waitUntil: 'load', timeout: budget(exploration.chargementPageMs) }).catch(() => undefined);
        oublierRemplissages(etat, url);
      }

      async function visiter(etat: EtatViewport, urlDemandee: string, profondeur: number): Promise<PageVisitee> {
        const { page, viewport } = etat;
        // LA POLITESSE ENTRE DEUX PAGES. Nulle au banc, qui se sert lui-même ;
        // sur le réel, un parcours en rafale depuis une IP est un profil
        // d'attaque pour un pare-feu applicatif — et le premier blocage que
        // rencontrera le bestiaire.
        if (politesse.delaiEntrePagesMs > 0) {
          await attendre(politesse.delaiEntrePagesMs);
        }
        let statutHttp: number | null = null;
        let chargee = false;
        try {
          const reponse = await page.goto(urlDemandee, { waitUntil: 'load', timeout: budget(exploration.chargementPageMs) });
          statutHttp = reponse?.status() ?? null;
          chargee = true;
        } catch (erreur: unknown) {
          contexte.journaliser('exploration.page.echec', { viewport: viewport.nom, url: urlDemandee, erreur: messageErreur(erreur) });
        }
        // Une redirection hors origine n'est ni extraite ni remplie : le robot reste sur le site scanné.
        const urlInterne = chargee ? normaliserUrl(page.url(), origine) : null;
        let urlFinale = urlInterne ?? (chargee ? page.url() : urlDemandee);
        const connaitre = (url: string): void => {
          etat.urlsConnues.add(url);
          etat.enAttente = etat.enAttente.filter((candidate) => candidate !== url);
          if (!etat.profondeurs.has(url)) {
            etat.profondeurs.set(url, profondeur);
          }
        };
        connaitre(urlDemandee);
        connaitre(urlFinale);

        let liensInternes: string[] = [];
        let formulaires: PageVisitee['formulaires'] = [];
        if (chargee && urlInterne === null) {
          journaliserSortie(viewport.nom, urlDemandee, urlFinale);
        } else if (chargee) {
          oublierRemplissages(etat, urlFinale);
          const extraction = await extraireApresStabilite(etat, urlFinale);
          if (extraction.url !== null && extraction.url !== urlFinale) {
            urlFinale = extraction.url;
            connaitre(urlFinale);
          }
          formulaires = extraction.formulaires;
          liensInternes = extraction.liensInternes;
        }
        if (chargee) {
          etat.pagesVisitees.add(urlFinale);
        }
        const pageVisitee: PageVisitee = {
          url: urlFinale,
          viewport: viewport.nom,
          statutHttp,
          liensInternes,
          formulaires,
          horodatage: new Date().toISOString(),
        };
        parcours.pages.push(pageVisitee);
        contexte.journaliser('exploration.page', {
          viewport: viewport.nom,
          url: urlFinale,
          statutHttp,
          liens: liensInternes.length,
          formulaires: formulaires.length,
        });
        enfiler(etat, liensInternes, profondeur);
        return pageVisitee;
      }

      function enfiler(etat: EtatViewport, liensInternes: string[], profondeur: number): void {
        if (profondeur >= exploration.profondeurMax) {
          return;
        }
        for (const lien of liensInternes) {
          if (etat.profondeurs.has(lien)) {
            continue;
          }
          // Le chemin interdit n'entre pas dans la file : il ne sera donc
          // jamais énuméré, jamais proposé au modèle, jamais visité. Filtrer
          // ici plutôt qu'au chargement évite d'avoir à refuser une action
          // qu'on aurait soi-même offerte.
          if (!autorise(lien)) {
            contexte.journaliser('exploration.robots.refus', { url: lien, depart: false });
            continue;
          }
          etat.profondeurs.set(lien, profondeur + 1);
          etat.enAttente.push(lien);
        }
      }

      /**
       * Attend la stabilité de la page chargée, vérifie qu'elle est toujours sur
       * le site (une page peut naviguer APRÈS `load` : meta refresh, script),
       * puis extrait liens/formulaires et émet les signaux de page. Rend l'URL
       * interne effective (null si la page est partie hors origine). Une page
       * qui refuse l'extraction (contexte détruit, script bloqué, page muette)
       * est enregistrée vide : l'exploration continue.
       */
      async function extraireApresStabilite(
        etat: EtatViewport,
        url: string,
      ): Promise<{ url: string | null; liensInternes: string[]; formulaires: PageVisitee['formulaires'] }> {
        const { page, branchee, viewport } = etat;
        try {
          await branchee.attendreStabilite(optionsFenetre(), () => derniereMutation(page, NOM_TAMPON, delai()));
          await abandonnerNavigation(etat, url);
          const urlActuelle = normaliserUrl(page.url(), origine);
          if (urlActuelle === null) {
            journaliserSortie(viewport.nom, url, page.url());
            return { url: null, liensInternes: [], formulaires: [] };
          }
          if (urlActuelle !== url) {
            contexte.journaliser('exploration.page.redirigee', { viewport: viewport.nom, de: url, vers: urlActuelle });
          }
          const extraction = await extrairePage(page, delai());
          const normalises = extraction.liens.map((lien) => normaliserUrl(lien, origine));
          // Le libellé d'un lien est retenu à sa PREMIÈRE apparition et borné
          // tout de suite : le texte de la page n'entre jamais non borné dans
          // la mémoire du scan.
          normalises.forEach((lien, rang) => {
            if (lien === null || etat.libelles.has(lien)) {
              return;
            }
            const libelle = libelleBorne(extraction.libellesLiens[rang], exploration.libelleMaxChars);
            if (libelle !== null) {
              etat.libelles.set(lien, libelle);
            }
          });
          const liensInternes = [...new Set(normalises.filter((lien): lien is string => lien !== null))];
          if (liensInternes.length > exploration.liensParPageMax) {
            contexte.journaliser('exploration.liens.tronques', { viewport: viewport.nom, url: urlActuelle, liens: liensInternes.length, max: exploration.liensParPageMax });
            liensInternes.length = exploration.liensParPageMax;
          }
          if (extraction.champsIgnores > 0) {
            contexte.journaliser('exploration.champs.ignores', { viewport: viewport.nom, url: urlActuelle, champs: extraction.champsIgnores });
          }
          await emettreSignauxDePage(etat, urlActuelle);
          return { url: urlActuelle, liensInternes, formulaires: extraction.formulaires };
        } catch (erreur: unknown) {
          contexte.journaliser('exploration.page.echec', { viewport: viewport.nom, url, erreur: messageErreur(erreur) });
          return { url, liensInternes: [], formulaires: [] };
        }
      }

      /** Signaux constatés au chargement d'une page : état des images, recouvrement des éléments interactifs (borné). */
      async function emettreSignauxDePage(etat: EtatViewport, url: string): Promise<void> {
        const { page, viewport } = etat;
        const horodatage = new Date().toISOString();
        for (const image of await etatsImages(page, delai())) {
          observateur.emettre({ type: 'etat-image', horodatage, page: url, viewport: viewport.nom, ...image });
        }
        const geometrie = await recouvrements(page, { max: exploration.elementsInteractifsMax, budgetMs: delai() });
        if (geometrie.tronque) {
          contexte.journaliser('exploration.geometrie.tronquee', { viewport: viewport.nom, url, examines: geometrie.examines });
        }
        for (const constat of geometrie.recouvrements) {
          observateur.emettre({ type: 'interception-clic', horodatage, page: url, viewport: viewport.nom, ...constat, source: 'geometrie' });
        }
      }

      /** Après une action qui a fait naviguer la page : la nouvelle URL devient la page courante. */
      async function adopterPageCourante(etat: EtatViewport): Promise<void> {
        const urlInterne = normaliserUrl(etat.page.url(), origine);
        let url = urlInterne ?? etat.page.url();
        const profondeur = etat.profondeurs.get(url) ?? (etat.profondeurs.get(etat.pageCourante.url) ?? 0) + 1;
        etat.profondeurs.set(url, profondeur);
        etat.urlsConnues.add(url);
        etat.enAttente = etat.enAttente.filter((candidate) => candidate !== url);
        let liensInternes: string[] = [];
        let formulaires: PageVisitee['formulaires'] = [];
        if (urlInterne === null) {
          journaliserSortie(etat.viewport.nom, etat.pageCourante.url, url);
        } else {
          oublierRemplissages(etat, url);
          const extraction = await extraireApresStabilite(etat, url);
          if (extraction.url !== null) {
            url = extraction.url;
            etat.urlsConnues.add(url);
            etat.profondeurs.set(url, etat.profondeurs.get(url) ?? profondeur);
            etat.pagesVisitees.add(url);
          }
          ({ liensInternes, formulaires } = extraction);
        }
        const statutHttp = etat.branchee.statutDocument();
        etat.pageCourante = {
          url,
          viewport: etat.viewport.nom,
          statutHttp,
          liensInternes,
          formulaires,
          horodatage: new Date().toISOString(),
        };
        parcours.pages.push(etat.pageCourante);
        contexte.journaliser('exploration.page', {
          viewport: etat.viewport.nom,
          url,
          statutHttp,
          liens: liensInternes.length,
          formulaires: formulaires.length,
          apresAction: true,
        });
        enfiler(etat, liensInternes, profondeur);
      }

      /**
       * Une soumission a emmené le navigateur ailleurs alors que la page quittée
       * a encore des formulaires non soumis : elle est remise en tête de file
       * pour y revenir. Au plus autant de retours que de formulaires (des
       * sélecteurs régénérés à chaque chargement ne bouclent pas).
       */
      function programmerRevisite(etat: EtatViewport, pageQuittee: PageVisitee): void {
        const url = pageQuittee.url;
        if (etat.pageCourante.url === url || etat.enAttente.includes(url)) {
          return;
        }
        const nonSoumis = pageQuittee.formulaires.filter((f) => !etat.formulairesSoumis.has(cleFormulaire(url, f.localisation.selecteur)));
        const retours = etat.revisites.get(url) ?? 0;
        if (nonSoumis.length === 0 || retours >= pageQuittee.formulaires.length) {
          return;
        }
        etat.revisites.set(url, retours + 1);
        etat.enAttente.unshift(url);
        contexte.journaliser('exploration.page.revisite', { viewport: etat.viewport.nom, url, formulairesRestants: nonSoumis.length });
      }

      async function executer(etat: EtatViewport, action: Action): Promise<{ resultat: ResultatAction; details?: unknown }> {
        const { page } = etat;
        switch (action.type) {
          case 'naviguer': {
            etat.enAttente = etat.enAttente.filter((candidate) => candidate !== action.url);
            etat.pageCourante = await visiter(etat, action.url, etat.profondeurs.get(action.url) ?? 0);
            return { resultat: etat.pageCourante.statutHttp === null ? 'echec' : 'ok' };
          }
          case 'remplir': {
            etat.formulairesRemplis.add(cleFormulaire(etat.pageCourante.url, action.formulaire.selecteur));
            const echecs: string[] = [];
            let interrompu = false;
            for (const { champ, valeur } of action.valeurs) {
              // Chaque champ non éditable coûte tout le délai de saisie : la saisie respecte l'échéance.
              if (echeanceProche()) {
                interrompu = true;
                break;
              }
              try {
                if (champ.balise === 'select') {
                  await page.selectOption(champ.selecteur, { value: valeur }, { timeout: budget(exploration.saisieMs) });
                } else {
                  await page.fill(champ.selecteur, valeur, { timeout: budget(exploration.saisieMs) });
                }
              } catch (erreur: unknown) {
                echecs.push(`${champ.selecteur}: ${messageErreur(erreur)}`);
              }
            }
            if (echecs.length === 0 && !interrompu) {
              return { resultat: 'ok' };
            }
            return { resultat: 'echec', details: { ...(echecs.length > 0 ? { echecs } : {}), ...(interrompu ? { interrompu } : {}) } };
          }
          case 'soumettre': {
            etat.formulairesSoumis.add(cleFormulaire(etat.pageCourante.url, action.formulaire.selecteur));
            return soumettre(etat, action.declencheur, action.formulaire);
          }
          case 'terminer':
            return { resultat: 'ok' };
        }
      }

      async function soumettre(
        etat: EtatViewport,
        declencheur: LocalisationElement | null,
        formulaire: LocalisationElement,
      ): Promise<{ resultat: ResultatAction; details?: unknown }> {
        const { page, viewport } = etat;
        // Validation native (Constraint Validation API) : un formulaire que le
        // navigateur refuserait de soumettre n'est pas cliqué — l'absence
        // d'effet serait celle du robot (remplissage insuffisant), pas du site.
        const validite = await validiteFormulaire(page, formulaire.selecteur, declencheur?.selecteur ?? null, delai()).catch(() => null);
        if (validite !== null && validite.validationActive && validite.champsInvalides.length > 0) {
          return { resultat: 'bloquee', details: { raison: RAISON_VALIDATION_NATIVE, champsInvalides: validite.champsInvalides } };
        }
        if (declencheur === null) {
          const bloquants = etat.pageCourante.formulaires
            .find((f) => f.localisation.selecteur === formulaire.selecteur)
            ?.champs.filter((c) => TYPES_SOUMISSION_IMPLICITE.includes(c.type));
          const champ = bloquants?.length === 1 ? bloquants[0] : undefined;
          if (champ === undefined) {
            return { resultat: 'bloquee', details: { raison: RAISON_AUCUN_DECLENCHEUR, champsBloquants: bloquants?.length ?? 0 } };
          }
          try {
            // `noWaitAfter` : la frappe est constatée, la navigation qu'elle
            // déclenche est observée par la fenêtre d'effet, pas par l'action.
            await page.press(champ.localisation.selecteur, 'Enter', { timeout: budget(exploration.clicMs), noWaitAfter: true });
            return { resultat: 'ok', details: { soumissionImplicite: champ.localisation.selecteur } };
          } catch (erreur: unknown) {
            return { resultat: 'echec', details: { erreur: messageErreur(erreur) } };
          }
        }
        // Géométrie juste avant le clic : qualifie un échec de clic comme interception.
        let intercepteur: LocalisationElement | null = null;
        let couvert = false;
        try {
          const constat = await recouvrements(page, { selecteur: declencheur.selecteur, max: 1, budgetMs: delai() });
          couvert = constat.recouvrements.length > 0;
          intercepteur = constat.recouvrements[0]?.intercepteur ?? null;
        } catch {
          // Géométrie indisponible : le clic tranchera.
        }
        try {
          // `noWaitAfter` : sans lui, un formulaire natif attendrait la réponse du
          // serveur dans le délai du clic (`clicMs` ne mesure que l'actionnabilité).
          await page.click(declencheur.selecteur, { timeout: budget(exploration.clicMs), noWaitAfter: true });
          return { resultat: 'ok' };
        } catch (erreur: unknown) {
          const expire = erreur instanceof errors.TimeoutError;
          if (expire && (couvert || messageErreur(erreur).includes(MARQUE_INTERCEPTION))) {
            observateur.emettre({
              type: 'interception-clic',
              horodatage: new Date().toISOString(),
              page: etat.pageCourante.url,
              viewport: viewport.nom,
              actionId: actionCourante,
              element: declencheur,
              intercepteur,
              source: 'clic',
            });
            return { resultat: 'bloquee', details: { raison: RAISON_CLIC_INTERCEPTE } };
          }
          return { resultat: 'echec', details: { erreur: messageErreur(erreur) } };
        }
      }

      /**
       * La visite de l'URL de départ est une action `naviguer` comme les
       * autres (fenêtre d'effet, signaux liés) : la page d'entrée est observée
       * avec la même règle que toute page atteinte ensuite. Elle n'est pas
       * soumise au filtre d'actions : c'est l'URL demandée par l'opérateur.
       */
      async function visiterDepart(etat: EtatViewport): Promise<void> {
        const id = prochainId();
        const debut = new Date().toISOString();
        const action: Action = { type: 'naviguer', url: depart };
        actionCourante = id;
        try {
          etat.branchee.ouvrirFenetre();
          const { resultat } = await executer(etat, action);
          await etat.branchee.attendreEffets({
            ...optionsFenetre(),
            actionId: id,
            derniereMutation: () => derniereMutation(etat.page, NOM_TAMPON, delai()),
            lireMutations: () => lireMutations(etat.page, NOM_TAMPON, null, delai()),
          });
          enregistrer(etat, id, action, action.url, debut, resultat);
        } finally {
          actionCourante = undefined;
        }
        await abandonnerNavigation(etat, etat.pageCourante.url);
        await capturerProfilage(etat);
      }

      /**
       * Texte de la page de départ pour le profilage IA : UNE FOIS par scan,
       * au PREMIER viewport, sur la page DÉJÀ CHARGÉE et stabilisée — jamais
       * un second chargement, qui coûterait une navigation et pourrait ne pas
       * rendre la même page.
       *
       * Ce qui en sort est une DONNÉE NON FIABLE (constitution §3) : du texte,
       * pas de balisage, et rien n'en est interprété ici. Un échec d'extraction
       * n'est jamais fatal : le scan continue sans profil, le journal dit
       * pourquoi.
       */
      async function capturerProfilage(etat: EtatViewport): Promise<void> {
        if (collecte === undefined || profilageTente) {
          return;
        }
        profilageTente = true;
        const viewport = etat.viewport.nom;
        if (etat.pageCourante.statutHttp === null) {
          contexte.journaliser('profilage.extraction.ignoree', { viewport, url: depart, raison: PROFILAGE_PAGE_NON_CHARGEE });
          return;
        }
        const url = normaliserUrl(etat.page.url(), origine);
        if (url === null) {
          contexte.journaliser('profilage.extraction.ignoree', { viewport, url: etat.page.url(), raison: PROFILAGE_PAGE_EXTERNE });
          return;
        }
        try {
          const extraction = await extraireTexte(etat.page, collecte.bornes.maxChars, delai());
          const contexteProfilage = composerContexteProfilage(url, extraction, collecte.bornes);
          // L'appel a lieu ICI, pendant l'exploration : la brique 4b le
          // consomme, il ne peut donc plus attendre la fin du parcours.
          profilSite = await collecte.proposer(contexteProfilage);
          contexte.journaliser('profilage.extraction', {
            viewport,
            url,
            nbChars: contexteProfilage.texte.length,
            tronque: extraction.tronque || contexteProfilage.texte.length >= collecte.bornes.maxChars,
            // Distinct du drapeau ci-dessus : « le corps a été RACCOURCI »
            // n'est pas « le contexte est plein ». Sans ce second signal, un
            // corps rogné par des en-têtes volumineux serait indiscernable
            // d'une page simplement bavarde (APPRENTISSAGES n°6).
            corpsRaccourci: !contexteProfilage.texte.endsWith(extraction.texteVisible),
            langueDeclaree: contexteProfilage.langueDeclaree,
            metadonnees: Object.keys(extraction.metadonnees),
          });
        } catch (erreur: unknown) {
          contexte.journaliser('profilage.extraction.echec', { viewport, url, erreur: messageErreur(erreur) });
        }
      }

      async function explorerViewport(viewport: Viewport): Promise<Arret> {
        contexte.journaliser('exploration.viewport', { viewport: viewport.nom });
        let contexteNavigateur: BrowserContext | undefined;
        let branchee: PageBranchee | undefined;
        try {
          contexteNavigateur = await creerContexte(navigateur, config, viewport);
          const page = await contexteNavigateur.newPage();
          branchee = brancherPage(page, {
            observateur,
            viewport: viewport.nom,
            origine,
            actionCouranteId: () => actionCourante,
            pageCourante: () => page.url(),
          });
          if (echeanceProche()) {
            return 'echeance';
          }
          // Un seul objet d'état, muté par `visiter` (file, profondeurs) : jamais copié.
          const etat: EtatViewport = {
            viewport,
            page,
            branchee,
            profondeurs: new Map([[depart, 0]]),
            enAttente: [],
            urlsConnues: new Set(),
            pagesVisitees: new Set(),
            revisites: new Map(),
            formulairesRemplis: new Set(),
            formulairesSoumis: new Set(),
            libelles: new Map(),
            historique: [],
            pageCourante: { url: depart, viewport: viewport.nom, statutHttp: null, liensInternes: [], formulaires: [], horodatage: new Date().toISOString() },
          };
          await visiterDepart(etat);
          return await boucleDecision(etat);
        } finally {
          branchee?.debrancher();
          await contexteNavigateur?.close().catch(() => undefined);
        }
      }

      /**
       * UN point de décision, de bout en bout, avec ses trois couches.
       *
       * Ordre non négociable : le moteur ÉNUMÈRE (couche 1), le menu fermé
       * écarte ce qui n'est pas au vocabulaire (couche 2), la politique élit,
       * et le filtre d'actions destructives passe APRÈS — dans la boucle
       * appelante, jamais ici. Filtrer l'énumération plutôt que la décision
       * ferait disparaître du journal le fait qu'une action destructive a été
       * ÉLUE : on saurait que rien n'a été fait, jamais ce qui a été voulu.
       *
       * L'action exécutée est celle que le MOTEUR a énumérée, pas celle que la
       * politique a rendue. C'est ce qui fait de l'énumération une couche de
       * sécurité et non un contrat de bonne foi : une action forgée n'a
       * aucun chemin jusqu'à l'exécution, même si le modèle la nomme.
       */
      async function deciderProchaineAction(
        etat: EtatViewport,
        limiteAtteinte: boolean,
      ): Promise<{ action: Action; decision: DecisionPrise; proposee: ActionProposee | undefined }> {
        const viewport = etat.viewport.nom;
        const page = cheminDe(etat.pageCourante.url, origine);
        const contexteDecision: ContexteDecision = {
          pageCourante: etat.pageCourante,
          formulairesRemplis: selecteursDe(etat.formulairesRemplis, etat.pageCourante.url),
          formulairesSoumis: selecteursDe(etat.formulairesSoumis, etat.pageCourante.url),
          urlsEnAttente: limiteAtteinte ? [] : [...etat.enAttente],
          nbPagesVisitees: etat.pagesVisitees.size,
        };
        const { retenues, ecartees } = filtrerMenuFerme(
          enumererActions(contexteDecision, {
            remplissage: config.remplissage,
            libelleMaxChars: exploration.libelleMaxChars,
            origine,
            libelles: etat.libelles,
            soumission: config.interaction.soumission,
          }),
        );
        for (const ecartee of ecartees) {
          contexte.journaliser(EVENEMENT_COUCHE, { couche: COUCHE_MENU_FERME, viewport, page, actionId: ecartee.proposition.id, type: ecartee.type });
        }
        const etatEnumere = composerEtat({
          url: etat.pageCourante.url,
          origine,
          viewport,
          profil: profilSite,
          actions: retenues,
          historique: etat.historique,
          historiqueMaxActions: exploration.historiqueMaxActions,
          nbPagesVisitees: etat.pagesVisitees.size,
          pagesRestantes: exploration.pagesMax - etat.pagesVisitees.size,
        });
        contexte.journaliser(EVENEMENT_ENUMERATION, {
          viewport,
          page,
          politique: politique.nom,
          nbActions: retenues.length,
          types: retenues.map((proposee) => proposee.type),
          pagesRestantes: etatEnumere.pagesRestantes,
          profil: profilSite === null ? null : profilSite.typeSite,
        });

        let decision: DecisionPrise;
        try {
          decision = await politique.decider(contexteDecision, etatEnumere);
        } catch (erreur: unknown) {
          contexte.journaliser('decision.erreur', { viewport, page, politique: politique.nom, erreur: messageErreur(erreur) });
          decision = { ...(await secours.decider(contexteDecision, etatEnumere)), raisonRepli: RAISON_HORS_ENUMERATION };
        }
        let retenue = actionEnumeree(decision.action, retenues);
        if (retenue === undefined) {
          contexte.journaliser(EVENEMENT_COUCHE, { couche: COUCHE_ENUMERATION, viewport, page, politique: decision.politique, type: decision.action.type });
          decision = { ...(await secours.decider(contexteDecision, etatEnumere)), raisonRepli: RAISON_HORS_ENUMERATION };
          retenue = actionEnumeree(decision.action, retenues);
        }
        if (retenue === undefined) {
          // Même le secours sort de l'énumération : rien n'est exécuté. On
          // s'arrête plutôt que de laisser passer un acte non énuméré.
          contexte.journaliser(EVENEMENT_COUCHE, { couche: COUCHE_ENUMERATION, viewport, page, politique: decision.politique, type: decision.action.type, secours: true });
          // Une décision a bien été PRISE (s'arrêter), et elle a été tranchée
          // par un repli : elle doit émettre l'entrée de décision comme toute
          // autre. Sans elle, ce point de décision serait le seul que le banc
          // ne verrait pas — et une jumelle doit lire la même source que ce
          // qu'elle garde (APPRENTISSAGES n°4).
          contexte.journaliser(EVENEMENT_DECISION, {
            viewport,
            page,
            politiqueDemandee: politique.nom,
            politique: decision.politique,
            type: 'terminer',
            raisonRepli: RAISON_HORS_ENUMERATION,
            ...(decision.provenance === undefined ? {} : { provenance: decision.provenance }),
          });
          return { action: { type: 'terminer', raison: RAISON_HORS_ENUMERATION }, decision, proposee: undefined };
        }
        contexte.journaliser(EVENEMENT_DECISION, {
          viewport,
          page,
          politiqueDemandee: politique.nom,
          politique: decision.politique,
          actionId: retenue.id,
          type: retenue.type,
          ...(decision.raisonRepli === undefined ? {} : { raisonRepli: decision.raisonRepli }),
          ...(decision.provenance === undefined ? {} : { provenance: decision.provenance }),
        });
        return { action: retenue.action, decision, proposee: retenue };
      }

      async function boucleDecision(etat: EtatViewport): Promise<Arret> {
        for (;;) {
          if (echeanceProche()) {
            contexte.journaliser('action', { type: 'terminer', raison: RAISON_ECHEANCE, viewport: etat.viewport.nom });
            return 'echeance';
          }
          if (etat.page.isClosed()) {
            // Navigateur fermé ou planté : inutile d'enchaîner des actions vouées à l'échec.
            contexte.journaliser('exploration.page.fermee', { viewport: etat.viewport.nom, page: etat.pageCourante.url });
            return 'erreur';
          }
          const limiteAtteinte = etat.pagesVisitees.size >= exploration.pagesMax;
          const { action, decision, proposee } = await deciderProchaineAction(etat, limiteAtteinte);
          if (action.type === 'terminer') {
            // L'arrêt dit l'ÉTAT RÉEL de la file au moment où il est décidé :
            // la `raison` portée par l'action énumérée décrit ce qui restait à
            // ÉNUMÉRER, pas ce qui restait à FAIRE (sous limite de pages, la
            // file est masquée à l'énumération). Publier la seule raison
            // laisserait donc lire « plus rien à faire » là où dix-neuf pages
            // attendaient — un diagnostic faux est cru (APPRENTISSAGES n°6).
            parcours.enAttenteALArret += etat.enAttente.length;
            parcours.pagesRestantesALArret += Math.max(0, exploration.pagesMax - etat.pagesVisitees.size);
            contexte.journaliser('action', {
              type: 'terminer',
              raison: action.raison,
              viewport: etat.viewport.nom,
              enAttente: etat.enAttente.length,
              pagesRestantes: Math.max(0, exploration.pagesMax - etat.pagesVisitees.size),
              decision: { politique: decision.politique, ...(decision.raisonRepli === undefined ? {} : { raisonRepli: decision.raisonRepli }) },
            });
            return limiteAtteinte && etat.enAttente.length > 0 ? 'limite-pages' : 'complet';
          }
          const tracee: ActionExecutee['decision'] = {
            politique: decision.politique,
            ...(decision.provenance === undefined ? {} : { provenance: decision.provenance }),
            ...(decision.raisonRepli === undefined ? {} : { raisonRepli: decision.raisonRepli }),
          };

          const id = prochainId();
          const debut = new Date().toISOString();
          const pageAvant = etat.pageCourante;

          // Le filtre est fermé : une action qu'il ne peut pas examiner
          // (lecture en page impossible ou trop longue) n'est pas exécutée.
          let verdict: VerdictFiltre;
          try {
            verdict = await sousDelai(filtre(action, etat.page), delai());
          } catch {
            verdict = { autorisee: false, raison: RAISON_LECTURE_IMPOSSIBLE };
          }
          if (!verdict.autorisee) {
            // Non exécutée, mais consommée : elle ne doit pas être reproposée.
            if (action.type === 'naviguer') {
              etat.enAttente = etat.enAttente.filter((candidate) => candidate !== action.url);
              etat.urlsConnues.add(action.url);
            } else if (action.type === 'soumettre') {
              etat.formulairesSoumis.add(cleFormulaire(etat.pageCourante.url, action.formulaire.selecteur));
            }
            // COUCHE 3 : le filtre d'actions destructives, TOUJOURS après la
            // décision. Le journal le dit, pour qu'on puisse démontrer — et
            // pas seulement affirmer — que c'est bien lui qui a arrêté l'acte,
            // et qu'il l'a arrêté APRÈS que l'acte a été élu.
            contexte.journaliser(EVENEMENT_COUCHE, {
              couche: COUCHE_FILTRE_DESTRUCTIF,
              viewport: etat.viewport.nom,
              page: cheminDe(pageAvant.url, origine),
              actionId: proposee?.id,
              type: action.type,
              politique: decision.politique,
              ...(verdict.canal === undefined ? {} : { canal: verdict.canal }),
              ...(verdict.categorie === undefined ? {} : { categorie: verdict.categorie }),
              ...(verdict.motif === undefined ? {} : { motif: verdict.motif }),
              ...(verdict.raison === undefined ? {} : { raison: verdict.raison }),
            });
            enregistrer(etat, id, action, pageAvant.url, debut, 'interdite', {
              couche: COUCHE_FILTRE_DESTRUCTIF,
              ...(verdict.canal === undefined ? {} : { canal: verdict.canal }),
              ...(verdict.categorie === undefined ? {} : { categorie: verdict.categorie }),
              ...(verdict.langue === undefined ? {} : { langue: verdict.langue }),
              ...(verdict.motif === undefined ? {} : { motif: verdict.motif }),
              ...(verdict.raison === undefined ? {} : { raison: verdict.raison }),
            }, tracee);
            continue;
          }

          actionCourante = id;
          let aNavigue = false;
          try {
            await viderMutations(etat.page, NOM_TAMPON, delai()).catch(() => undefined);
            etat.branchee.ouvrirFenetre();
            const { resultat, details } = await executer(etat, action);
            const selecteurZone = action.type === 'naviguer' ? null : action.formulaire.selecteur;
            const effets = await etat.branchee.attendreEffets({
              ...optionsFenetre(),
              actionId: id,
              derniereMutation: () => derniereMutation(etat.page, NOM_TAMPON, delai()),
              lireMutations: () => lireMutations(etat.page, NOM_TAMPON, selecteurZone, delai()),
            });
            enregistrer(etat, id, action, pageAvant.url, debut, resultat, details, tracee);
            aNavigue = action.type !== 'naviguer' && effets.navigation;
          } finally {
            actionCourante = undefined;
          }
          if (aNavigue) {
            await adopterPageCourante(etat);
            if (action.type === 'soumettre') {
              programmerRevisite(etat, pageAvant);
            }
          }
          await abandonnerNavigation(etat, etat.pageCourante.url);
        }
      }

      for (const viewport of config.viewports) {
        try {
          parcours.arret = plusPrioritaire(parcours.arret, await explorerViewport(viewport));
        } catch (erreur: unknown) {
          contexte.journaliser('exploration.erreur', { viewport: viewport.nom, erreur: messageErreur(erreur) });
          parcours.arret = plusPrioritaire(parcours.arret, 'erreur');
        }
      }
      contexte.journaliser('exploration.fin', { arret: parcours.arret, pages: parcours.pages.length, actions: parcours.actions.length });
      return parcours;
    },
  };
}
