/**
 * Q17 mur-recurrent-inter-pages : LE MÊME mur couvrant (même construction),
 * servi sur deux pages (accueil + panier). C'est le cas consentement de
 * C-11, absorbé par P2-11 (C2) : un mur récurrent de même construction est UN
 * mur, pas un par page. La clé de cause d'un mur laisse tomber la page ; la
 * signature de construction de l'ancêtre couvrant l'apparie entre pages.
 *
 * Attendu après le fix : UNE cause (desktop), victimes des deux pages réunies.
 * Sens validé par l'owner (point 2) : même mur sur 2 pages → une cause.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, PAGE_PANIER, ROLE_CALQUE, SELECTEUR_PIED } from '../structure.js';

const FRAGMENT = `<a data-role="${ROLE_CALQUE}" href="/statique/xp-1" style="position:fixed;top:100px;left:40px;width:90px;height:24px;z-index:1">a</a>
<a href="/statique/xp-2" style="position:fixed;top:300px;left:40px;width:90px;height:24px;z-index:1">b</a>
<div class="mur-xpage" style="position:fixed;inset:0;z-index:5;background:transparent">
  <div class="vx-a" style="position:absolute;top:0;left:0;right:0;height:200px"></div>
  <section class="vx-b" style="position:absolute;top:200px;left:0;right:0;bottom:0"></section>
</div>`;

export const Q17: BugInjectable = {
  id: 'Q17',
  nom: 'mur-recurrent-inter-pages',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL, PAGE_PANIER],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL || chemin === PAGE_PANIER ? insererApresElement(html, SELECTEUR_PIED, FRAGMENT) : html;
  },
};
