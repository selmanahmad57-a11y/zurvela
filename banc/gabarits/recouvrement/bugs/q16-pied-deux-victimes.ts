/**
 * Q16 pied-deux-victimes : un recouvrement LÉGITIME, non couvrant — un bloc de
 * pied (couverture ~0,1 du viewport, SOUS le seuil 0,5) à deux voiles de
 * balises distinctes (`div`, `section`) masquant deux liens. Sens grave du
 * seuil de couverture (P2-11, C1) : deux victimes qui partagent un ancêtre NON
 * couvrant ne doivent PAS fondre en « mur » — elles restent deux causes
 * (traitement P2-3 ordinaire). C'est le seuil de couverture qui empêche le
 * niveau « ancêtre couvrant » d'avaler un pied légitime.
 *
 * Attendu AUJOURD'HUI comme APRÈS le fix : DEUX causes (le fix ne doit rien y
 * changer). Mutation à tuer : un fix qui fond par ancêtre partagé SANS gater
 * sur la couverture les réunirait à tort → une cause → rouge.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="pied-deux-hote" style="position:relative">
  <a href="/statique/pied-v1" style="position:fixed;bottom:24px;left:40px;width:80px;height:22px;z-index:1">p1</a>
  <a href="/statique/pied-v2" style="position:fixed;bottom:24px;left:60%;width:80px;height:22px;z-index:1">p2</a>
  <div class="bloc-pied" style="position:fixed;bottom:0;left:0;right:0;height:72px;z-index:5;background:transparent">
    <div class="voile-g" style="position:absolute;top:0;left:0;width:50%;bottom:0"></div>
    <section class="voile-h" style="position:absolute;top:0;left:50%;right:0;bottom:0"></section>
  </div>
</div>`;

export const Q16: BugInjectable = {
  id: 'Q16',
  nom: 'pied-deux-victimes',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
