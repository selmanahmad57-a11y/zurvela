/**
 * Q02 dialog-natif : le bloc des produits est couvert par un `<dialog open>`
 * sans bouton de fermeture et sans écouteur de touche. Seule la fermeture
 * NATIVE du standard l'enlève.
 *
 * Attendu : ÉCARTÉ, rien de publié. Face « UN GESTE » de `dialog-natif` :
 * retirer ce geste de la liste doit faire échouer CE gabarit, et lui seul.
 * Un `<dialog>` ferme aussi à Échap dans un navigateur — c'est pourquoi la
 * page NEUTRALISE cette voie (`cancel` annulé) : sans cela, Échap suffirait
 * et le geste mesuré ne serait pas celui qu'on croit.
 *
 * `width`/`height` sont posés EXPLICITEMENT : la feuille de style par défaut
 * d'un `<dialog>` lui donne `fit-content`, et un `inset:0` ne l'étire donc
 * pas comme il étirerait un `div` — un dialogue vide mesurerait zéro pixel
 * et ne recouvrirait rien. Le gabarit ne mesurerait alors plus son geste.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<dialog data-role="${ROLE_CALQUE}" id="calque-dialog" open style="position:absolute;inset:0;width:100%;height:100%;z-index:10;margin:0;padding:0;border:0;background:transparent"></dialog><script>document.getElementById('calque-dialog').addEventListener('cancel',function(e){e.preventDefault();});</script>`;

export const Q02: BugInjectable = {
  id: 'Q02',
  nom: 'dialog-natif',
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
