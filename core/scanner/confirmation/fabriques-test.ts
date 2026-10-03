/**
 * Fabriques SIMULÉES pour les tests du protocole de confirmation : config,
 * contexte, et un `Reexecuteur` factice dont chaque rejeu est SCRIPTÉ.
 *
 * Le factice ne rend jamais « reproduite » : il rend des SIGNAUX, que les
 * vrais détecteurs relisent. C'est la seule façon d'éprouver le protocole
 * sans lui inventer une notion de reproduction qu'il n'a pas.
 *
 * (Ce module n'est pas un fichier de test : il ne porte pas le suffixe
 * `.test.ts` et n'est importé que par les tests du dossier.)
 */
import type {
  AnomalieCandidate,
  CauseEchecRejeu,
  ContexteConfirmation,
  ContexteReproduction,
  Detecteur,
  EntreeJournal,
  Reexecuteur,
  ResultatRejeu,
  Signal,
  Viewport,
} from '../../types.js';
import type { ConfigConfirmation } from '../config.js';
import { DESKTOP, MOBILE, ORIGINE, URL_CONTACT, reponse, soumission } from '../detection/fabriques-test.js';

/** Politique de confirmation des tests : deux re-exécutions, contre-épreuve active, bornes larges. */
export const CONFIG_CONFIRMATION_TEST: ConfigConfirmation = {
  politique: 'complet',
  seuilConfirmationDirecte: 0.9,
  reExecutions: 2,
  observationsMinPersistance: 2,
  variations: ['contexte-neuf'],
  tauxReproduction: 1,
  contreEpreuve: true,
  agregationMesures: 'mediane',
  seuilRetenue: 0.6,
  rejeu: { chargementPageMs: 15000, actionMs: 10000, margeEcheanceMs: 3000, budgetMinimalMs: 8000 },
  calibration: {
    facteurVerdict: { confirmee: 1.05, intermittente: 0.85 },
    poidsTauxReproduction: 0.1,
    bonusContreEpreuve: 0.05,
    malusSymetrieInattendue: 0.25,
    confianceMin: 0.05,
    confianceMax: 0.99,
  },
};

/** Un rejeu tel que le test veut qu'il se passe. */
export interface RejeuScripte {
  /** Le rejeu reproduit-il le défaut (réponse en erreur) ? */
  enEchec?: boolean;
  /** Durée de la réponse rejouée, pour un détecteur gradué. */
  dureeMs?: number;
  echecOutillage?: boolean;
  /**
   * À qui la faute, quand le rejeu échoue. Sans elle, un échec scripté n'est
   * imputé à personne : la tentative est inexploitable mais sa cause reste
   * `undefined`, donc le résidu `indetermine` — le seul client de
   * l'auto-diagnostic IA — serait inatteignable en test.
   */
  causeEchec?: CauseEchecRejeu;
  erreur?: string;
  /**
   * Ce que le rejeu voit EN PLUS de ce qu'il venait vérifier. Un rejeu ouvre
   * une page et l'observe : sans ce canal, le factice ne saurait produire
   * aucune DÉCOUVERTE, et la moitié du protocole resterait hors de portée
   * des tests.
   */
  signauxEnPlus?: Signal[];
}

export interface AppelRejeu {
  reproduction: ContexteReproduction;
  viewport: string;
}

export type ReexecuteurFactice = Reexecuteur & { appels: AppelRejeu[] };

/** Signaux d'un rejeu : la réponse de l'API provoquée par la soumission `r1`. */
function signauxDuRejeu(script: RejeuScripte, page: string, viewport: string): Signal[] {
  return [
    reponse({
      actionId: 'r1',
      page,
      viewport,
      statut: script.enEchec === true ? 500 : 200,
      ...(script.dureeMs === undefined ? {} : { dureeMs: script.dureeMs }),
    }),
    ...(script.signauxEnPlus ?? []).map((signal) => ({ ...signal, page, viewport })),
  ];
}

/**
 * Re-exécuteur factice : chaque appel consomme le script suivant ; au-delà
 * de la liste, le dernier est rejoué (une politique à N tentatives ne doit
 * pas dépendre de la longueur du script).
 */
export function reexecuteurFactice(scripts: RejeuScripte[]): ReexecuteurFactice {
  const appels: AppelRejeu[] = [];
  return {
    appels,
    rejouer(reproduction, viewport): Promise<ResultatRejeu> {
      const script = scripts[Math.min(appels.length, scripts.length - 1)] ?? {};
      appels.push({ reproduction, viewport: viewport.nom });
      const parcours = {
        urlDepart: reproduction.url,
        pages: [],
        actions: [soumission('r1', { page: reproduction.url, viewport: viewport.nom })],
        arret: 'complet' as const,
        enAttenteALArret: 0,
        pagesRestantesALArret: 0,
        nbRecouvrementsEcartes: 0,
      };
      if (script.echecOutillage === true) {
        return Promise.resolve({
          signaux: [],
          parcours: { ...parcours, actions: [], arret: 'erreur' as const, enAttenteALArret: 0, pagesRestantesALArret: 0, nbRecouvrementsEcartes: 0 },
          echecOutillage: true,
          ...(script.causeEchec === undefined ? {} : { causeEchec: script.causeEchec }),
          ...(script.erreur === undefined ? {} : { erreur: script.erreur }),
          dureeMs: 10,
        });
      }
      return Promise.resolve({
        signaux: signauxDuRejeu(script, reproduction.url, viewport.nom),
        parcours,
        echecOutillage: false,
        dureeMs: 20,
      });
    },
  };
}

export interface OptionsContexte {
  journal: EntreeJournal[];
  reexecuteur: Reexecuteur;
  detecteurs: Detecteur[];
  viewports?: Viewport[];
  echeance?: number;
}

export function contexteConfirmation(options: OptionsContexte): ContexteConfirmation {
  return {
    urlDepart: ORIGINE,
    options: { timeoutMs: 60_000 },
    echeance: options.echeance ?? Date.now() + 60_000,
    journaliser: (type, details) => {
      options.journal.push({ horodatage: new Date().toISOString(), type, details });
    },
    reexecuteur: options.reexecuteur,
    detecteurs: options.detecteurs,
    viewports: options.viewports ?? [DESKTOP, MOBILE],
  };
}

/** Candidate minimale, surchargeable : ce que le protocole reçoit de la détection. */
export function candidateSimulee(surcharges: Partial<AnomalieCandidate> = {}): AnomalieCandidate {
  return {
    categorie: 'fonctionnel',
    description: 'reponse-5xx',
    urlOuEtape: URL_CONTACT,
    graviteEstimee: 'bloquant',
    confiance: 0.8,
    detecteur: 'd-http',
    reproduction: { url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: DESKTOP, action: soumission('a1'), actionsPrealables: [] },
    preuves: [reponse({ statut: 500, actionId: 'a1' })],
    ...surcharges,
  };
}
