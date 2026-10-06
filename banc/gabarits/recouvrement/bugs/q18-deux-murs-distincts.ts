/**
 * Q18 deux-murs-distincts : DEUX murs couvrants de constructions DIFFÉRENTES,
 * un sur l'accueil, un sur le panier. Sens grave de l'asymétrie « on ne fond
 * que sur preuve » (P2-3) appliqué au mur : deux murs distincts ne fondent
 * PAS en un seul — la signature de construction de l'ancêtre couvrant les
 * sépare. Sinon on perdrait un signal (deux phénomènes réunis à tort).
 *
 * Attendu après le fix : DEUX causes (une par mur). Sens validé par l'owner
 * (point 2) : deux murs différents sur 2 pages → deux causes.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, PAGE_PANIER, ROLE_CALQUE, SELECTEUR_PIED } from '../structure.js';

const mur = (cls: string, va: string, vb: string) => `<a data-role="${ROLE_CALQUE}" href="/statique/${cls}-1" style="position:fixed;top:100px;left:40px;width:90px;height:24px;z-index:1">a</a>
<a href="/statique/${cls}-2" style="position:fixed;top:300px;left:40px;width:90px;height:24px;z-index:1">b</a>
<div class="${cls}" style="position:fixed;inset:0;z-index:5;background:transparent">
  <div class="${va}" style="position:absolute;top:0;left:0;right:0;height:200px"></div>
  <section class="${vb}" style="position:absolute;top:200px;left:0;right:0;bottom:0"></section>
</div>`;

export const Q18: BugInjectable = {
  id: 'Q18',
  nom: 'deux-murs-distincts',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL, PAGE_PANIER],
  transformerHtml(html, chemin) {
    if (chemin === PAGE_ACCUEIL) return insererApresElement(html, SELECTEUR_PIED, mur('mur-alpha', 'alpha-a', 'alpha-b'));
    if (chemin === PAGE_PANIER) return insererApresElement(html, SELECTEUR_PIED, mur('mur-beta', 'beta-a', 'beta-b'));
    return html;
  },
};
