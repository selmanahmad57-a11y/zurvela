/**
 * Q06 mur-sur-pied : le même calque inamovible, mais sur le PIED DE PAGE de
 * l'accueil, où il ne masque qu'un lien de mentions légales.
 *
 * Attendu : publié, et `mineur` — c'est le cas exact de la fiche 09, où un
 * lien de mot-clé recouvert de deux pixels par un pied de page était publié
 * « Bloquant · les clics n'aboutissent pas ». Avec Q05, il prouve que la
 * gravité dépend de ce qui est masqué et non du fait de masquer : deux
 * calques identiques, deux gravités.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_LIEN_PIED } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="mur-pied" style="position:absolute;inset:0;z-index:10;background:transparent"></div>`;

export const Q06: BugInjectable = {
  id: 'Q06',
  nom: 'mur-sur-pied',
  // La catégorie d'un recouvrement vient du VIEWPORT (mobile ou non), pas
  // de ce qu'il masque : c'est la GRAVITÉ que le contrat 2 fait varier.
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_LIEN_PIED, FRAGMENT) : html;
  },
};
