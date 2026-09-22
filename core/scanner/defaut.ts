/**
 * Assemblage par défaut du scanner réel : config + liste noire chargées,
 * politique déterministe, filtre d'actions, six détecteurs, protocole
 * passe-plat, client IA (mode dégradé sans clé, constitution §4).
 *
 * Seul module du moteur qui relie le pipeline aux modules concrets
 * (navigateur, exploration, observation, détection).
 */
import { creerClientIa } from '../ia/index.js';
import type { Explorateur, Scanner } from '../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ActionsInterdites, type ConfigScanner } from './config.js';
import { protocolePassePlat } from './confirmation/passe-plat.js';
import { creerDetecteurs } from './detection/index.js';
import { creerExplorateur } from './exploration/explorateur.js';
import { creerFiltre } from './exploration/filtre-actions.js';
import { politiqueDeterministe } from './exploration/politique.js';
import { creerScanner } from './index.js';
import { lancerNavigateur } from './navigateur.js';
import { creerObservateur } from './observation/observateur.js';

export const NOM_EXPLORATEUR_NAVIGATEUR = 'explorateur-navigateur';

/**
 * Un navigateur PAR SCAN, fermé dans tous les cas : l'explorateur réel est
 * créé autour du navigateur au moment d'explorer. Un échec de lancement est
 * ainsi une exception d'exploration, capturée par le pipeline en rapport
 * partiel plutôt que remontée au banc.
 *
 * Filet de sécurité : à l'échéance, le navigateur est fermé même si
 * l'exploration n'a pas rendu la main (page qui ne répond plus) ; les
 * attentes en cours échouent alors et le rapport partiel est rendu.
 */
function explorateurAvecNavigateur(config: ConfigScanner, actionsInterdites: ActionsInterdites): Explorateur {
  const filtre = creerFiltre(actionsInterdites);
  const politique = politiqueDeterministe(config.remplissage);
  return {
    nom: NOM_EXPLORATEUR_NAVIGATEUR,
    async explorer(contexte, observateur) {
      const navigateur = await lancerNavigateur(config);
      const garde = setTimeout(() => {
        contexte.journaliser('exploration.echeance.fermeture', { echeance: new Date(contexte.echeance).toISOString() });
        navigateur.close().catch(() => undefined);
      }, Math.max(0, contexte.echeance - Date.now()));
      garde.unref();
      try {
        const explorateur = creerExplorateur({ config, politique, filtre, navigateur });
        return await explorateur.explorer(contexte, observateur);
      } finally {
        clearTimeout(garde);
        await navigateur.close();
      }
    },
  };
}

export async function creerScannerParDefaut(): Promise<Scanner> {
  const [config, actionsInterdites] = await Promise.all([chargerConfigScanner(), chargerActionsInterdites()]);
  return creerScanner({
    config,
    explorateur: explorateurAvecNavigateur(config, actionsInterdites),
    observateur: creerObservateur,
    detecteurs: creerDetecteurs(config.detecteurs),
    protocole: protocolePassePlat,
    ia: creerClientIa(config.ia),
  });
}
