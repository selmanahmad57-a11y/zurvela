/**
 * Q23 champ-visible-minuscule : un champ VISIBLE (opacity 1) mais MINUSCULE
 * (3×3) recouvert. Garde du gate « invisible » : le fix exige invisible ET
 * minuscule, donc un petit élément VISIBLE recouvert reste PUBLIÉ (asymétrie :
 * on ne tait pas un vrai, même petit). Mutation à tuer : écarter sur
 * « minuscule » SEUL l'écarterait → rouge. Attendu AVANT comme APRÈS : PUBLIÉ.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="ci-vis-min-hote" style="position:relative">
  <input type="text" name="ci-vis-min" style="position:fixed;top:360px;left:40px;width:3px;height:3px;opacity:1;z-index:1;box-sizing:border-box;border:0;padding:0;margin:0">
  <div class="ci-vis-min-cover" style="position:fixed;top:355px;left:35px;width:20px;height:20px;z-index:5;background:transparent"></div>
</div>`;

export const Q23: BugInjectable = {
  id: 'Q23',
  nom: 'champ-visible-minuscule',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
