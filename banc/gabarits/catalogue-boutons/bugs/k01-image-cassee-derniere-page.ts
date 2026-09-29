/**
 * K01 image-cassee-derniere-page : sur la DERNIÈRE page du catalogue, l'image
 * du premier article pointe vers une ressource absente — 404 naturel du
 * serveur statique.
 *
 * Ce que ce bug éprouve n'est pas la détection d'une image cassée (V01 la
 * couvre) : c'est que l'exploration ARRIVE jusqu'à la dernière page. Avant le
 * cahier P2-1 (contrat 3), le menu énumérait `remplir` sur chacun des vingt
 * formulaires-boutons de chaque page, la déterministe les « remplissait »
 * tous — vingt secondes par page pour rien — et la réserve d'exploration
 * était épuisée avant la dernière page : le défaut n'était jamais vu.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_IMAGE_CASSEE, SELECTEUR_ARTICLE_UN } from '../structure.js';

function lireChemin(parametres: Record<string, unknown>): string {
  const chemin = parametres['cheminRessourceIntrouvable'];
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) {
    throw new Error(`K01 : le paramètre cheminRessourceIntrouvable doit être un chemin d'URL commençant par « / » (reçu : ${String(chemin)})`);
  }
  return chemin;
}

export const K01: BugInjectable = {
  id: 'K01',
  nom: 'image-cassee-derniere-page',
  categorie: 'visuel',
  gravite: 'mineur',
  pages: [PAGE_IMAGE_CASSEE],
  validerParametres(parametres) {
    lireChemin(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_IMAGE_CASSEE) {
      return html;
    }
    return modifierAttribut(html, SELECTEUR_ARTICLE_UN, 'src', lireChemin(contexte.parametres));
  },
};
