/** Registre des gabarits du banc. Ajouter un gabarit = l'importer et l'inscrire ici. */
import type { Gabarit } from '../types.js';
import { formulaireContact } from './formulaire-contact/index.js';
import { miniBoutique } from './mini-boutique/index.js';

export const gabarits: Record<string, Gabarit> = {
  [formulaireContact.nom]: formulaireContact,
  [miniBoutique.nom]: miniBoutique,
};

export function obtenirGabarit(nom: string): Gabarit {
  const gabarit = gabarits[nom];
  if (gabarit === undefined) {
    throw new Error(`Gabarit inconnu : ${nom} (connus : ${Object.keys(gabarits).join(', ')})`);
  }
  return gabarit;
}
