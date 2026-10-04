/**
 * Q13 id-suffixe-numerique : un calque inamovible sur le lien du pied, avec un
 * id STABLE à suffixe numérique (`promo-7`, le MÊME à chaque chargement) et
 * AUCUNE classe.
 *
 * Son id résout vraiment (`#promo-7` existe à chaque vue). Pourtant le sélecteur
 * de présentation doit RENONCER (`null`), par COHÉRENCE du renoncement strict :
 * sur un instantané, on ne distingue pas un id stable à suffixe numérique
 * (`#promo-7`) d'un id volatil (`#aswift_7`). On ne peut pas prouver la
 * stabilité d'un suffixe numérique sans la mesurer sur plusieurs chargements
 * (la cross-observation, en dette) — donc on les traite pareil, par prudence.
 * Ce gabarit grave ce choix : un cas réparable (id en fait stable) part vers le
 * registre sémantique, le bon côté de l'asymétrie « mieux vaut pas d'adresse
 * qu'une fausse ». Cahier P2-8.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_LIEN_PIED } from '../structure.js';

/** Id STABLE à suffixe numérique : résout à chaque vue, et pourtant renoncé. */
export const ID_SUFFIXE_NUMERIQUE = 'promo-7';

const calque = `<div data-role="${ROLE_CALQUE}" id="${ID_SUFFIXE_NUMERIQUE}" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;

export const Q13: BugInjectable = {
  id: 'Q13',
  nom: 'id-suffixe-numerique',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_LIEN_PIED, calque) : html;
  },
};
