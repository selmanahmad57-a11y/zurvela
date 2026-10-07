/**
 * Q22 champ-sliver-invisible : un champ INVISIBLE (opacity 0) FIN ET LONG
 * (300×1) recouvert — un proxy « sliver » (une ligne de 1px). C'est le cas où
 * l'AIRE (300) tromperait mais la DIMENSION MINIMALE (1) tranche : trop fin
 * pour qu'un visiteur le vise. Attendu après le fix : ÉCARTÉ (dimension min
 * 1 ≤ 4). Rouge aujourd'hui : publié. Justifie le choix « dimension min »
 * plutôt que « aire » pour le critère minuscule.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="ci-sliver-hote" style="position:relative">
  <input type="text" name="ci-sliver" style="position:fixed;top:300px;left:40px;width:300px;height:1px;opacity:0;z-index:1;box-sizing:border-box;border:0;padding:0;margin:0">
  <div class="ci-sliver-cover" style="position:fixed;top:291px;left:40px;width:300px;height:20px;z-index:5;background:transparent"></div>
</div>`;

export const Q22: BugInjectable = {
  id: 'Q22',
  nom: 'champ-sliver-invisible',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
