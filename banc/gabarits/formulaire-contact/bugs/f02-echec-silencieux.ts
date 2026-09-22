/**
 * F02 echec-silencieux : la soumission échoue côté serveur (500) mais
 * l'interface n'affiche rien et reste figée.
 *
 * Deux transformations complémentaires : l'API répond 500, et le bloc de
 * gestion d'erreur de formulaire.js est retiré — la fonction devient vide,
 * la zone d'erreur reste cachée et le bouton reste désactivé.
 */
import type { BugInjectable } from '../../../types.js';
import { retirerBlocs } from '../../../outils/transformations.js';
import { BLOC_GESTION_ERREUR, CHEMIN_SCRIPT_FORMULAIRE, PAGE_CONTACT } from '../structure.js';

export const F02: BugInjectable = {
  id: 'F02',
  nom: 'echec-silencieux',
  categorie: 'fonctionnel',
  gravite: 'bloquant',
  pages: [PAGE_CONTACT],
  async transformerReponseApi(reponse) {
    return { ...reponse, statut: 500, corps: JSON.stringify({ ok: false }) };
  },
  transformerRessourceTexte(chemin, contenu) {
    if (chemin !== CHEMIN_SCRIPT_FORMULAIRE) {
      return contenu;
    }
    return retirerBlocs(contenu, BLOC_GESTION_ERREUR);
  },
};
