/**
 * Point d'entrée public du moteur.
 *
 * Tant que le moteur n'existe pas, `scanner` est le scanner factice : le
 * banc d'essai consomme déjà le contrat définitif (`Scanner` → `Rapport`).
 */
export type * from './types.js';
export { scannerFactice as scanner } from './scanner-factice.js';
