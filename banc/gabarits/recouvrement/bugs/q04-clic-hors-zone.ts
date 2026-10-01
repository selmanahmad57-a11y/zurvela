/**
 * Q04 clic-hors-zone : un calque couvre le bloc des produits, et la page le
 * retire au premier clic reçu AILLEURS que sur lui — le comportement usuel
 * d'un bandeau que l'on congédie en cliquant à côté.
 *
 * Attendu : ÉCARTÉ, rien de publié. Face « UN GESTE » de `clic-hors-zone`,
 * et le seul gabarit où le POINT cliqué doit figurer au journal : une
 * relecture doit pouvoir vérifier que le moteur n'a rien activé (D3).
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" id="calque-hors" style="position:absolute;inset:0;z-index:10;background:transparent"></div><script>document.addEventListener('click',function(e){var c=document.getElementById('calque-hors');if(c&&!c.contains(e.target)){c.remove();}},true);</script>`;

export const Q04: BugInjectable = {
  id: 'Q04',
  nom: 'clic-hors-zone',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  // Aucun attendu d'anomalie : le recouvrement est écarté AVANT toute
  // détection. L'attendu positif est le COMPTE des écartements.
  ecartementAttendu: true,
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
