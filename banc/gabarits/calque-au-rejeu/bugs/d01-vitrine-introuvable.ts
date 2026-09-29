/**
 * D01 vitrine-introuvable : l'image de vitrine de l'accueil pointe vers une
 * ressource absente (`cheminRessourceIntrouvable`) — 404 naturel du serveur
 * statique. Un défaut ORDINAIRE, que le protocole doit rejouer et confirmer.
 *
 * Seul, il éprouve peu (V01 couvre déjà l'image cassée). Son rôle est d'être
 * REJOUÉ : c'est son rejeu qui recharge l'accueil au-delà des visites de
 * l'exploration, et fait voir le calque de D02 (combinaison D01 + D02).
 * Scénario seul : le TÉMOIN de la combinaison — sans D02, aucune découverte.
 */
import type { BugInjectable } from '../../../types.js';
import { modifierAttribut } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, SELECTEUR_VITRINE } from '../structure.js';

function lireChemin(parametres: Record<string, unknown>): string {
  const chemin = parametres['cheminRessourceIntrouvable'];
  if (typeof chemin !== 'string' || !chemin.startsWith('/')) {
    throw new Error(`D01 : le paramètre cheminRessourceIntrouvable doit être un chemin d'URL commençant par « / » (reçu : ${String(chemin)})`);
  }
  return chemin;
}

export const D01: BugInjectable = {
  id: 'D01',
  nom: 'vitrine-introuvable',
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
    return modifierAttribut(html, SELECTEUR_VITRINE, 'src', lireChemin(contexte.parametres));
  },
};
