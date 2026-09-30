/**
 * W04 logo-introuvable : le logo de l'accueil pointe vers une ressource
 * absente (`cheminRessourceIntrouvable`) — 404 naturel du serveur statique.
 * Un défaut ORDINAIRE du site, que le protocole doit rejouer et confirmer.
 *
 * Son rôle est d'être REJOUÉ : c'est son rejeu qui recharge l'accueil
 * au-delà des visites de l'exploration, et fait tomber la balise de mesure
 * de W03 (combinaison W03 + W04). Même mécanique que D01 dans
 * « calque-au-rejeu », et même raison : sans un défaut à rejouer, il n'y a
 * pas de découverte.
 *
 * Sa CATÉGORIE compte autant que son rôle. L'appariement du correcteur est
 * structurel — catégorie × page —, donc le défaut rejoué et le tiers tu ne
 * peuvent pas partager les deux sans devenir indiscernables (le manifeste le
 * refuse, et il a raison). `visuel` contre `fonctionnel` : les deux attendus
 * du scénario restent notables séparément.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, SELECTEUR_LOGO } from '../structure.js';

function lireChemin(parametres: Record<string, unknown>): string {
  const chemin = parametres['cheminRessourceIntrouvable'];
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) {
    throw new Error(`W04 : le paramètre cheminRessourceIntrouvable doit être un chemin d'URL commençant par « / » (reçu : ${String(chemin)})`);
  }
  return chemin;
}

export const W04: BugInjectable = {
  id: 'W04',
  nom: 'logo-introuvable',
  categorie: 'visuel',
  gravite: 'mineur',
  pages: [PAGE_ACCUEIL],
  validerParametres(parametres) {
    lireChemin(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    return modifierAttribut(html, SELECTEUR_LOGO, 'src', lireChemin(contexte.parametres));
  },
};
