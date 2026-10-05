import type { BugInjectable } from '../../../types.js';
import { Q01 } from './q01-modal-echap.js';
import { Q02 } from './q02-dialog-natif.js';
import { Q03 } from './q03-croix-aria.js';
import { Q04 } from './q04-clic-hors-zone.js';
import { Q05 } from './q05-mur-sur-commande.js';
import { Q06 } from './q06-mur-sur-pied.js';
import { Q07 } from './q07-grille-repetee.js';
import { Q08 } from './q08-ferme-sans-semantique.js';
import { Q09 } from './q09-freres-sans-classe.js';
import { Q10 } from './q10-freres-distincts.js';
import { Q11 } from './q11-calque-position-volatile.js';
import { Q12 } from './q12-calque-sans-ancre.js';
import { Q13 } from './q13-id-suffixe-numerique.js';
import { L04 } from './l04-document-lent-decouvert.js';
import { L05 } from './l05-ressource-bloque-load.js';

export const bugs: BugInjectable[] = [Q01, Q02, Q03, Q04, Q05, Q06, Q07, Q08, Q09, Q10, Q11, Q12, Q13, L04, L05];
