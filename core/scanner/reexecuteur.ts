/**
 * RE-EXÉCUTEUR : la capacité de rejouer un `ContexteReproduction` ISOLÉMENT,
 * que le protocole de confirmation consomme sans jamais toucher au
 * navigateur lui-même.
 *
 * Chaque rejeu ouvre un contexte navigateur NEUF — cache froid, stockage
 * vierge : c'est déjà la variation de contexte `contexte-neuf` du cahier —
 * puis :
 *   1. charge l'URL du représentant ;
 *   2. rejoue `actionsPrealables` dans l'ordre, chacune selon son type
 *      (c'est ici que le contexte de reproduction de la brique 2 fait sa
 *      preuve : sans le `remplir`, le `soumettre` de F01 ne veut rien dire) ;
 *   3. exécute l'action déclenchante, avec sa fenêtre d'effet ;
 *   4. rend les signaux BRUTS et le parcours — le protocole les relit avec
 *      les mêmes détecteurs qu'au premier passage. Aucune règle de détection
 *      ne vit ici.
 *
 * ÉCHEC vs NON-REPRODUCTION : un rejeu qui se déroule normalement sans rien
 * reproduire n'est PAS un échec. L'échec, c'est quand le rejeu lui-même n'a
 * pas eu lieu — et cette distinction est exactement ce que le secteur
 * confond avec un défaut du site.
 *
 * Et l'échec lui-même se scinde (`causeEchec`) : `outil` quand c'est le
 * robot qui a lâché, `reseau-site` quand c'est le SITE qui s'est tu (là, le
 * rejeu a bel et bien constaté quelque chose), `indetermine` sinon — le
 * client naturel de l'auto-diagnostic IA de la brique suivante.
 *
 * Le BUDGET est de la même famille : chaque délai du rejeu est borné par ce
 * qui reste avant l'échéance du scan, et une attente ainsi écourtée n'est
 * PAS un constat. Une tentative dont une fenêtre s'est refermée sur le
 * budget, et non sur la page, est un échec d'outillage (`budget-insuffisant`,
 * cause `outil`) : la compter comme « rien ne s'est reproduit » ferait
 * dépendre le verdict d'un défaut déterministe du temps qu'il reste.
 */
import { errors, type Browser, type BrowserContext, type Page } from 'playwright';
import type {
  Action,
  CauseEchecRejeu,
  LocalisationElement,
  Observateur,
  PageVisitee,
  Parcours,
  Reexecuteur,
  ResultatAction,
  Signal,
  Viewport,
} from '../types.js';
import type { ConfigScanner } from './config.js';
import {
  derniereMutation,
  etatsImages,
  extrairePage,
  lireMutations,
  recouvrements,
  validiteFormulaire,
  viderMutations,
} from './exploration/en-page.js';
import {
  MARQUE_INTERCEPTION,
  RAISON_CLIC_INTERCEPTE,
  TYPES_SOUMISSION_IMPLICITE,
} from './exploration/explorateur.js';
import { creerContexte, NOM_TAMPON } from './navigateur.js';
import { brancherPage, creerObservateur, type OptionsFenetre, type PageBranchee } from './observation/observateur.js';

/** Identifiants techniques stables des échecs de rejeu (journalisés). */
export const ERREUR_PAGE_INCHARGEABLE = 'page-inchargeable';
export const ERREUR_SELECTEUR_INTROUVABLE = 'selecteur-introuvable';
export const ERREUR_ACTION_IMPOSSIBLE = 'action-impossible';
export const ERREUR_DELAI_DEPASSE = 'delai-depasse';
export const ERREUR_NAVIGATEUR_PERDU = 'navigateur-perdu';
export const ERREUR_BUDGET_INSUFFISANT = 'budget-insuffisant';
export const ERREUR_URL_INVALIDE = 'url-invalide';

/** Préfixe des identifiants d'action d'un rejeu : le journal distingue un rejeu d'une exploration. */
const PREFIXE_ACTION_REJEU = 'r';

