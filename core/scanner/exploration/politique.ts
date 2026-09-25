/**
 * Politique de décision déterministe : remplir tout formulaire non rempli,
 * soumettre tout formulaire rempli non soumis, puis visiter toute URL en
 * attente, sinon terminer.
 *
 * ── ELLE ÉLIT DANS LE MENU ÉNUMÉRÉ, COMME L'IA (dette n°18, 2026-09-25) ──────
 *
 * Elle prend la PREMIÈRE action énumérée. C'est tout, et c'est exact :
 * `enumererActions` produit les actions dans l'ordre de priorité déterministe
 * — remplir, soumettre, naviguer, terminer —, donc la première est celle que
 * l'algorithme d'origine aurait choisie. `politique.non-regression.test.ts`
 * le prouve sur tout l'espace d'états : pas une décision ne bouge.
 *
 * Elle ne lisait PAS l'énumération jusqu'ici, et c'était écrit comme une
 * décision : « elle tranche sur le contexte, comme avant ». Cette
 * justification décrivait un monde où l'énumération n'était qu'une vue pour
 * le modèle. Elle est devenue une COUCHE DE SÉCURITÉ le jour où le gate de
 * soumission s'y est installé : en mode `aucune`, le menu ne propose plus
 * `soumettre`, mais la déterministe le proposait encore — la couche 1 la
 * refusait, appelait le secours (elle-même), refusait encore, et s'ARRÊTAIT.
 * Une justification que rien ne ré-éprouve survit à ses raisons
 * (APPRENTISSAGES n°5, appliqué aux décisions).
 *
 * Désormais les deux politiques sont sous le même contrat de menu, et tout
 * gate futur gouverne la déterministe par construction. Sa gratuité est
 * intacte : l'énumération est déjà calculée quand elle est appelée.
 *
 * Elle a un second emploi : elle est le REPLI PAR DÉCISION de la politique
 * IA. Le repli ne doit jamais pouvoir échouer à son tour — et une action prise
 * dans le menu ne peut pas être refusée par le menu.
 */
import type { Action, ContexteDecision, DecisionPrise, EtatDecisionEnumere, PolitiqueDecision } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { choisirValeurs } from './remplissage.js';

export const RAISON_PLUS_RIEN = 'plus-rien-a-faire';

/** Nom (identifiant technique stable) de la politique déterministe : il voyage jusqu'au rapport. */
export const NOM_POLITIQUE_DETERMINISTE = 'deterministe';

/**
 * L'algorithme d'origine, synchrone et pur, conservé comme SPÉCIFICATION de
 * l'ordre déterministe : `politique.non-regression.test.ts` vérifie que la
 * première action énumérée lui est identique sur tout l'espace d'états non
 * gaté. Il n'est plus appelé par la politique elle-même.
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

/**
 * Fabrique la politique. Elle ne reçoit plus les valeurs de remplissage : elles
 * sont déjà dans les actions énumérées (`enumererActions` les y a posées), et
 * un paramètre qu'on garderait sans le lire aurait l'air de servir — c'est
 * l'apprentissage n°5 sous une autre forme.
 */
export function politiqueDeterministe(): PolitiqueDecision {
  return {
    nom: NOM_POLITIQUE_DETERMINISTE,
    decider(_contexte: ContexteDecision, etat: EtatDecisionEnumere): Promise<DecisionPrise> {
      // Le menu n'est jamais vide quand une décision est demandée (`terminer`
      // y figure toujours). Le repli reste tout de même total : une politique
      // de secours qui pourrait lever ne serait pas un secours.
      const premiere = etat.actions[0];
      const action: Action = premiere === undefined ? { type: 'terminer', raison: RAISON_PLUS_RIEN } : premiere.action;
      return Promise.resolve({ action, politique: NOM_POLITIQUE_DETERMINISTE });
    },
  };
}
