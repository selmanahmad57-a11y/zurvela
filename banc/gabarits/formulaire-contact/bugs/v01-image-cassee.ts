/**
 * V01 image-cassee : le logo de l'en-tête commun pointe vers une ressource
 * absente (`cheminRessourceIntrouvable`) — 404 naturel du serveur statique,
 * sur toutes les pages.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, PAGE_CONFIRMATION, PAGE_CONTACT, SELECTEUR_LOGO } from '../structure.js';

const pages = [PAGE_ACCUEIL, PAGE_CONTACT, PAGE_CONFIRMATION];

function lireChemin(parametres: Record<string, unknown>): string {
  const chemin = parametres['cheminRessourceIntrouvable'];
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) {
    throw new Error(`V01 : le paramètre cheminRessourceIntrouvable doit être un chemin d'URL commençant par « / » (reçu : ${String(chemin)})`);
  }
  return chemin;
}

export const V01: BugInjectable = {
  id: 'V01',
  nom: 'image-cassee',
  categorie: 'visuel',
  gravite: 'mineur',
  pages,
  validerParametres(parametres) {
    lireChemin(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (!pages.includes(chemin)) {
      return html;
    }
    return modifierAttribut(html, SELECTEUR_LOGO, 'src', lireChemin(contexte.parametres));
  },
};
