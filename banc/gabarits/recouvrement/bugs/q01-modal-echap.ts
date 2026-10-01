/**
 * Q01 modal-echap : un calque couvre le bloc des produits, et un écouteur de
 * la page le retire à la touche Échap — rien d'autre ne l'enlève.
 *
 * Attendu : ÉCARTÉ, traversé, RIEN de publié, et le compte des écartements
 * supérieur à zéro. C'est la FACE 1 du contrat 1, et un attendu POSITIF : un
 * gabarit qui disparaîtrait pour une mauvaise raison — calque jamais posé,
 * donc rien à écarter — doit faire rougir le banc.
 *
 * C'est aussi la face « UN GESTE » d'Échap : retirer `echap` de la liste de
 * config doit faire échouer CE gabarit, et lui seul.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" id="calque-echap" style="position:absolute;inset:0;z-index:10;background:transparent"></div><script>document.addEventListener('keydown',function(e){if(e.key==='Escape'){var c=document.getElementById('calque-echap');if(c){c.remove();}}});</script>`;

export const Q01: BugInjectable = {
  id: 'Q01',
  nom: 'modal-echap',
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
