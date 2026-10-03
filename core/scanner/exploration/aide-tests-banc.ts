/**
 * Aide aux tests d'intégration explorateur + observateur sur le banc :
 * scénarios construits en mémoire, servis par `demarrerServeur`, explorés
 * par un vrai Chromium avec des délais resserrés. Réservé aux *.test.ts.
 */
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { formulaireContact } from '../../../banc/gabarits/formulaire-contact/index.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ConfigBanc, Scenario } from '../../../banc/types.js';
import type { ActionExecutee, EntreeJournal, Parcours, Signal } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { creerExplorateur } from './explorateur.js';
import { creerFiltre, creerFiltreElement, type FiltreActions, type FiltreElement } from './filtre-actions.js';
import { politiqueDeterministe } from './politique.js';
import { creerCompteurObservations } from '../observation/observations.js';

export const ECHEANCE_TEST_MS = 40_000;

export interface ResultatExploration {
  url: string;
  parcours: Parcours;
  signaux: Signal[];
  journal: EntreeJournal[];
}

export interface BancEssai {
  config: ConfigScanner;
  configBanc: ConfigBanc;
  /** Sert le scénario (bugs actifs, paramètres), l'explore, arrête le serveur. */
  explorer(bugsActifs: string[], parametres?: Scenario['parametres'], echeance?: number): Promise<ResultatExploration>;
  /** Explore une URL quelconque (serveur déjà servi ou absent). */
  explorerUrl(url: string, echeance?: number): Promise<ResultatExploration>;
  fermer(): Promise<void>;
}

export async function preparerBanc(): Promise<BancEssai> {
  const base = await chargerConfigScanner();
  // Seules les ATTENTES du chemin nominal sont resserrées (stabilisation,
  // plafond d'effet, sondage). Les délais d'échec (clic, saisie, chargement)
  // gardent leur valeur réelle : sous la charge d'une suite parallèle, un
  // clic sain peut dépasser 500 ms et serait compté « echec » à tort.
  const config: ConfigScanner = {
    ...base,
    exploration: {
      ...base.exploration,
      attenteEffetMaxMs: 3000,
      stabilisationMs: 150,
      sondageMs: 25,
      margeEcheanceMs: 0,
    },
  };
  const actionsInterdites = await chargerActionsInterdites();
  const filtre: FiltreActions = creerFiltre(actionsInterdites);
  const filtreElement: FiltreElement = creerFiltreElement(actionsInterdites);
  const configBanc = await chargerConfig();
  const navigateur: Browser = await lancerNavigateur(config);

  async function explorerUrl(url: string, echeance = Date.now() + ECHEANCE_TEST_MS): Promise<ResultatExploration> {
    const journal: EntreeJournal[] = [];
    const observateur = creerObservateur();
    const deterministe = politiqueDeterministe();
    const explorateur = creerExplorateur({ config, politique: deterministe, secours: deterministe, filtre, filtreElement, navigateur });
    const parcours = await explorateur.explorer(
      {
        urlDepart: url,
        echeance,
        compteurObservations: creerCompteurObservations(),
        journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
      },
      observateur,
    );
    return { url, parcours, signaux: observateur.signaux(), journal };
  }

  return {
    config,
    configBanc,
    explorerUrl,
    async explorer(bugsActifs, parametres, echeance) {
      const scenario: Scenario = {
        id: `test--${bugsActifs.join('-') || 'sain'}`,
        gabarit: formulaireContact.nom,
        langue: 'fr',
        bugsActifs,
        ...(parametres ? { parametres } : {}),
      };
      const serveur = await demarrerServeur(scenario, formulaireContact, configBanc);
      try {
        return await explorerUrl(serveur.url, echeance);
      } finally {
        await serveur.arreter();
      }
    },
    async fermer() {
      await navigateur.close();
    },
  };
}

/** Chemins des pages visitées sur un viewport, dans l'ordre. */
export function chemins(resultat: ResultatExploration, viewport: string): string[] {
  return resultat.parcours.pages.filter((p) => p.viewport === viewport).map((p) => new URL(p.url).pathname);
}

export function soumissions(resultat: ResultatExploration, viewport: string): ActionExecutee[] {
  return resultat.parcours.actions.filter((a) => a.viewport === viewport && a.action.type === 'soumettre');
}

export function signauxDe<T extends Signal['type']>(resultat: ResultatExploration, type: T, actionId?: string): Extract<Signal, { type: T }>[] {
  return resultat.signaux.filter((s): s is Extract<Signal, { type: T }> => s.type === type && (actionId === undefined || s.actionId === actionId));
}
