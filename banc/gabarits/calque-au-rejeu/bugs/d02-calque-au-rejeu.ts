/**
 * D02 calque-au-rejeu : un calque transparent recouvre le bloc des trois
 * offres de l'accueil, mais SEULEMENT au-delà des `visitesAvantCalque`
 * premières visites de la page — c'est-à-dire après l'exploration, pendant
 * le rejeu d'un autre défaut de la même page. La miniature déterministe
 * d'expandtesting : une iframe publicitaire plein écran apparue pendant un
 * rejeu, jamais vue par l'exploration, jamais re-testée.
 *
 * Il porte DEUX attendus, et c'est sa raison d'être (dette n°20) :
 *  - le contrat 8 de P2-1 : ce que le rejeu voit en passant est publié avec
 *    le verdict `decouverte`, jamais `confirmee`, et une gravité bornée —
 *    `important`, là où le détecteur de recouvrement dit `bloquant` ;
 *  - le futur C-16 : UNE cause (le calque), TROIS interceptions (les trois
 *    boutons). Le banc compte les constats en double sur cette cause
 *    déclarée unique (`causeUnique`) ; P2-2 devra les ramener à un.
 *
 * Il ne se manifeste qu'au rejeu d'un AUTRE défaut : seul, il n'est jamais
 * constatable — d'où `seulementEnCombinaison`, et la combinaison D01 + D02
 * déclarée en config.
 *
 * Le compte de visites se tient dans `noterVisite`, appelé à chaque requête
 * de page et jamais au démarrage : la vérification des pages au démarrage
 * du serveur ne doit pas consommer une visite. S'il se trompait — calque vu
 * dès l'exploration —, l'échec serait BRUYANT : le calque sortirait
 * `confirmee` et `bloquant`, et le banc rougirait sur les deux attendus.
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, SELECTEUR_DERNIER_BOUTON } from '../structure.js';

/** Repère du calque injecté (pour les tests). */
export const ROLE_CALQUE = 'calque';
const CLE_VISITES = 'visitesAccueil';

/** Le calque : transparent, posé sur tout le bloc des offres (positionné par la feuille de style). */
export const FRAGMENT_CALQUE = `<div data-role="${ROLE_CALQUE}" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;

function lireSeuil(parametres: Record<string, unknown>): number {
  const seuil = parametres['visitesAvantCalque'];
  if (typeof seuil !== 'number' || !Number.isInteger(seuil) || seuil < 0) {
    throw new Error(`D02 : le paramètre visitesAvantCalque doit être un entier ≥ 0 (reçu : ${String(seuil)})`);
  }
  return seuil;
}

function visites(contexte: ContexteBug): number {
  return Number(contexte.etat[CLE_VISITES] ?? 0);
}

export const D02: BugInjectable = {
  id: 'D02',
  nom: 'calque-au-rejeu',
  categorie: 'fonctionnel',
  // La gravité que le CLIENT doit lire : bornée, parce que le calque n'est
  // constaté qu'au rejeu et jamais re-testé (P2-1, contrat 8). Le détecteur
  // de recouvrement, lui, dit `bloquant`.
  gravite: 'important',
  verdictAttendu: 'decouverte',
  seulementEnCombinaison: true,
  causeUnique: true,
  pages: [PAGE_ACCUEIL],
  validerParametres(parametres) {
    lireSeuil(parametres);
  },
  noterVisite(chemin, contexte) {
    if (chemin === PAGE_ACCUEIL) {
      contexte.etat[CLE_VISITES] = visites(contexte) + 1;
    }
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    // L'insertion est TOUJOURS calculée — elle lève si le repère manque, dès
    // la vérification du démarrage — mais n'est servie qu'au-delà du seuil.
    const avecCalque = insererApresElement(html, SELECTEUR_DERNIER_BOUTON, FRAGMENT_CALQUE);
    return visites(contexte) > lireSeuil(contexte.parametres) ? avecCalque : html;
  },
};