/**
 * Échec d'un rejeu, porteur de son identifiant technique ET de SA CAUSE.
 * La cause est la distinction la plus lourde de conséquences du module :
 * une page inchargeable parce que le SITE ne répond plus n'est pas une
 * limite d'automatisation, c'est peut-être l'incident le plus grave qui
 * existe — se taire là serait le pire des faux négatifs.
 */
class EchecRejeu extends Error {
  readonly identifiant: string;
  /** `cause` est déjà pris par `Error` : la cause du REJEU porte son propre nom. */
  readonly causeEchec: CauseEchecRejeu;
  constructor(identifiant: string, causeEchec: CauseEchecRejeu) {
    super(identifiant);
    this.name = 'EchecRejeu';
    this.identifiant = identifiant;
    this.causeEchec = causeEchec;
  }
}

function identifierEchec(erreur: unknown, page: Page | undefined): { erreur: string; cause: CauseEchecRejeu } {
  if (erreur instanceof EchecRejeu) {
    return { erreur: erreur.identifiant, cause: erreur.causeEchec };
  }
  if (page?.isClosed() === true) {
    return { erreur: ERREUR_NAVIGATEUR_PERDU, cause: 'outil' };
  }
  if (erreur instanceof errors.TimeoutError) {
    return { erreur: ERREUR_DELAI_DEPASSE, cause: 'indetermine' };
  }
  return { erreur: ERREUR_NAVIGATEUR_PERDU, cause: 'outil' };
}

/**
 * Le SITE a-t-il refusé de répondre au chargement ? Trois gardes, parce que
 * la réponse impute la faute et qu'une imputation fausse coûte des deux
 * côtés (un faux positif bloquant d'un côté, un silence pendant une panne de
 * l'autre) :
 * - l'échec porte sur le document du cadre PRINCIPAL — un iframe tiers (pub,
 *   chat, carte) qui échoue ne rend pas la page inchargeable ;
 * - son code d'erreur n'est pas une annulation côté client (config) — le
 *   robot qui quitte une page annule lui-même la navigation en cours ;
 * - il a été constaté PENDANT l'action examinée, pas à une étape précédente.
 */
function siteMuet(signaux: Signal[], actionId: string | undefined, erreursIgnorees: string[]): boolean {
  return signaux.some(
    (signal) =>
      signal.type === 'requete-echouee' &&
      signal.actionId === actionId &&
      signal.cadrePrincipal &&
      !erreursIgnorees.includes(signal.erreur),
  );
}

export interface DependancesReexecuteur {
  navigateur: Browser;
  config: ConfigScanner;
  /** Fabrique d'un tampon de signaux neuf par rejeu (défaut : l'observateur en mémoire). */
  observateur?: () => Observateur;
  /** Journal du scan : le rejeu y inscrit ce qu'il a rejoué, dans l'ordre (constitution §5). */
  journaliser?: (type: string, details?: unknown) => void;
  /**
   * Instant (epoch ms) de l'échéance du scan. Chaque délai du rejeu est
   * borné par le budget restant : le protocole décide de LANCER une
   * tentative, mais une tentative lancée ne doit pas non plus déborder.
   */
  echeance?: number;
}

