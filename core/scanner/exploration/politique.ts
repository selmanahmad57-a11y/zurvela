/**
 * Politique de décision déterministe : remplir tout formulaire non rempli,
 * soumettre tout formulaire rempli non soumis, puis visiter toute URL en
 * attente, sinon terminer.
 *
 * Elle implémente désormais `PolitiqueDecision` (asynchrone, rend une
 * `DecisionPrise`) : c'est la MÊME interface que la politique IA, pour que
 * le moteur ne sache jamais laquelle il pilote. Elle ignore l'énumération —
 * elle tranche sur le contexte, comme avant.
 *
 * Son comportement est INCHANGÉ par la migration : `decisionDeterministe`
 * est l'algorithme d'origine, extrait tel quel, et `politique.non-regression.test.ts`
 * le confronte à une copie de l'implémentation d'avant la bascule.
 *
 * Elle a un second emploi, qui n'existait pas : elle est le REPLI PAR
 * DÉCISION de la politique IA. C'est pourquoi elle reste gratuite et sans
 * dépendance — le repli ne doit jamais pouvoir échouer à son tour.
 */
import type { Action, ContexteDecision, DecisionPrise, PolitiqueDecision } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { choisirValeurs } from './remplissage.js';

export const RAISON_PLUS_RIEN = 'plus-rien-a-faire';

/** Nom (identifiant technique stable) de la politique déterministe : il voyage jusqu'au rapport. */
export const NOM_POLITIQUE_DETERMINISTE = 'deterministe';

/**
 * Le coeur d'origine, synchrone et pur. Extrait de l'ancienne `Politique`
 * sans une ligne de changement : c'est lui que le test de non-régression
 * compare à l'implémentation d'avant la migration.
 */
export function decisionDeterministe(contexte: ContexteDecision, remplissage: ConfigScanner['remplissage']): Action {
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
}

/** Fabrique la politique : les valeurs de remplissage viennent de la config (données de test marquées). */
export function politiqueDeterministe(remplissage: ConfigScanner['remplissage']): PolitiqueDecision {
  return {
    nom: NOM_POLITIQUE_DETERMINISTE,
    // L'énumération lui est passée comme à toute politique ; elle ne la lit
    // pas. C'est délibéré : la gratuité de la politique déterministe est ce
    // que la jumelle coût/efficacité du banc met en face du prix de l'IA.
    decider(contexte: ContexteDecision): Promise<DecisionPrise> {
      return Promise.resolve({ action: decisionDeterministe(contexte, remplissage), politique: NOM_POLITIQUE_DETERMINISTE });
    },
  };
}
