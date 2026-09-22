/**
 * Assemblage par défaut du scanner réel : config + liste noire chargées,
 * politique déterministe, filtre d'actions, six détecteurs, protocole
 * anti-faux-positifs (consolidation, re-exécution, verdict, calibration)
 * avec son auto-diagnostic mécanique, client IA (mode dégradé sans clé,
 * constitution §4).
 *
 * Seul module du moteur qui relie le pipeline aux modules concrets
 * (navigateur, exploration, observation, détection, re-exécution).
 */
import { creerClientIa } from '../ia/index.js';
import type { Browser } from 'playwright';
import type { Explorateur, Scanner } from '../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ActionsInterdites, type ConfigScanner } from './config.js';
import { autoDiagnosticMecanique } from './confirmation/auto-diagnostic.js';
import { creerProtocole } from './confirmation/protocole.js';
import { creerDetecteurs } from './detection/index.js';
import { creerExplorateur } from './exploration/explorateur.js';
import { creerFiltre } from './exploration/filtre-actions.js';
import { politiqueDeterministe } from './exploration/politique.js';
import { creerScanner, type SessionRejeu } from './index.js';
import { lancerNavigateur } from './navigateur.js';
import { creerObservateur } from './observation/observateur.js';
import { creerReexecuteur } from './reexecuteur.js';

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

/**
 * Session de rejeu PARESSEUSE : le navigateur de confirmation n'est lancé
 * qu'au premier rejeu réellement demandé (un site sans candidate n'en paie
 * aucun), il est partagé par toutes les tentatives du scan — chacune ouvre
 * son propre CONTEXTE neuf — et il est fermé avec la session.
 *
 * Même filet de sécurité que l'exploration : à l'échéance, le navigateur est
 * fermé même si un rejeu n'a pas rendu la main (page qui ne répond plus) ;
 * la tentative échoue alors et le protocole rend son résultat à l'heure.
 */
function sessionRejeu(
  config: ConfigScanner,
  journaliser: (type: string, details?: unknown) => void,
  echeance: number,
): SessionRejeu {
  let navigateur: Browser | undefined;
  let garde: NodeJS.Timeout | undefined;
  return {
    reexecuteur: {
      async rejouer(reproduction, viewport) {
        if (navigateur === undefined) {
          navigateur = await lancerNavigateur(config);
          const ouvert = navigateur;
          garde = setTimeout(() => {
            journaliser('rejeu.echeance.fermeture', { echeance: new Date(echeance).toISOString() });
            ouvert.close().catch(() => undefined);
          }, Math.max(0, echeance - Date.now()));
          garde.unref();
        }
        return creerReexecuteur({ navigateur, config, journaliser, echeance }).rejouer(reproduction, viewport);
      },
    },
    async fermer() {
      clearTimeout(garde);
      const ouvert = navigateur;
      navigateur = undefined;
      await ouvert?.close();
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
    protocole: creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique }),
    ouvrirRejeu: (journaliser, echeance) => sessionRejeu(config, journaliser, echeance),
    ia: creerClientIa(config.ia),
  });
}
