/**
 * Fabriques de signaux, d'actions et de contextes SIMULÉS pour les tests
 * des détecteurs. Chaque fabrique rend un objet « sain » par défaut, que le
 * test surcharge pour construire le cas voulu. Aucun navigateur ici.
 *
 * (Ce module n'est pas un fichier de test : il ne porte pas le suffixe
 * `.test.ts` et n'est importé que par les tests du dossier.)
 */
import type { ActionExecutee, ContexteDetection, LocalisationElement, Signal, Viewport } from '../../types.js';
import type { ConfigScanner } from '../config.js';

/** Réglages des détecteurs propres aux tests (indépendants de config/scanner.json). */
export const CONFIG_TEST: ConfigScanner['detecteurs'] = {
  http: {
    confiance5xx: 0.9,
    confiance404: 0.85,
    gravite5xxSoumission: 'bloquant',
    gravite5xx: 'important',
    gravite404: 'mineur',
    categorieParTypeRessource: { image: 'visuel', stylesheet: 'visuel' },
    categorieParDefaut: 'fonctionnel',
    confiance5xxSoumission: 0.95,
    confianceDocumentInjoignable: 0.9,
    graviteDocumentInjoignable: 'bloquant',
    erreursReseauIgnorees: ['net::ERR_ABORTED'],
    contenuMixte: { erreurs: ['mixed-content'], categorie: 'securite', gravite: 'important', confiance: 0.85 },
  },
  inerte: { confiance: 0.75, gravite: 'bloquant' },
  echecMuet: { confiance: 0.8, gravite: 'bloquant', typesRequete: ['document', 'xhr', 'fetch'] },
  lenteur: {
    seuilMs: 3000,
    gravite: 'important',
    // Trois paliers aux confiances distinctes : chaque test peut nommer celui qu'il attend.
    paliers: [
      { ratioMin: 1, confiance: 0.7 },
      { ratioMin: 1.5, confiance: 0.85 },
      { ratioMin: 3, confiance: 0.95 },
    ],
  },
  image: { confianceSignalSimple: 0.8, confianceSignalDouble: 0.95, gravite: 'mineur' },
  recouvrement: { confianceGeometrie: 0.8, confianceGeometrieEtClic: 0.95, gravite: 'bloquant' },
  tiers: { categorie: 'fonctionnel', gravite: 'mineur', confiance: 0.7, fenetreErreurJsMs: 2000 },
};

export const DESKTOP: Viewport = { nom: 'desktop', largeur: 1280, hauteur: 800, mobile: false };
export const MOBILE: Viewport = { nom: 'mobile', largeur: 390, hauteur: 844, mobile: true };

export const ORIGINE = 'http://127.0.0.1:4800';
export const URL_ACCUEIL = `${ORIGINE}/`;
export const URL_CONTACT = `${ORIGINE}/contact`;
export const URL_CONFIRMATION = `${ORIGINE}/confirmation`;
export const URL_API = `${ORIGINE}/api/contact`;
export const URL_LOGO = `${ORIGINE}/statique/images/logo.svg`;

export const BOUTON: LocalisationElement = {
  balise: 'button',
  selecteur: 'form[action="/api/contact"] > button[type="submit"]',
  attributs: { type: 'submit' },
};
export const FORMULAIRE: LocalisationElement = {
  balise: 'form',
  selecteur: 'form[action="/api/contact"]',
  attributs: { action: '/api/contact', method: 'post' },
};
export const LOGO: LocalisationElement = {
  balise: 'img',
  selecteur: 'header > img:nth-of-type(1)',
  attributs: { src: '/statique/images/logo.svg' },
};

/** Instant de référence des horodatages simulés. */
const ORIGINE_TEMPS = Date.parse('2026-01-01T00:00:00.000Z');

/** Horodatage ISO décalé de `decalageMs` par rapport à l'instant de référence. */
export function horodatage(decalageMs: number): string {
  return new Date(ORIGINE_TEMPS + decalageMs).toISOString();
}

type Surcharges<T extends Signal['type']> = Partial<Omit<Extract<Signal, { type: T }>, 'type'>>;

function base(decalageMs: number): { horodatage: string; page: string; viewport: string } {
  return { horodatage: horodatage(decalageMs), page: URL_CONTACT, viewport: DESKTOP.nom };
}

export function reponse(surcharges: Surcharges<'reponse-reseau'> = {}): Signal {
  return {
    type: 'reponse-reseau',
    ...base(0),
    urlRessource: URL_API,
    methode: 'POST',
    statut: 200,
    typeRessource: 'fetch',
    dureeMs: 50,
    interne: true,
    ...surcharges,
  };
}

export function requeteEchouee(surcharges: Surcharges<'requete-echouee'> = {}): Signal {
  return {
    type: 'requete-echouee',
    ...base(0),
    urlRessource: URL_API,
    methode: 'POST',
    typeRessource: 'fetch',
    erreur: 'net::ERR_CONNECTION_RESET',
    cadrePrincipal: false,
    interne: true,
    ...surcharges,
  };
}

export function requeteEnAttente(surcharges: Surcharges<'requete-en-attente'> = {}): Signal {
  return {
    type: 'requete-en-attente',
    ...base(0),
    urlRessource: URL_API,
    methode: 'POST',
    typeRessource: 'fetch',
    attenteMs: 0,
    interne: true,
    ...surcharges,
  };
}

