/**
 * Q09 freres-sans-classe : le cas automationexercise, reproduit au banc.
 *
 * Plusieurs `<li>` frères d'un même `<ul>`, SANS CLASSE et sans aucun
 * attribut, recouvrent chacun un lien. Rien ne les distingue hors leur
 * rang : ce sont les éléments d'une série, et le balisage le déclare par
 * la relation `ul`/`li`.
 *
 * Attendu : UNE cause (`causeUnique`), donc la ligne « une cause, un
 * constat » reste à ZÉRO. Sans la seconde voie de fusion — les frères
 * immédiats de même balise —, leur signature serait nulle et chacun
 * sortirait en section : six sections sur le réel, là où il y a un défaut.
 *
 * SON JUMEAU EST Q10, et il faut les deux : celui-ci prouve que ça FOND,
 * Q10 prouve que ça ne fond pas à tort. Le second est le sens qui perd des
 * signaux, donc le plus grave.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { NB_PRODUITS, PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

/** Une liste de calques nus : même balise, même parent, aucun attribut distinctif. */
const FRAGMENT = `<ul id="serie-nue" style="position:absolute;inset:0;z-index:10;margin:0;padding:0;list-style:none">${Array.from(
  { length: NB_PRODUITS },
  (_, i) => `<li style="position:absolute;left:0;top:${i * 30}px;width:100%;height:28px;background:transparent"></li>`,
).join('')}</ul><div data-role="${ROLE_CALQUE}" hidden></div>`;

export const Q09: BugInjectable = {
  id: 'Q09',
  nom: 'freres-sans-classe',
  categorie: 'fonctionnel',
  gravite: 'important',
  causeUnique: true,
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
