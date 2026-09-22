/**
 * F01 bouton-mort : le bouton « envoyer » ne déclenche plus rien.
 *
 * `type="submit"` devient `type="button"` : le clic ne soumet plus le
 * formulaire, donc le gestionnaire `submit` de formulaire.js ne s'exécute
 * jamais. Le script, lui, est servi intact.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_CONTACT, SELECTEUR_BOUTON_ENVOYER } from '../structure.js';

const pages = [PAGE_CONTACT];

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
    return modifierAttribut(html, SELECTEUR_BOUTON_ENVOYER, 'type', 'button');
  },
};
