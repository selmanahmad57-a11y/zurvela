/**
 * W02 script-avis-en-panne : l'accueil charge le script d'avis clients d'une
 * seconde origine, puis l'APPELLE pour remplir son bloc d'avis. La seconde
 * origine est en panne (503) : l'appel lève une erreur JavaScript et le bloc
 * reste vide. L'EFFET est VISIBLE (cahier P2-2, contrat 1).
 *
 * Attendu : PUBLIÉ, confirmé au rejeu, et imputé au site — c'est le site qui
 * a choisi de dépendre de ce tiers (APPRENTISSAGES n°19). C'est l'autre sens
 * du contrat 1 : un jugement trop étroit enterrerait ce défaut, et le banc
 * doit pouvoir le dire.
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { CHEMIN_SCRIPT_AVIS, PAGE_ACCUEIL, SELECTEUR_AVIS } from '../structure.js';

export const W02: BugInjectable = {
  id: 'W02',
  nom: 'script-avis-en-panne',
  categorie: 'fonctionnel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  besoinOrigineTierce: true,
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    if (contexte.origineTierce === null) {
      throw new Error('W02 : aucune origine tierce fournie alors que le bug la déclare nécessaire');
    }
    // Le script tiers, puis l'appel que la page lui fait : sans le premier, le
    // second lève — c'est l'effet visible, sans lire aucun message d'erreur.
    const scripts = `<script src="${contexte.origineTierce}${CHEMIN_SCRIPT_AVIS}"></script><script>window.AvisTiers.afficher(document.querySelector('[data-role="avis"]'));</script>`;
    return insererApresElement(html, SELECTEUR_AVIS, scripts);
  },
  // La seconde origine répond en panne à tout : le comportement par défaut du
  // serveur tiers, rien à servir ici.
};
