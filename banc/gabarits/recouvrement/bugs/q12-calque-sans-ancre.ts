/**
 * Q12 calque-sans-ancre : un calque inamovible qui couvre les produits — mais
 * SANS aucune ancre distinctive stable. Pas de classe, et un id VOLATILE qui
 * change à chaque chargement (comme un cadre publicitaire `#aswift_N` dont
 * l'identifiant est régénéré).
 *
 * C'est la SECONDE FACE du cahier (a) : un recouvrement pour lequel il
 * N'EXISTE PAS de sélecteur publiable. Le moteur actuel publie `#cadre-1` (le
 * sélecteur interne, qui stoppe au premier id) ; ce id n'existe plus au
 * chargement suivant. Mais surtout : le sélecteur de présentation ne doit PAS
 * lui coller une fausse ancre de repli — il doit RENONCER (déclarer « pas
 * d'ancre publiable »), pour que le cas sorte vers le cahier (b) du nommage
 * sémantique, au lieu de republier une adresse qui ne résout pas.
 *
 * L'id volatile se fait par COMPTEUR de visites (comme Q11 et L02), jamais par
 * aléa : `cadre-<visite>` change d'une visite à l'autre.
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const CLE_VISITES = 'q12.visitesAccueil';
/** Préfixe de l'id volatile : la partie stable, mais suivie d'un numéro qui change (structurellement « généré »). */
export const PREFIXE_ID_VOLATILE = 'cadre-';

export const Q12: BugInjectable = {
  id: 'Q12',
  nom: 'calque-sans-ancre',
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
    // Id VOLATILE : change à chaque visite. Aucune classe : rien de distinctif
    // et stable à nommer — le cas doit être RENONCÉ, pas faussement ancré.
    const visites = Number(contexte.etat[CLE_VISITES] ?? 0);
    const calque = `<div data-role="${ROLE_CALQUE}" id="${PREFIXE_ID_VOLATILE}${visites}" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;
    return insererApresElement(html, SELECTEUR_PRODUITS, calque);
  },
};
