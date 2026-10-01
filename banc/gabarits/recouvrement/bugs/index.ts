import type { BugInjectable } from '../../../types.js';
import { Q01 } from './q01-modal-echap.js';
import { Q02 } from './q02-dialog-natif.js';
import { Q03 } from './q03-croix-aria.js';
import { Q04 } from './q04-clic-hors-zone.js';
import { Q05 } from './q05-mur-sur-commande.js';
import { Q06 } from './q06-mur-sur-pied.js';
import { Q07 } from './q07-grille-repetee.js';

export const bugs: BugInjectable[] = [Q01, Q02, Q03, Q04, Q05, Q06, Q07];
