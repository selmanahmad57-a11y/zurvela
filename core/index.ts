/**
 * Point d'entrée public du moteur.
 *
 * `scanner` est le scanner réel, assemblé paresseusement au premier scan
 * (config, navigateur, détecteurs) et mémoïsé ensuite : importer ce module
 * ne charge ni Playwright ni la config. `scannerFactice` reste exporté pour
 * que le banc puisse vérifier qu'il n'a pas lui-même régressé.
 */
import type { Scanner } from './types.js';

export type * from './types.js';
export { scannerFactice } from './scanner-factice.js';

let assemblage: Promise<Scanner> | undefined;

/** L'assemblage est fait une fois ; s'il échoue, il sera retenté au scan suivant plutôt que mémoïsé en échec. */
function obtenirScannerReel(): Promise<Scanner> {
  assemblage ??= import('./scanner/defaut.js')
    .then((module) => module.creerScannerParDefaut())
    .catch((erreur: unknown) => {
      assemblage = undefined;
      throw erreur;
    });
  return assemblage;
}

export const scanner: Scanner = async function scannerReel(url, options) {
  return (await obtenirScannerReel())(url, options);
};