export function mutation(surcharges: Surcharges<'mutation-dom'> = {}): Signal {
  return { type: 'mutation-dom', ...base(0), nb: 1, nbZone: 1, ...surcharges };
}

export function navigation(surcharges: Surcharges<'navigation'> = {}): Signal {
  return { type: 'navigation', ...base(0), de: URL_CONTACT, vers: URL_CONFIRMATION, ...surcharges };
}

export function erreurJs(surcharges: Surcharges<'erreur-js'> = {}): Signal {
  return { type: 'erreur-js', ...base(0), message: 'TypeError', ...surcharges };
}

export function etatImage(surcharges: Surcharges<'etat-image'> = {}): Signal {
  return {
    type: 'etat-image',
    ...base(0),
    ressource: URL_LOGO,
    element: LOGO,
    complete: true,
    largeurNaturelle: 40,
    hauteurNaturelle: 40,
    ...surcharges,
  };
}

/** L'élément qui intercepte le clic dans les fabriques : la cause, depuis P2-2 (contrat 4). */
export const INTERCEPTEUR: LocalisationElement = { balise: 'span', selecteur: 'form[action="/api/contact"] > span:nth-of-type(1)', attributs: {} };

export function interception(surcharges: Surcharges<'interception-clic'> = {}): Signal {
  return {
    type: 'interception-clic',
    ...base(0),
    element: BOUTON,
    intercepteur: INTERCEPTEUR,
    source: 'geometrie',
    ...surcharges,
  };
}

export function finAction(surcharges: Surcharges<'fin-action'> = {}): Signal {
  return {
    type: 'fin-action',
    ...base(0),
    effets: { requetes: 1, requetesEnAttente: 0, navigation: true, mutations: 3, mutationsZone: 2, mutationsHorsBruit: 3, attenteMs: 600 },
    ...surcharges,
  };
}

/** Une soumission SANS déclencheur (formulaire sans bouton, soumission implicite par Entrée). */
export function soumissionImplicite(id: string, formulaire: LocalisationElement, surcharges: Partial<ActionExecutee> = {}): ActionExecutee {
  return soumission(id, { action: { type: 'soumettre', formulaire, declencheur: null }, ...surcharges });
}

export function soumission(id: string, surcharges: Partial<ActionExecutee> = {}): ActionExecutee {
  return {
    id,
    action: { type: 'soumettre', formulaire: FORMULAIRE, declencheur: BOUTON },
    page: URL_CONTACT,
    viewport: DESKTOP.nom,
    debut: horodatage(0),
    fin: horodatage(1000),
    resultat: 'ok',
    ...surcharges,
  };
}

/** Une action `remplir` exécutée avec succès sur le formulaire de la page de contact. */
export function remplissage(id: string, surcharges: Partial<ActionExecutee> = {}): ActionExecutee {
  return {
    id,
    action: { type: 'remplir', formulaire: FORMULAIRE, valeurs: [] },
    page: URL_CONTACT,
    viewport: DESKTOP.nom,
    debut: horodatage(0),
    fin: horodatage(500),
    resultat: 'ok',
    ...surcharges,
  };
}

export function navigationAction(id: string, url: string, surcharges: Partial<ActionExecutee> = {}): ActionExecutee {
  return {
    id,
    action: { type: 'naviguer', url },
    page: URL_ACCUEIL,
    viewport: DESKTOP.nom,
    debut: horodatage(0),
    fin: horodatage(1000),
    resultat: 'ok',
    ...surcharges,
  };
}

export function contexte(actions: ActionExecutee[] = [], viewports: Viewport[] = [DESKTOP, MOBILE]): ContexteDetection {
  return {
    urlDepart: URL_ACCUEIL,
    viewports,
    parcours: { urlDepart: URL_ACCUEIL, pages: [], actions, arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 },
  };
}

/**
 * Les signaux d'un site SAIN sur un viewport : chargement de deux pages
 * (documents, ressources, logo décodé, bouton libre), soumission réussie
 * suivie d'une navigation vers la confirmation.
 */
export function signauxSains(actionId: string, viewport: string = DESKTOP.nom): Signal[] {
  return [
    reponse({ urlRessource: URL_ACCUEIL, methode: 'GET', typeRessource: 'document', page: URL_ACCUEIL, viewport }),
    reponse({ urlRessource: URL_LOGO, methode: 'GET', typeRessource: 'image', page: URL_ACCUEIL, viewport }),
    etatImage({ page: URL_ACCUEIL, viewport }),
    reponse({ urlRessource: URL_CONTACT, methode: 'GET', typeRessource: 'document', viewport }),
    etatImage({ viewport }),
    reponse({ actionId, viewport, horodatage: horodatage(100), dureeMs: 120 }),
    mutation({ actionId, viewport, horodatage: horodatage(20), nb: 1, nbZone: 1 }),
    navigation({ actionId, viewport, horodatage: horodatage(150) }),
    reponse({ actionId, viewport, urlRessource: URL_CONFIRMATION, methode: 'GET', typeRessource: 'document', horodatage: horodatage(200) }),
    finAction({ actionId, viewport, horodatage: horodatage(800) }),
  ];
}
