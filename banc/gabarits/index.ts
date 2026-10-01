/** Registre des gabarits du banc. Ajouter un gabarit = l'importer et l'inscrire ici. */
import type { Gabarit } from '../types.js';
import { formulaireContact } from './formulaire-contact/index.js';
import { miniBoutique } from './mini-boutique/index.js';
import { formulairePuisNavigation } from './formulaire-puis-navigation/index.js';
import { catalogueBoutons } from './catalogue-boutons/index.js';
import { siteLent } from './site-lent/index.js';
import { calqueAuRejeu } from './calque-au-rejeu/index.js';
import { recouvrement } from './recouvrement/index.js';
import { tiersAuRobot } from './tiers-au-robot/index.js';

export const gabarits: Record<string, Gabarit> = {
  [formulaireContact.nom]: formulaireContact,
  [miniBoutique.nom]: miniBoutique,
  // Les trois gabarits du cahier P2-1 : ce que la campagne 6b a cassé, en miniature.
  [formulairePuisNavigation.nom]: formulairePuisNavigation,
  [catalogueBoutons.nom]: catalogueBoutons,
  [siteLent.nom]: siteLent,
  [calqueAuRejeu.nom]: calqueAuRejeu,
  [recouvrement.nom]: recouvrement,
  [tiersAuRobot.nom]: tiersAuRobot,
};

export function obtenirGabarit(nom: string): Gabarit {
  const gabarit = gabarits[nom];
  if (gabarit === undefined) {
    throw new Error(`Gabarit inconnu : ${nom} (connus : ${Object.keys(gabarits).join(', ')})`);
  }
  return gabarit;
}
