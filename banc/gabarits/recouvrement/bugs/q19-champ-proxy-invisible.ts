/**
 * Q19 champ-proxy-invisible : un champ INVISIBLE (opacity 0) et MINUSCULE
 * (2×2) recouvert par un calque — le proxy de frappe d'un composant (cahier
 * P2-11 (C)). Le visiteur ne voit ni ne clique ce champ : son recouvrement
 * n'est pas un blocage. Attendu après le fix : ÉCARTÉ (0 clic-intercepte).
 * Rouge aujourd'hui : publié.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="ci-proxy-hote" style="position:relative">
  <input type="text" name="ci-proxy" style="position:fixed;top:100px;left:40px;width:2px;height:2px;opacity:0;z-index:1;box-sizing:border-box;border:0;padding:0;margin:0">
  <div class="ci-proxy-cover" style="position:fixed;top:95px;left:35px;width:20px;height:20px;z-index:5;background:transparent"></div>
</div>`;

export const Q19: BugInjectable = {
  id: 'Q19',
  nom: 'champ-proxy-invisible',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
