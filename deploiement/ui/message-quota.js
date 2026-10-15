// @ts-check
/**
 * CLÉ DU MESSAGE QUOTA — SOURCE UNIQUE (navigateur ET témoin), miroir de
 * `message-echec.js`. Le 429 porte une `portee ∈ RaisonQuota` (le débit atteint :
 * limite du site, globale, de dépense, ou d'envois) ; l'UI la traduit par la clé
 * `interface.quota.<portee>`, identité préfixée de la portée. Le navigateur et la
 * ceinture d'exhaustivité importent CETTE fonction, donc le préfixe ne peut pas
 * diverger entre eux. L'exhaustivité (chaque portée a un message) est gardée au
 * runtime par `message-quota.test.ts` (tsc ne voit pas le JSON).
 */

/** @typedef {import('../../core/publication/quota.js').RaisonQuota} RaisonQuota */

/**
 * Dérive la clé de locale du message quota pour une portée.
 * @param {RaisonQuota} portee
 * @returns {string}
 */
export function cleMessageQuota(portee) {
  return 'interface.quota.' + portee;
}
