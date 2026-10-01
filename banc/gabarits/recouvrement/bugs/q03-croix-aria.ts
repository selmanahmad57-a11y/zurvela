/**
 * Q03 croix-aria : un calque couvre le bloc des produits et porte, dans son
 * coin, un petit bouton `aria-label` qui le retire. Rien d'autre ne l'enlève.
 *
 * Attendu : ÉCARTÉ, rien de publié. Face « UN GESTE » de `controle-ferme`.
 * Le moteur trouve ce bouton par sa FORME — petit, dans un coin, porteur
 * d'un `aria-label` — et JAMAIS par son texte : le libellé du bouton est ici
 * volontairement un mot qui ne veut rien dire dans aucune langue, pour que
 * le gabarit rougisse si quelqu'un se mettait un jour à le lire.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" id="calque-croix" style="position:absolute;inset:0;z-index:10;background:transparent"><button type="button" id="croix" aria-label="zzqx" style="position:absolute;right:2px;top:2px;width:16px;height:16px"></button></div><script>document.getElementById('croix').addEventListener('click',function(){document.getElementById('calque-croix').remove();});</script>`;

export const Q03: BugInjectable = {
  id: 'Q03',
  nom: 'croix-aria',
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
