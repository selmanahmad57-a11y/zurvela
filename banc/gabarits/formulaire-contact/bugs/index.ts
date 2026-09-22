/** Registre ordonné des bugs injectables du gabarit « formulaire-contact ». */
import type { BugInjectable } from '../../../types.js';
import { F01 } from './f01-bouton-mort.js';
import { F02 } from './f02-echec-silencieux.js';
import { R01 } from './r01-api-lente.js';
import { V01 } from './v01-image-cassee.js';
import { M01 } from './m01-bouton-masque-mobile.js';

export const bugs: BugInjectable[] = [F01, F02, R01, V01, M01];
