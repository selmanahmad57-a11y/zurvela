/**
 * Q11 calque-position-volatile : un calque inamovible qui couvre le lien du
 * pied, exactement comme Q06 — mais dont la POSITION dans le DOM change entre
 * le scan et une re-vérification, tandis que sa CLASSE distinctive persiste.
 *
 * C'est l'asymétrie mesurée sur le réel (cahier du sélecteur positionnel) :
 * une boîte de consentement a une ancre distinctive stable (`.fc-consent-root`)
 * ET une position volatile (le chemin positionnel depuis `body` bouge d'un
 * chargement à l'autre). Le moteur publie aujourd'hui le sélecteur INTERNE
 * (positionnel, via `selecteurDe`), qui résout au moment du scan mais plus
 * quand le client regarde — n°7 pris en défaut.
 *
 * Mécanique : la position se fait par un COMPTEUR de visites (comme L02),
 * jamais par aléa. Le calque est PROFOND (4 frères `div` devant lui) pendant
 * le scan — calibré sur les `config.viewports.length` premières visites — puis
 * PEU PROFOND (seul `div`) ensuite. Le test vérifie que les deux viewports du
 * scan ont produit le MÊME sélecteur (profond) : si le scan chargeait l'accueil
 * plus de deux fois, ce contrôle rougirait au lieu de passer en silence.
 *
 * La classe `bandeau-temoin` est UNIQUE dans la page : c'est l'ancre stable que
 * le sélecteur de présentation devra nommer, là où le chemin positionnel échoue.
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_LIEN_PIED } from '../structure.js';

/** Classe distinctive, UNIQUE, portée par le calque — l'ancre stable à nommer. */
export const CLASSE_BANDEAU_TEMOIN = 'bandeau-temoin';
const CLE_VISITES = 'q11.visitesAccueil';
/** Nombre de frères `div` devant le calque pendant le scan : rend sa position positionnelle volatile. */
const FRERES_SCAN = 4;

const calque = `<div data-role="${ROLE_CALQUE}" class="${CLASSE_BANDEAU_TEMOIN}" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;
const frere = '<div data-role="frere-temoin" style="display:none"></div>';

export const Q11: BugInjectable = {
  id: 'Q11',
  nom: 'calque-position-volatile',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  noterVisite(chemin, contexte: ContexteBug) {
    if (chemin === PAGE_ACCUEIL) {
      contexte.etat[CLE_VISITES] = Number(contexte.etat[CLE_VISITES] ?? 0) + 1;
    }
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    // Calibré sur les 2 viewports du banc : profond pendant le scan, peu
    // profond ensuite (la re-vérification). Le test contrôle la calibration.
    const visites = Number(contexte.etat[CLE_VISITES] ?? 0);
    const freres = visites <= 2 ? frere.repeat(FRERES_SCAN) : '';
    return insererApresElement(html, SELECTEUR_LIEN_PIED, freres + calque);
  },
};
