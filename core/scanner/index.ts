/**
 * Pipeline du scanner (cahier §1) : EXPLORATION → OBSERVATION → DÉTECTION
 * → CONFIRMATION. Ce module orchestre les étapes et tient le journal
 * (constitution §5) ; il ne connaît ni Playwright ni les détecteurs
 * concrets : tout lui est injecté (`creerScannerParDefaut` dans defaut.ts
 * fait l'assemblage réel, les tests injectent des doublures).
 */
import type { ClientIa } from '../ia/index.js';
import type {
  CandidateEcartee,
  Detecteur,
  EntreeJournal,
  Explorateur,
  Observateur,
  Parcours,
  ProtocoleConfirmation,
  Rapport,
  Reexecuteur,
  ResultatConfirmation,
  Scanner,
} from '../types.js';
import type { ConfigScanner } from './config.js';
import { detecter } from './detection/index.js';

/**
 * Ressource de rejeu d'un scan : le protocole de confirmation re-exécute
 * dans un navigateur, qui doit vivre APRÈS l'exploration et être fermé dans
 * tous les cas. Le pipeline ne sait pas ce qu'il y a derrière (l'assemblage
 * réel n'ouvre son navigateur qu'au premier rejeu, un site sain n'en paie
 * donc aucun).
 */
export interface SessionRejeu {
  reexecuteur: Reexecuteur;
  fermer(): Promise<void>;
}

export interface DependancesScanner {
  config: ConfigScanner;
  explorateur: Explorateur;
  /** Fabrique d'un observateur neuf par scan (tampon de signaux). */
  observateur: () => Observateur;
  detecteurs: Detecteur[];
  protocole: ProtocoleConfirmation;
  /** Ouvre la capacité de rejeu du scan ; elle reçoit le journal et l'échéance du scan en cours. */
  ouvrirRejeu: (journaliser: (type: string, details?: unknown) => void, echeance: number) => SessionRejeu;
  ia: ClientIa;
}

/** Coût des appels IA hors confirmation : aucun dans cette brique (mode dégradé permanent, cahier §4). */
const COUT_API_EXPLORATION = 0;

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Identifiants techniques du refus d'une URL de départ. */
export const REFUS_URL_INVALIDE = 'url-invalide';
export const REFUS_SCHEMA_NON_SUPPORTE = 'schema-non-supporte';

/** Raison de refuser l'URL de départ (schéma http(s) seulement), ou null si elle est acceptable. */
export function refuserUrl(url: string): string | null {
  let analysee: URL;
  try {
    analysee = new URL(url);
  } catch {
    return REFUS_URL_INVALIDE;
  }
  return analysee.protocol === 'http:' || analysee.protocol === 'https:' ? null : REFUS_SCHEMA_NON_SUPPORTE;
}

/** Nombre de candidates par détecteur (journal `detection.fin`). */
function compterParDetecteur(detecteurs: Detecteur[], candidates: { detecteur: string }[]): Record<string, number> {
  const comptes: Record<string, number> = {};
  for (const detecteur of detecteurs) {
    comptes[detecteur.nom] = candidates.filter((candidate) => candidate.detecteur === detecteur.nom).length;
  }
  return comptes;
}

/** Identifiant technique de l'écart : la confirmation elle-même est tombée. */
export const RAISON_CONFIRMATION_EN_ERREUR = 'confirmation-en-erreur';

