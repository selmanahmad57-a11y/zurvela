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
  ContexteExploration,
  Explorateur,
  LocalisationElement,
  Observateur,
  PageVisitee,
  Parcours,
  Politique,
  ResultatAction,
  Viewport,
} from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { creerContexte, NOM_TAMPON } from '../navigateur.js';
import { brancherPage, type OptionsFenetre, type PageBranchee } from '../observation/observateur.js';
import {
  derniereMutation,
  etatsImages,
  extrairePage,
  lireMutations,
  recouvrements,
  sousDelai,
  validiteFormulaire,
  viderMutations,
} from './en-page.js';
import { RAISON_LECTURE_IMPOSSIBLE, type FiltreActions, type VerdictFiltre } from './filtre-actions.js';

export interface DependancesExplorateur {
  config: ConfigScanner;
  politique: Politique;
  filtre: FiltreActions;
  navigateur: Browser;
}

type Arret = Parcours['arret'];

/** Priorité des raisons d'arrêt quand les viewports divergent. */
const PRIORITE_ARRET: Arret[] = ['echeance', 'erreur', 'limite-pages', 'complet'];

const RAISON_ECHEANCE = 'echeance';

/** Raisons techniques d'une action `bloquee` (identifiants stables, journalisés). */
export const RAISON_AUCUN_DECLENCHEUR = 'aucun-declencheur';
export const RAISON_VALIDATION_NATIVE = 'validation-native';
export const RAISON_CLIC_INTERCEPTE = 'clic-intercepte';

/** Fragment de journal Playwright signalant un clic intercepté (contrat technique de l'outil, pas un texte de page). */
const MARQUE_INTERCEPTION = 'intercepts pointer events';

/**
 * Types de champ qui « bloquent la soumission implicite » (standard HTML) :
 * sans bouton de soumission, la touche Entrée ne soumet que si le formulaire
 * en compte exactement un.
 */
const TYPES_SOUMISSION_IMPLICITE = ['text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'month', 'week', 'time', 'datetime-local'];

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

export function creerExplorateur(dependances: DependancesExplorateur): Explorateur {
  const { config, politique, filtre, navigateur } = dependances;
  const { exploration } = config;

  return {
    nom: 'explorateur-deterministe',

    async explorer(contexte: ContexteExploration, observateur: Observateur): Promise<Parcours> {
      const parcours: Parcours = { urlDepart: contexte.urlDepart, pages: [], actions: [], arret: 'complet' };
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

      function enregistrer(etat: EtatViewport, id: string, action: Action, pageAvant: string, debut: string, resultat: ResultatAction, details?: unknown): void {
        const executee: ActionExecutee = {
          id,
          action,
          page: pageAvant,
          viewport: etat.viewport.nom,
          debut,
          fin: new Date().toISOString(),
          resultat,
          ...(details === undefined ? {} : { details }),
        };
        parcours.actions.push(executee);
        contexte.journaliser('action', { id, type: action.type, resultat, page: pageAvant, viewport: etat.viewport.nom, details });
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
          contexte.journaliser('exploration.page.externe', { viewport: viewport.nom, url: urlFinale });
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
          if (!etat.profondeurs.has(lien)) {
            etat.profondeurs.set(lien, profondeur + 1);
            etat.enAttente.push(lien);
          }
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
            contexte.journaliser('exploration.page.externe', { viewport: viewport.nom, url, vers: page.url() });
            return { url: null, liensInternes: [], formulaires: [] };
          }
          if (urlActuelle !== url) {
            contexte.journaliser('exploration.page.redirigee', { viewport: viewport.nom, de: url, vers: urlActuelle });
          }
          const extraction = await extrairePage(page, delai());
          const liensInternes = [
            ...new Set(extraction.liens.map((lien) => normaliserUrl(lien, origine)).filter((lien): lien is string => lien !== null)),
          ];
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
          contexte.journaliser('exploration.page.externe', { viewport: etat.viewport.nom, url });
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
            pageCourante: { url: depart, viewport: viewport.nom, statutHttp: null, liensInternes: [], formulaires: [], horodatage: new Date().toISOString() },
          };
          await visiterDepart(etat);
          return await boucleDecision(etat);
        } finally {
          branchee?.debrancher();
          await contexteNavigateur?.close().catch(() => undefined);
        }
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
          const action = politique.decider({
            pageCourante: etat.pageCourante,
            formulairesRemplis: selecteursDe(etat.formulairesRemplis, etat.pageCourante.url),
            formulairesSoumis: selecteursDe(etat.formulairesSoumis, etat.pageCourante.url),
            urlsEnAttente: limiteAtteinte ? [] : [...etat.enAttente],
            nbPagesVisitees: etat.pagesVisitees.size,
          });
          if (action.type === 'terminer') {
            contexte.journaliser('action', { type: 'terminer', raison: action.raison, viewport: etat.viewport.nom });
            return limiteAtteinte && etat.enAttente.length > 0 ? 'limite-pages' : 'complet';
          }

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
            enregistrer(etat, id, action, pageAvant.url, debut, 'interdite', {
              ...(verdict.canal === undefined ? {} : { canal: verdict.canal }),
              ...(verdict.categorie === undefined ? {} : { categorie: verdict.categorie }),
              ...(verdict.langue === undefined ? {} : { langue: verdict.langue }),
              ...(verdict.motif === undefined ? {} : { motif: verdict.motif }),
              ...(verdict.raison === undefined ? {} : { raison: verdict.raison }),
            });
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
            enregistrer(etat, id, action, pageAvant.url, debut, resultat, details);
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
