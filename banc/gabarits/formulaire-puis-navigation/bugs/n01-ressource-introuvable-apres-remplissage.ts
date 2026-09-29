/**
 * N01 ressource-introuvable-apres-remplissage : l'image vedette du catalogue
 * pointe vers une ressource absente (`cheminRessourceIntrouvable`) — 404
 * naturel du serveur statique, sur la page ATTEINTE APRÈS le formulaire.
 *
 * Ce que ce bug éprouve n'est pas la détection (V01 la couvre déjà) : c'est
 * la RECETTE DE REPRODUCTION. La déterministe remplit `/inscription`, puis
 * navigue vers `/catalogue` ; la candidate porte donc un préalable (le
 * remplissage) qui vient de la page d'ORIGINE, et l'anomalie se voit sur la
 * page d'ARRIVÉE. Avant le cahier P2-1, le rejeu ouvrait `/catalogue` et y
 * cherchait le formulaire de `/inscription` : sélecteur introuvable, limite
 * d'automatisation, 0 % rejoué. Avec le contrat 1, il s'ouvre sur
 * `/inscription`, remplit, navigue — et reproduit.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_CATALOGUE, SELECTEUR_VEDETTE } from '../structure.js';

function lireChemin(parametres: Record<string, unknown>): string {
  const chemin = parametres['cheminRessourceIntrouvable'];
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) {
    throw new Error(`N01 : le paramètre cheminRessourceIntrouvable doit être un chemin d'URL commençant par « / » (reçu : ${String(chemin)})`);
  }
  return chemin;
}

export const N01: BugInjectable = {
  id: 'N01',
  nom: 'ressource-introuvable-apres-remplissage',
  categorie: 'visuel',
  gravite: 'mineur',
  pages: [PAGE_CATALOGUE],
  validerParametres(parametres) {
    lireChemin(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_CATALOGUE) {
      return html;
    }
    return modifierAttribut(html, SELECTEUR_VEDETTE, 'src', lireChemin(contexte.parametres));
  },
};