export function creerScanner(dependances: DependancesScanner): Scanner {
  const { config, explorateur, detecteurs, protocole, ouvrirRejeu, ia } = dependances;

  return async function scanner(url, options): Promise<Rapport> {
    const debut = Date.now();
    const echeance = debut + options.timeoutMs;
    const journal: EntreeJournal[] = [];
    const journaliser = (type: string, details?: unknown): void => {
      journal.push({ horodatage: new Date().toISOString(), type, details });
    };

    journaliser('scan.debut', {
      url,
      timeoutMs: options.timeoutMs,
      explorateur: explorateur.nom,
      detecteurs: detecteurs.map((detecteur) => detecteur.nom),
      protocole: protocole.nom,
    });
    journaliser('ia.mode', { mode: ia.mode, raison: ia.raisonDegrade });

    // 0. L'URL de départ doit être une URL web : un fichier local ou une URL de
    // données ne lancent pas de navigateur.
    const refus = refuserUrl(url);
    if (refus !== null) {
      journaliser('scan.erreur', { etape: 'url', message: refus });
      const parcours: Parcours = { urlDepart: url, pages: [], actions: [], arret: 'erreur' };
      const dureeMs = Date.now() - debut;
      journaliser('scan.fin', { dureeMs, coutApi: COUT_API_EXPLORATION, nbAnomalies: 0, arret: parcours.arret });
      return { url, anomalies: [], coutApi: COUT_API_EXPLORATION, dureeMs, journal, parcours, candidates: [], ecartees: [] };
    }

    // 1–2. Exploration, observée. Une exception ici (navigateur, réseau,
    // page hostile) donne un rapport PARTIEL, jamais une exception : le banc
    // note un rapport. Les signaux déjà collectés restent exploitables.
    const observateur = dependances.observateur();
    let parcours: Parcours;
    try {
      parcours = await explorateur.explorer({ urlDepart: url, echeance, journaliser }, observateur);
    } catch (cause: unknown) {
      journaliser('scan.erreur', { etape: 'exploration', message: messageErreur(cause) });
      parcours = { urlDepart: url, pages: [], actions: [], arret: 'erreur' };
    }

    // 3. Détection.
    const signaux = observateur.signaux();
    const candidates = detecter(signaux, { urlDepart: url, parcours, viewports: config.viewports }, detecteurs);
    journaliser('detection.fin', {
      nbSignaux: signaux.length,
      nbCandidates: candidates.length,
      parDetecteur: compterParDetecteur(detecteurs, candidates),
    });

    // 4. Confirmation. Le protocole rejoue dans un navigateur : sa session
    // est fermée dans tous les cas, et une panne de sa part donne un rapport
    // partiel — sans confirmation, aucune anomalie n'est AFFIRMÉE, elles
    // sont écartées avec leur raison plutôt que signalées sans preuve.
    const session = ouvrirRejeu(journaliser, echeance);
    let confirmation: ResultatConfirmation;
    try {
      confirmation = await protocole.confirmer(candidates, {
        urlDepart: url,
        options,
        echeance,
        journaliser,
        reexecuteur: session.reexecuteur,
        detecteurs,
        viewports: config.viewports,
      });
    } catch (cause: unknown) {
      journaliser('scan.erreur', { etape: 'confirmation', message: messageErreur(cause) });
      const ecartees: CandidateEcartee[] = candidates.map((candidate) => ({ candidate, raison: RAISON_CONFIRMATION_EN_ERREUR }));
      confirmation = { retenues: [], ecartees, coutApi: 0 };
    } finally {
      await session.fermer().catch(() => undefined);
    }

    const coutApi = COUT_API_EXPLORATION + confirmation.coutApi;
    const dureeMs = Date.now() - debut;
    journaliser('scan.fin', { dureeMs, coutApi, nbAnomalies: confirmation.retenues.length, arret: parcours.arret });

    // `groupes` et `decouvertes` ne sont présents que si le protocole en rend :
    // le passe-plat ne consolide pas et ne rejoue rien, son rapport ne doit
    // donc pas prétendre le contraire avec des listes vides. Portés par le
    // Rapport, ils permettent de compter en GROUPES (cahier §1a) et de
    // remonter d'une anomalie à sa cause sans re-parser le journal.
    return {
      url,
      anomalies: confirmation.retenues,
      coutApi,
      dureeMs,
      journal,
      parcours,
      candidates,
      ecartees: confirmation.ecartees,
      ...(confirmation.groupes === undefined ? {} : { groupes: confirmation.groupes }),
      ...(confirmation.decouvertes === undefined ? {} : { decouvertes: confirmation.decouvertes }),
    };
  };
}
