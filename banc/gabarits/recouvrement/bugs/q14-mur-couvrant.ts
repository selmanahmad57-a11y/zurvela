/**
 * Q14 mur-couvrant : UN overlay couvrant (plein viewport, non écartable)
 * dont le SOUS-ARBRE porte des nœuds interceptants de signatures DISTINCTES
 * (`div.voile-a`, `section.voile-b`). C'est la forme exacte du mur de
 * consentement d'automationexercise (grand tableau 2026-10-06) : un seul mur,
 * mais `cleCause` ancre sur le nœud interceptant le plus profond, et deux
 * signatures distinctes ne fondent pas → N sections pour UN mur.
 *
 * Un overlay PLAT (`inset:0` sans enfants) fondrait déjà en une cause (même
 * intercepteur, niveau 2 de `cleCause`) : il ne reproduirait PAS le défaut.
 * Le témoin exige donc le sous-arbre à signatures multiples.
 *
 * NON ÉCARTABLE par aucun geste neutre (P2-3) : pas de `Escape`, pas de
 * `<dialog>`, aucun descendant à `aria-label` dans un coin, aucun point vide
 * (plein viewport), aucun descendant dont l'activation le ferme (voiles
 * inertes). Il tombe donc dans « non écartable », et c'est là que (A) décide
 * quoi publier : UNE cause « un élément recouvre l'interface », pas N.
 *
 * Deux victimes en `position:fixed`, DANS le viewport (pas de défilement qui
 * les recentrerait toutes deux sur la même voile) : v1 sous `div.voile-a`
 * (haut), v2 sous `section.voile-b` (bas). Attendu APRÈS (A) : une cause.
 * Attendu AUJOURD'HUI : deux (le témoin rouge).
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

/** Les deux victimes du mur, repérables dans les tests. */
export const ROLE_VICTIME_HAUT = 'mur-victime-haut';
export const ROLE_VICTIME_BAS = 'mur-victime-bas';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="mur-couvrant-hote" style="position:relative">
  <a data-role="${ROLE_VICTIME_HAUT}" href="/statique/mur-haut" style="position:fixed;top:100px;left:40px;width:90px;height:24px;z-index:1">haut</a>
  <a data-role="${ROLE_VICTIME_BAS}" href="/statique/mur-bas" style="position:fixed;top:300px;left:40px;width:90px;height:24px;z-index:1">bas</a>
  <div class="mur-couvrant" style="position:fixed;inset:0;z-index:5;background:transparent">
    <div class="voile-a" style="position:absolute;top:0;left:0;right:0;height:200px"></div>
    <section class="voile-b" style="position:absolute;top:200px;left:0;right:0;bottom:0"></section>
  </div>
</div>`;

export const Q14: BugInjectable = {
  id: 'Q14',
  nom: 'mur-couvrant',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
