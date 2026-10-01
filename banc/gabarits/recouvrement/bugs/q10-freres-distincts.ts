/**
 * Q10 freres-distincts : LE SENS GRAVE du contrat 4, celui qui perd des
 * signaux.
 *
 * Deux `<li>` frères du même `<ul>` — donc candidats à la seconde voie de
 * fusion — mais que le DOCUMENT DISTINGUE : l'un porte un `role`, l'autre
 * un `aria-label`. Ce ne sont pas deux exemplaires d'une même
 * construction, ce sont deux éléments différents qui se trouvent voisins.
 *
 * Attendu : DEUX causes, donc DEUX sections. Fondre ici réunirait deux
 * défauts sous un seul constat et en enterrerait un — l'erreur que
 * l'asymétrie du contrat 4 existe pour empêcher (« ne pas fondre coûte du
 * bruit, fondre à tort perd un signal »). Sans ce gabarit, la seconde voie
 * de fusion ne serait prouvée que dans le sens bénin.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

/** Deux frères que leurs ATTRIBUTS CONSERVÉS séparent : la garde de la seconde voie. */
const FRAGMENT = `<ul id="serie-mixte" style="position:absolute;inset:0;z-index:10;margin:0;padding:0;list-style:none"><li role="presentation" style="position:absolute;left:0;top:0;width:100%;height:28px;background:transparent"></li><li aria-label="zzqy" style="position:absolute;left:0;top:30px;width:100%;height:28px;background:transparent"></li></ul><div data-role="${ROLE_CALQUE}" hidden></div>`;

export const Q10: BugInjectable = {
  id: 'Q10',
  nom: 'freres-distincts',
  categorie: 'fonctionnel',
  gravite: 'important',
  // PAS `causeUnique` : ce sont bien deux causes, et le banc doit les voir
  // toutes les deux. Un seul constat publié ici serait un signal perdu.
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
