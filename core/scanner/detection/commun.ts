/**
 * Utilitaires partagés par les détecteurs : lecture du parcours (action,
 * viewport), dérivation du contexte de reproduction, localisation d'une
 * ressource réseau et construction d'une candidate. Aucune règle de
 * détection ne vit ici : les paliers de confiance appartiennent à chaque
 * détecteur, qui seul connaît la force de son signal.
 */
import type {
  ActionExecutee,
  AnomalieCandidate,
  Categorie,
  ContexteDetection,
  ContexteReproduction,
  Gravite,
  LocalisationElement,
  Parcours,
  Signal,
  Viewport,
} from '../../types.js';

/** Chemin d'une URL absolue (clé de page du dédoublonnage) ; la chaîne telle quelle si elle n'est pas analysable. */
export function cheminDePage(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Action du parcours désignée par un `actionId` de signal, ou null hors action. */
export function trouverAction(parcours: Parcours, actionId: string | undefined): ActionExecutee | null {
  if (actionId === undefined) {
    return null;
  }
  return parcours.actions.find((action) => action.id === actionId) ?? null;
}

/**
 * Viewport complet désigné par son nom. Un nom inconnu du contexte est une
 * incohérence du pipeline (les signaux naissent des viewports de la config) :
 * on rend un viewport aux dimensions inconnues (0) plutôt que de perdre la
 * candidate ou d'interrompre le scan.
 */
export function trouverViewport(viewports: Viewport[], nom: string): Viewport {
  return viewports.find((viewport) => viewport.nom === nom) ?? { nom, largeur: 0, hauteur: 0, mobile: false };
}

export function estSoumission(action: ActionExecutee | null): boolean {
  return action?.action.type === 'soumettre';
}

/**
 * Actions à rejouer avant l'action déclenchante pour reproduire l'anomalie
 * isolément (typiquement le `remplir` qui précède un `soumettre`).
 *
 * APPROXIMATION assumée, et SEULE source du champ `actionsPrealables` : on
 * remonte le parcours depuis l'action déclenchante en ne gardant que les
 * actions de la MÊME page et du MÊME viewport, et on s'arrête à la dernière
 * navigation (l'état d'avant n'a pas survécu au chargement). Un parcours
 * multi-étapes dont l'état vient des pages précédentes n'est donc pas
 * couvert ; la brique 3 le vérifiera en rejouant.
 *
 * Une action dont le `resultat` n'est pas `ok` n'a rien changé à l'état : on
 * la saute sans interrompre la remontée.
 */
export function actionsPrealablesDe(parcours: Parcours, action: ActionExecutee | null): ActionExecutee[] {
  if (action === null) {
    return [];
  }
  const index = parcours.actions.findIndex((candidate) => candidate.id === action.id);
  // Action inconnue du parcours : aucun antécédent à affirmer.
  if (index < 0) {
    return [];
  }
  const prealables: ActionExecutee[] = [];
  for (let rang = index - 1; rang >= 0; rang -= 1) {
    const precedente = parcours.actions[rang];
    if (precedente === undefined) {
      break;
    }
    if (precedente.page !== action.page || precedente.viewport !== action.viewport) {
      break;
    }
    if (precedente.action.type === 'naviguer') {
      break;
    }
    if (precedente.resultat !== 'ok') {
      continue;
    }
    prealables.push(precedente);
  }
  return prealables.reverse();
}

/** Déclencheur d'une action de soumission (bouton cliqué), s'il existe. */
export function declencheurDe(action: ActionExecutee | null): LocalisationElement | undefined {
  if (action === null || action.action.type !== 'soumettre') {
    return undefined;
  }
  return action.action.declencheur ?? undefined;
}

/**
 * Élément en cause d'une soumission : son déclencheur, sinon le formulaire
 * lui-même (soumission implicite par la touche Entrée). Deux formulaires sans
 * bouton d'une même page restent ainsi deux anomalies distinctes.
 */
export function elementDe(action: ActionExecutee | null): LocalisationElement | undefined {
  if (action === null || action.action.type !== 'soumettre') {
    return undefined;
  }
  return action.action.declencheur ?? action.action.formulaire;
}

/**
 * Localisation structurelle d'une ressource réseau : le type de ressource
 * tient lieu de balise, le chemin d'URL de sélecteur (clé de dédoublonnage
 * par ressource), l'URL complète est conservée en attribut.
 */
export function localiserRessource(signal: { urlRessource: string; typeRessource: string }): LocalisationElement {
  return {
    balise: signal.typeRessource,
    selecteur: cheminDePage(signal.urlRessource),
    attributs: { src: signal.urlRessource },
  };
}

export interface ParametresCandidate {
  detecteur: string;
  description: string;
  categorie: Categorie;
  gravite: Gravite;
  confiance: number;
  /** URL absolue de la page (le correcteur normalise en chemin). */
  page: string;
  /** Nom du viewport où le signal a été observé. */
  viewport: string;
  /** true si la candidate dépend du viewport : son nom est alors porté par l'anomalie. */
  dependDuViewport: boolean;
  action: ActionExecutee | null;
  element?: LocalisationElement | undefined;
  preuves: Signal[];
}

/** Identifiant technique (jamais de prose) de la recette refusée : un préalable qui ne vient pas de sa page d'ouverture. */
export const ERREUR_RECETTE_INCOHERENTE = 'recette-incoherente';

/**
 * La recette de reproduction, construite en UN SEUL endroit.
 *
 * `pageDepart` est la page où l'action déclenchante a eu lieu — pour une
 * navigation, la page d'ORIGINE, pas la page d'arrivée où l'anomalie est
 * observée. Les préalables sont, par construction, les actions de cette même
 * page (`actionsPrealablesDe`) ; l'invariant est tout de même VÉRIFIÉ ici,
 * parce qu'une recette qui s'ouvrirait sur une page et rejouerait les
 * actions d'une autre est exactement le défaut que la campagne 6b a mesuré à
 * 0/8, 0/187 et 4/410 candidates rejouables (carnet C-09). Une garde qui
 * dépend de ce qu'elle garde ne vérifie rien : celle-ci est indépendante du
 * chemin qui remplit les préalables.
 */
export function recetteDe(page: string, viewport: Viewport, action: ActionExecutee | null, actionsPrealables: ActionExecutee[]): ContexteReproduction {
  const pageDepart = action?.page ?? page;
  const etranger = actionsPrealables.find((prealable) => prealable.page !== pageDepart);
  if (etranger !== undefined) {
    throw new Error(`${ERREUR_RECETTE_INCOHERENTE} : le préalable ${etranger.id} vient de ${etranger.page}, la recette s'ouvre sur ${pageDepart}`);
  }
  return { url: page, pageDepart, viewport, action, actionsPrealables };
}

export function construireCandidate(parametres: ParametresCandidate, contexte: ContexteDetection): AnomalieCandidate {
  const viewport = trouverViewport(contexte.viewports, parametres.viewport);
  const candidate: AnomalieCandidate = {
    categorie: parametres.categorie,
    description: parametres.description,
    urlOuEtape: parametres.page,
    graviteEstimee: parametres.gravite,
    confiance: parametres.confiance,
    detecteur: parametres.detecteur,
    reproduction: recetteDe(parametres.page, viewport, parametres.action, actionsPrealablesDe(contexte.parcours, parametres.action)),
    preuves: parametres.preuves,
  };
  if (parametres.element !== undefined) {
    candidate.element = parametres.element;
  }
  if (parametres.dependDuViewport) {
    candidate.viewport = viewport.nom;
  }
  return candidate;
}
