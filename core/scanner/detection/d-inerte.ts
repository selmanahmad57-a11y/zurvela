/**
 * D-INERTE : une soumission exécutée sans AUCUN effet observable (ni
 * requête, ni requête en attente, ni navigation, ni mutation SIGNIFICATIVE
 * du DOM) dans la fenêtre d'effet → `element-sans-effet`. Couvre F01.
 *
 * Mutation significative : hors bruit de fond — une page qui anime un
 * carrousel ou une horloge ne « réagit » pas au clic, et son bruit ne doit
 * masquer ni le bouton mort ni l'échéance du scan.
 *
 * Le résumé `fin-action` de l'observateur est la seule source : sans lui,
 * on ne conclut rien.
 *
 * Confiance : base UNIQUE (config), sans palier. Ce détecteur conclut d'une
 * ABSENCE — il n'y a pas de « signal plus fort » à graduer, seulement une
 * fenêtre d'observation qui peut avoir été trop courte. C'est, avec
 * D-ECHEC-MUET, le constat le plus fragile du moteur ; la brique 3 le
 * calibrera en rejouant l'action.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { construireCandidate, elementDe } from './commun.js';

export const NOM_DETECTEUR_INERTE = 'd-inerte';
export const DESCRIPTION_SANS_EFFET = 'element-sans-effet';

type SignalFinAction = Extract<Signal, { type: 'fin-action' }>;

function estFinDe(actionId: string): (signal: Signal) => signal is SignalFinAction {
  return (signal): signal is SignalFinAction => signal.type === 'fin-action' && signal.actionId === actionId;
}

export function creerDetecteurInerte(config: ConfigScanner['detecteurs']['inerte']): Detecteur {
  return {
    nom: NOM_DETECTEUR_INERTE,
    dependDuViewport: false,
    detecter(signaux, contexte) {
      const candidates: AnomalieCandidate[] = [];
      for (const action of contexte.parcours.actions) {
        if (action.action.type !== 'soumettre' || action.resultat !== 'ok') {
          continue;
        }
        const fin = signaux.find(estFinDe(action.id));
        if (fin === undefined) {
          continue;
        }
        const { effets } = fin;
        if (effets.requetes !== 0 || effets.requetesEnAttente !== 0 || effets.navigation) {
          continue;
        }
        if (effets.mutationsHorsBruit !== 0) {
          continue;
        }
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_INERTE,
              description: DESCRIPTION_SANS_EFFET,
              categorie: 'fonctionnel',
              gravite: config.gravite,
              confiance: config.confiance,
              page: action.page,
              viewport: action.viewport,
              dependDuViewport: false,
              action,
              element: elementDe(action),
              preuves: [fin],
            },
            contexte,
          ),
        );
      }
      return candidates;
    },
  };
}
