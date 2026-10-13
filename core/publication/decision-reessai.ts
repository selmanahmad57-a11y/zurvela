/**
 * DÉCISION DE RÉESSAI (interface marchande), pure, appliquée côté UI (archi B).
 *
 * Au clic « réessayer », l'UI re-GETerait la MÊME URL du jeton courant. C'est sûr
 * SSI aucune réponse cachable n'y a été servie ET le jeton n'était pas déjà mort
 * — les deux FAITS que le serveur a CONSTATÉS (seul témoin du GET) et fait
 * remonter dans l'échec de /scanner (`reessai: {reponseServie, jetonMort}`).
 * L'UI applique la règle ; elle ne re-constate rien (n°44 : un constat voyage, il
 * ne se re-calcule pas chez le récepteur). `url-invalide` n'a pas de contexte de
 * réessai (`reessai` absent) → il n'entre jamais ici.
 */

/** Les deux faits stables du contexte de réessai, constatés par le serveur. */
export interface FaitsReessai {
  /** Une réponse HTTP (donc potentiellement cachée au CDN) a été servie à l'URL du jeton. */
  readonly reponseServie: boolean;
  /** Le jeton était déjà mort À L'ÉCHEC (absent/expiré) — fait stable (un jeton mort le reste). */
  readonly jetonMort: boolean;
}

export type IntentionReessai = 'reverifier' | 'resoumettre';

/**
 * LE CRITÈRE, et rien d'autre. `resoumettre` (re-GET la même URL, jeton courant)
 * est sûr SSI rien de cachable n'a été servi ET le jeton n'était pas mort ; sinon
 * `reverifier` (jeton neuf, nouvelle URL — à l'épreuve du cache CDN / du jeton mort).
 *
 * Espace de 4 états, 3 ATTEIGNABLES. `{reponseServie:true, jetonMort:true}` est
 * INATTEIGNABLE par construction (jeton mort ⟹ retour avant le GET ⟹ rien servi),
 * prouvé à la source par le témoin des faits d'acheverVerification (aucune
 * `RaisonEchec` ne le produit). Le critère le traite comme tout état servi
 * (reverifier), mais aucune vérification ne le construit.
 */
export function decisionReessai(faits: FaitsReessai): IntentionReessai {
  const reGetSur = !faits.reponseServie && !faits.jetonMort;
  return reGetSur ? 'resoumettre' : 'reverifier';
}
