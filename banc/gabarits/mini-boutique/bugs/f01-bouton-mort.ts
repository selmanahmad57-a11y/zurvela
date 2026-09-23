/**
 * F01 bouton-mort, sur le FORMULAIRE CRITIQUE de la mini-boutique.
 *
 * Même transformation que sur le gabarit n°1 — `type="submit"` devient
 * `type="button"`, le gestionnaire `submit` ne s'exécute plus — mais elle
 * n'éprouve pas la même chose : sous budget contraint, la page qui porte le
 * bug n'est atteinte que par une navigation qui a su choisir. La DÉTECTION
 * elle-même dépend donc de la décision, et non plus seulement le chemin.
 * C'est la preuve que la navigation IA change le RÉSULTAT, pas l'itinéraire.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_DEVIS, SELECTEUR_BOUTON_DEVIS } from '../structure.js';

const pages = [PAGE_DEVIS];

export const F01: BugInjectable = {
  id: 'F01',
  nom: 'bouton-mort',
  categorie: 'fonctionnel',
  gravite: 'bloquant',
  pages,
  transformerHtml(html, chemin) {
    if (!pages.includes(chemin)) {
      return html;
    }
    return modifierAttribut(html, SELECTEUR_BOUTON_DEVIS, 'type', 'button');
  },
};
