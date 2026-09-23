/** Registre ordonné des bugs injectables du gabarit « formulaire-contact ». */
import type { BugInjectable } from '../../../types.js';
import { F01 } from './f01-bouton-mort.js';
import { F02 } from './f02-echec-silencieux.js';
import { R01 } from './r01-api-lente.js';
import { V01 } from './v01-image-cassee.js';
import { M01 } from './m01-bouton-masque-mobile.js';
import { I01 } from './i01-api-intermittente.js';
import { T01 } from './t01-echec-transitoire.js';
import { L01 } from './l01-lenteur-transitoire.js';
import { S01 } from './s01-injection-profil.js';

export const bugs: BugInjectable[] = [F01, F02, R01, V01, M01, I01, T01, L01, S01];
