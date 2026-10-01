/**
 * Q07 grille-repetee : chaque carte produit porte son propre calque
 * inamovible, posé en FRÈRE du lien de la carte — donc hors de sa région
 * activable, donc un vrai recouvrement, et non le calque de survol du
 * contrat 3. Les trois calques ont la MÊME construction : même balise,
 * mêmes classes, même chemin aux rangs de fratrie près.
 *
 * Attendu : UNE cause, trois localisations (contrat 4). Le gabarit est
 * déclaré `causeUnique`, donc la ligne « une cause, un constat » du banc
 * compte les constats publiés au-delà du premier : elle doit rester à
 * ZÉRO. C'est le legs de P2-2 — six intercepteurs d'automationexercise
 * sortaient en six sections.
 *
 * LIMITE DÉCLARÉE : ce gabarit mesure le sens « ça fond ». Le sens
 * inverse — deux calques réellement distincts qui ne doivent PAS fondre —
 * n'est pas exprimable par l'appariement du banc, qui est structurel
 * (catégorie × page) et ne sait pas distinguer deux causes sur une même
 * page. Il est éprouvé par les tests de `d-recouvrement`, dans les deux
 * sens et par mutation chirurgicale (dette n°24).
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { NB_PRODUITS, PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

/** Un calque par carte, tous de même construction : c'est l'égalité des signatures qui est mesurée. */
const FRAGMENT = Array.from(
  { length: NB_PRODUITS },
  (_, i) =>
    `<div data-role="${ROLE_CALQUE}" class="voile carte-voile" style="position:absolute;left:0;top:${i * 30}px;width:100%;height:28px;z-index:10;background:transparent"></div>`,
).join('');

export const Q07: BugInjectable = {
  id: 'Q07',
  nom: 'grille-repetee',
  categorie: 'fonctionnel',
  gravite: 'important',
  // Les trois calques masquent des liens du CORPS de la page : ni navigation
  // principale, ni pied de page — contrôle ordinaire (contrat 2).
  causeUnique: true,
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
