/**
 * Q08 ferme-sans-semantique : le cas the-internet, reproduit au banc.
 *
 * Un VOILE VIDE couvre le bloc des produits, et la seule prise est un `<p>`
 * qui porte un mot, logé dans le FRÈRE du voile — pas un `<button>`, pas un
 * `<a>`, pas de `role`, pas d'`aria-label`, et pleine largeur, donc hors de
 * tout « coin ». Les quatre premiers gestes échouent par construction :
 * Échap n'est pas écouté, ce n'est pas un `<dialog>`, aucune croix ARIA
 * n'existe, et un clic hors zone ne lève rien.
 *
 * Le voile est VIDE, et c'est essentiel : chercher la prise dans le seul
 * intercepteur ne trouve rien. Il faut remonter d'un cran, au parent qui
 * contient le voile ET la boîte. C'est ce que le réel a imposé, et ce que
 * la première version de ce gabarit ne reproduisait pas.
 *
 * Attendu : ÉCARTÉ par le cinquième geste, la VOIE C — on n'identifie pas
 * la prise, on l'essaie. Le libellé du `<p>` est volontairement un mot qui
 * n'existe dans aucune langue : si quelqu'un se mettait un jour à LIRE le
 * texte pour reconnaître un bouton de fermeture, ce gabarit continuerait de
 * passer et ne mesurerait plus rien — c'est pourquoi le test du gabarit
 * vérifie aussi l'absence de sémantique, et non seulement la fermeture.
 *
 * POURQUOI IL EXISTE : le réel l'a trouvé le premier (the-internet, modal
 * d'entrée, `<p>Close</p>` dans un `.modal-footer` pleine largeur), et la
 * leçon de la dette n°20 est qu'un contrat vérifié sur une cible vivante
 * seule finit par dériver. Le banc le porte désormais.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

/**
 * LA STRUCTURE EXACTE DU RÉEL, et c'est tout l'enjeu : un VOILE vide qui
 * recouvre, et la prise dans son FRÈRE. C'est la construction
 * conventionnelle d'un modal (`underlay` + boîte), et la première version
 * de ce gabarit la trahissait en logeant la prise DANS le voile — le banc
 * passait au vert pendant que the-internet restait rouge.
 */
const FRAGMENT = `<div id="modal-nu" style="position:absolute;inset:0;z-index:10"><div data-role="${ROLE_CALQUE}" id="voile-nu" style="position:absolute;inset:0;background:transparent"></div><div id="boite-nue" style="position:absolute;left:0;bottom:0;width:100%;height:20px"><p id="prise-nue">qwzx</p></div></div><script>document.getElementById('boite-nue').addEventListener('click',function(){document.getElementById('modal-nu').remove();});</script>`;

export const Q08: BugInjectable = {
  id: 'Q08',
  nom: 'ferme-sans-semantique',
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
