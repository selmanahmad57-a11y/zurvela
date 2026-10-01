/**
 * Q05 mur-sur-commande : un calque couvre le bouton de commande du panier, et
 * AUCUN geste neutre ne l'enlève — ni Échap, ni fermeture native, ni croix,
 * ni clic à côté. C'est la FACE 2 du contrat 1 : un vrai défaut, publié.
 *
 * Ce qu'il masque est la soumission d'un formulaire, donc une ACTION
 * CRITIQUE (contrat 2) : « le parcours s'arrête là » est ici vrai, et la
 * gravité attendue est `bloquant`. C'est le gabarit qui, avec Q06, prouve
 * que la gravité se lit sur CE QUI EST MASQUÉ.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_PANIER, ROLE_CALQUE, SELECTEUR_COMMANDE } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="mur-commande" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;

export const Q05: BugInjectable = {
  id: 'Q05',
  nom: 'mur-sur-commande',
  categorie: 'fonctionnel',
  gravite: 'bloquant',
  pages: [PAGE_PANIER],
  transformerHtml(html, chemin) {
    return chemin === PAGE_PANIER ? insererApresElement(html, SELECTEUR_COMMANDE, FRAGMENT) : html;
  },
};
