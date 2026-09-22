/**
 * Compteur de requêtes partagé par les bugs DÉTERMINISTES à compteur
 * (I01, T01, L01).
 *
 * Le compteur vit dans l'état mutable du bug, créé vide au DÉMARRAGE du
 * serveur de scénario : un scénario relancé repart du rang 1, sans aucun
 * aléa. C'est ce qui rend les trois exécutions du banc identiques.
 */
import type { ContexteBug } from '../../../types.js';

/** Clé du compteur dans l'état mutable du bug. */
const CLE_RANG = 'nbRequetesApi';

/** Compte cette requête et rend son rang dans la vie du scénario (1 = la première). */
export function rangRequete(contexte: ContexteBug): number {
  const precedent = contexte.etat[CLE_RANG];
  const rang = (typeof precedent === 'number' ? precedent : 0) + 1;
  contexte.etat[CLE_RANG] = rang;
  return rang;
}
