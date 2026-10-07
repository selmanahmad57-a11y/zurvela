/**
 * Q20 champ-visible-recouvert : un champ VISIBLE de TAILLE RÉELLE (120×30)
 * recouvert par un étranger — le vrai défaut (un bandeau mal placé sur un
 * formulaire). Attendu AVANT comme APRÈS le fix : PUBLIÉ (1 clic-intercepte).
 * Garde : le fix (C) ne doit jamais écarter un vrai blocage de champ visible.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="ci-visible-hote" style="position:relative">
  <input type="text" name="ci-visible" style="position:fixed;top:160px;left:40px;width:120px;height:30px;opacity:1;z-index:1;box-sizing:border-box;border:0;padding:0;margin:0">
  <div class="ci-visible-cover" style="position:fixed;top:160px;left:40px;width:120px;height:30px;z-index:5;background:transparent"></div>
</div>`;

export const Q20: BugInjectable = {
  id: 'Q20',
  nom: 'champ-visible-recouvert',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
