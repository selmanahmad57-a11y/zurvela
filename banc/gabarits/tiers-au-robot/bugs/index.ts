import type { BugInjectable } from '../../../types.js';
import { W01 } from './w01-police-refusee-au-robot.js';
import { W02 } from './w02-script-avis-en-panne.js';
import { W03 } from './w03-mesure-tardive-au-rejeu.js';
import { W04 } from './w04-logo-introuvable.js';

export const bugs: BugInjectable[] = [W01, W02, W03, W04];
