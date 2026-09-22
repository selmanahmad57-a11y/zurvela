/**
 * Politique de décision déterministe : la structure que l'IA pilotera plus
 * tard (menu FERMÉ d'actions, constitution §3). Ici : remplir tout
 * formulaire non rempli, soumettre tout formulaire rempli non soumis, puis
 * visiter toute URL en attente, sinon terminer.
 */
import type { Action, ContexteDecision, Politique } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { choisirValeurs } from './remplissage.js';

export const RAISON_PLUS_RIEN = 'plus-rien-a-faire';

/** Fabrique la politique : les valeurs de remplissage viennent de la config (données de test marquées). */
export function politiqueDeterministe(remplissage: ConfigScanner['remplissage']): Politique {
  return {
    nom: 'deterministe',
    decider(contexte: ContexteDecision): Action {
      const { pageCourante, formulairesRemplis, formulairesSoumis, urlsEnAttente } = contexte;
      const aRemplir = pageCourante.formulaires.find((f) => !formulairesRemplis.includes(f.localisation.selecteur));
      if (aRemplir !== undefined) {
        return { type: 'remplir', formulaire: aRemplir.localisation, valeurs: choisirValeurs(aRemplir, remplissage) };
      }
      const aSoumettre = pageCourante.formulaires.find((f) => !formulairesSoumis.includes(f.localisation.selecteur));
      if (aSoumettre !== undefined) {
        return { type: 'soumettre', formulaire: aSoumettre.localisation, declencheur: aSoumettre.declencheur };
      }
      const url = urlsEnAttente[0];
      if (url !== undefined) {
        return { type: 'naviguer', url };
      }
      return { type: 'terminer', raison: RAISON_PLUS_RIEN };
    },
  };
}