export function creerReexecuteur(dependances: DependancesReexecuteur): Reexecuteur {
  const { navigateur, config } = dependances;
  const fabriqueObservateur = dependances.observateur ?? creerObservateur;
  const journaliser = dependances.journaliser ?? ((): void => undefined);
  const { rejeu } = config.confirmation;
  const { exploration } = config;
  /** Codes d'erreur réseau qui ne disent rien du site : ils vivent avec le détecteur qui les lit (config). */
  const erreursIgnorees = config.detecteurs.http.erreursReseauIgnorees;
  /** Délai effectif : le maximum voulu, borné par ce qui reste avant l'échéance (marge déduite). */
  const budget = (max: number): number =>
    dependances.echeance === undefined
      ? max
      : Math.max(1, Math.min(max, dependances.echeance - rejeu.margeEcheanceMs - Date.now()));

  return {
    async rejouer(reproduction, viewport: Viewport) {
      const debut = Date.now();
      const observateur = fabriqueObservateur();
      const parcours: Parcours = { urlDepart: reproduction.url, pages: [], actions: [], arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 };
      let contexteNavigateur: BrowserContext | undefined;
      let page: Page | undefined;
      let branchee: PageBranchee | undefined;
      let echec: { erreur: string; cause: CauseEchecRejeu } | undefined;
      let compteur = 0;
      let actionCourante: string | undefined;

      journaliser('rejeu.debut', {
        url: reproduction.url,
        viewport: viewport.nom,
        nbPrealables: reproduction.actionsPrealables.length,
        action: reproduction.action?.action.type ?? null,
      });

      try {
        const origine = originesDe(reproduction.url);
        contexteNavigateur = await creerContexte(navigateur, config, viewport);
        const ouverte = await contexteNavigateur.newPage();
        page = ouverte;
        branchee = brancherPage(ouverte, {
          observateur,
          viewport: viewport.nom,
          origine,
          actionCouranteId: () => actionCourante,
          pageCourante: () => ouverte.url(),
        });
        const branchement = branchee;

        const delai = (): number => budget(exploration.evaluationMs);
        const optionsFenetre = (plafondMs: number): OptionsFenetre => ({
          stabilisationMs: exploration.stabilisationMs,
          plafondMs,
          sondageMs: exploration.sondageMs,
        });

        const prochainId = (): string => {
          compteur += 1;
          return `${PREFIXE_ACTION_REJEU}${compteur}`;
        };

        function enregistrer(id: string, action: Action, pageAvant: string, debutAction: string, resultat: ResultatAction, details?: unknown): void {
          parcours.actions.push({
            id,
            action,
            page: pageAvant,
            viewport: viewport.nom,
            debut: debutAction,
            fin: new Date().toISOString(),
            resultat,
            ...(details === undefined ? {} : { details }),
          });
        }

        /** Signaux constatés au chargement : état des images, recouvrements géométriques (mêmes primitives que l'exploration). */
        async function emettreSignauxDePage(url: string): Promise<void> {
          const horodatage = new Date().toISOString();
          for (const image of await etatsImages(ouverte, delai())) {
            observateur.emettre({ type: 'etat-image', horodatage, page: url, viewport: viewport.nom, ...image });
          }
          const geometrie = await recouvrements(ouverte, { max: exploration.elementsInteractifsMax, budgetMs: delai() });
          for (const constat of geometrie.recouvrements) {
            observateur.emettre({ type: 'interception-clic', horodatage, page: url, viewport: viewport.nom, ...constat, source: 'geometrie' });
          }
        }

        async function naviguer(url: string): Promise<void> {
          const plafond = budget(rejeu.chargementPageMs);
          try {
            await ouverte.goto(url, { waitUntil: 'load', timeout: plafond });
          } catch {
            if (siteMuet(observateur.signaux(), actionCourante, erreursIgnorees)) {
              throw new EchecRejeu(ERREUR_PAGE_INCHARGEABLE, 'reseau-site');
            }
            if (plafond < rejeu.chargementPageMs) {
              // L'attente a été écourtée par l'échéance : trop peu attendu
              // pour conclure quoi que ce soit sur le site.
              throw new EchecRejeu(ERREUR_BUDGET_INSUFFISANT, 'outil');
            }
            // Le site a ACCEPTÉ la connexion et n'a jamais répondu : aucune
            // requête n'échoue, donc rien ne serait observé. Constater
            // l'absence de réponse est la seule façon de ne pas confondre un
            // backend figé avec une limite du robot — et le circuit
            // observation → détection fait le reste.
            if (branchement.signalerNavigationEnAttente() > 0) {
              throw new EchecRejeu(ERREUR_PAGE_INCHARGEABLE, 'reseau-site');
            }
            throw new EchecRejeu(ERREUR_PAGE_INCHARGEABLE, 'indetermine');
          }
        }

        async function remplir(valeurs: { champ: LocalisationElement; valeur: string }[]): Promise<void> {
          for (const { champ, valeur } of valeurs) {
            try {
              if (champ.balise === 'select') {
                await ouverte.selectOption(champ.selecteur, { value: valeur }, { timeout: budget(exploration.saisieMs) });
              } else {
                await ouverte.fill(champ.selecteur, valeur, { timeout: budget(exploration.saisieMs) });
              }
            } catch {
              // Un champ du premier passage qui n'est plus saisissable : le rejeu
              // ne peut pas recréer l'état, donc il ne peut rien conclure.
              throw new EchecRejeu(ERREUR_SELECTEUR_INTROUVABLE, 'outil');
            }
          }
        }

        /**
         * Soumission rejouée, avec les mêmes garde-fous que l'exploration :
         * validation native vérifiée avant le clic, géométrie relevée juste
         * avant. Un clic INTERCEPTÉ n'est pas un échec d'outillage — c'est le
         * constat lui-même (M01), et il réémet son signal.
         */
        async function soumettre(formulaire: LocalisationElement, declencheur: LocalisationElement | null): Promise<{ resultat: ResultatAction; details?: unknown }> {
          const validite = await validiteFormulaire(ouverte, formulaire.selecteur, declencheur?.selecteur ?? null, delai()).catch(() => null);
          if (validite !== null && validite.validationActive && validite.champsInvalides.length > 0) {
            throw new EchecRejeu(ERREUR_ACTION_IMPOSSIBLE, 'outil');
          }
          if (declencheur === null) {
            const formulaires = parcours.pages[0]?.formulaires ?? [];
            const bloquants = formulaires
              .find((decrit) => decrit.localisation.selecteur === formulaire.selecteur)
              ?.champs.filter((champ) => TYPES_SOUMISSION_IMPLICITE.includes(champ.type));
            const champ = bloquants?.length === 1 ? bloquants[0] : undefined;
            if (champ === undefined) {
              throw new EchecRejeu(ERREUR_ACTION_IMPOSSIBLE, 'outil');
            }
            try {
              await ouverte.press(champ.localisation.selecteur, 'Enter', { timeout: budget(exploration.clicMs), noWaitAfter: true });
              return { resultat: 'ok' };
            } catch {
              throw new EchecRejeu(ERREUR_SELECTEUR_INTROUVABLE, 'outil');
            }
          }
          let intercepteur: LocalisationElement | null = null;
          let couvert = false;
          try {
            const constat = await recouvrements(ouverte, { selecteur: declencheur.selecteur, max: 1, budgetMs: delai() });
            couvert = constat.recouvrements.length > 0;
            intercepteur = constat.recouvrements[0]?.intercepteur ?? null;
          } catch {
            // Géométrie indisponible : le clic tranchera.
          }
          try {
            await ouverte.click(declencheur.selecteur, { timeout: budget(exploration.clicMs), noWaitAfter: true });
            return { resultat: 'ok' };
          } catch (erreur: unknown) {
            const message = erreur instanceof Error ? erreur.message : String(erreur);
            if (erreur instanceof errors.TimeoutError && (couvert || message.includes(MARQUE_INTERCEPTION))) {
              observateur.emettre({
                type: 'interception-clic',
                horodatage: new Date().toISOString(),
                page: ouverte.url(),
                viewport: viewport.nom,
                ...(actionCourante === undefined ? {} : { actionId: actionCourante }),
                element: declencheur,
                intercepteur,
                source: 'clic',
              });
              return { resultat: 'bloquee', details: { raison: RAISON_CLIC_INTERCEPTE } };
            }
            throw new EchecRejeu(ERREUR_SELECTEUR_INTROUVABLE, 'outil');
          }
        }

        async function executer(action: Action): Promise<{ resultat: ResultatAction; details?: unknown }> {
          switch (action.type) {
            case 'naviguer':
              await naviguer(action.url);
              return { resultat: 'ok' };
            case 'remplir':
              await remplir(action.valeurs);
              return { resultat: 'ok' };
            case 'soumettre':
              return soumettre(action.formulaire, action.declencheur);
            case 'terminer':
              return { resultat: 'ok' };
          }
        }

        /** Une action rejouée, dans sa propre fenêtre d'effet : les signaux lui sont liés comme au premier passage. */
        async function rejouerAction(action: Action, prealable: boolean): Promise<void> {
          const id = prochainId();
          const debutAction = new Date().toISOString();
          // Une navigation est enregistrée sur sa CIBLE (comme l'exploration) ; toute autre action sur la page où elle a lieu.
          const pageAvant = action.type === 'naviguer' ? action.url : ouverte.url();
          actionCourante = id;
          try {
            await viderMutations(ouverte, NOM_TAMPON, delai()).catch(() => undefined);
            branchement.ouvrirFenetre();
            const { resultat, details } = await executer(action);
            const selecteurZone = action.type === 'remplir' || action.type === 'soumettre' ? action.formulaire.selecteur : null;
            const plafondFenetre = budget(rejeu.actionMs);
            const effets = await branchement.attendreEffets({
              ...optionsFenetre(plafondFenetre),
              actionId: id,
              derniereMutation: () => derniereMutation(ouverte, NOM_TAMPON, delai()),
              lireMutations: () => lireMutations(ouverte, NOM_TAMPON, selecteurZone, delai()),
            });
            // La fenêtre s'est-elle refermée sur la PAGE (stabilisée) ou sur
            // le budget ? Dans le second cas la tentative est tronquée : elle
            // n'a pas eu lieu jusqu'au bout, donc elle ne conclut rien.
            if (plafondFenetre < rejeu.actionMs && effets.attenteMs >= plafondFenetre) {
              throw new EchecRejeu(ERREUR_BUDGET_INSUFFISANT, 'outil');
            }
            enregistrer(id, action, pageAvant, debutAction, resultat, details);
            journaliser('rejeu.action', { id, type: action.type, prealable, resultat, page: pageAvant, viewport: viewport.nom });
          } finally {
            actionCourante = undefined;
          }
        }

        // 1. Chargement de la page du représentant, observé comme une action.
        await rejouerAction({ type: 'naviguer', url: reproduction.url }, false);
        const extraction = await extrairePage(ouverte, delai());
        const pageVisitee: PageVisitee = {
          url: ouverte.url(),
          viewport: viewport.nom,
          statutHttp: branchement.statutDocument(),
          liensInternes: [],
          formulaires: extraction.formulaires,
          horodatage: new Date().toISOString(),
        };
        parcours.pages.push(pageVisitee);
        await emettreSignauxDePage(pageVisitee.url);

        // 2. L'état requis, refait dans l'ordre. 3. L'action déclenchante.
        for (const prealable of reproduction.actionsPrealables) {
          await rejouerAction(prealable.action, true);
        }
        if (reproduction.action !== null) {
          await rejouerAction(reproduction.action.action, false);
        }
      } catch (erreur: unknown) {
        echec = identifierEchec(erreur, page);
        parcours.arret = 'erreur';
        journaliser('rejeu.echec', { ...echec, viewport: viewport.nom });
      } finally {
        branchee?.debrancher();
        await contexteNavigateur?.close().catch(() => undefined);
      }

      const signaux = observateur.signaux();
      const dureeMs = Date.now() - debut;
      journaliser('rejeu.fin', {
        viewport: viewport.nom,
        echecOutillage: echec !== undefined,
        ...(echec === undefined ? {} : { causeEchec: echec.cause }),
        nbActions: parcours.actions.length,
        nbSignaux: signaux.length,
        dureeMs,
      });
      return {
        signaux,
        parcours,
        echecOutillage: echec !== undefined,
        ...(echec === undefined ? {} : { causeEchec: echec.cause, erreur: echec.erreur }),
        dureeMs,
      };
    },
  };
}

/** Origine de l'URL rejouée : elle qualifie les ressources `interne` des signaux. */
function originesDe(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new EchecRejeu(ERREUR_URL_INVALIDE, 'outil');
  }
}
