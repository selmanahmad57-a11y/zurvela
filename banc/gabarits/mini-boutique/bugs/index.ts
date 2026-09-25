/** Registre ordonné des bugs injectables du gabarit « mini-boutique ». */
import type { BugInjectable } from '../../../types.js';
import { F01 } from './f01-bouton-mort.js';
import { S03 } from './s03-injection-navigation.js';
import { S04 } from './s04-injection-maintenance.js';
import { R02 } from './r02-chemin-interdit.js';

export const bugs: BugInjectable[] = [F01, R02, S03, S04];
