/**
 * Pipeline du scanner (cahier §1) : EXPLORATION → OBSERVATION → PROFILAGE
 * → DÉTECTION → CONFIRMATION. Ce module orchestre les étapes et tient le journal
 * (constitution §5) ; il ne connaît ni Playwright ni les détecteurs
 * concrets : tout lui est injecté (`creerScannerParDefaut` dans defaut.ts
 * fait l'assemblage réel, les tests injectent des doublures).
 */
import type { ClientIa } from '../ia/index.js';
import type {
  CandidateEcartee,
  Detecteur,
  EntreeJournal,
  Observateur,
  Parcours,
  ProtocoleConfirmation,
  Rapport,
  Reexecuteur,
  ResultatConfirmation,
  Scanner,
} from '../types.js';
import type { ConfigRapport, ConfigScanner } from './config.js';
import { detecter } from './detection/index.js';
import { ouvrirProfilage, type ExplorateurProfilant, type OptionsProfilage } from './profilage.js';
import { redigerRapportBusiness, type ResultatRapportBusiness } from '../rapport/index.js';
import type { RepartitionEcheance } from './config.js';
import { creerMemoireFermeture, type MemoireFermeture } from './exploration/memoire-fermeture.js';
import { creerCompteurObservations, type CompteurObservations } from './observation/observations.js';

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
  explorateur: ExplorateurProfilant;
  /** Fabrique d'un observateur neuf par scan (tampon de signaux). */
  observateur: () => Observateur;
  detecteurs: Detecteur[];
  protocole: ProtocoleConfirmation;
  /** Ouvre la capacité de rejeu du scan ; elle reçoit le journal et l'échéance du scan en cours. */
  ouvrirRejeu: (
    journaliser: (type: string, details?: unknown) => void,
    echeance: number,
    memoireFermeture: MemoireFermeture,
    compteurObservations: CompteurObservations,
  ) => SessionRejeu;
  ia: ClientIa;
  /**
   * Ouvre la portée de BUDGET d'un scan : remet le compteur de dépense à zéro
   * et donne au plafond le journal du scan qui commence.
   *
   * ABSENT : aucun plafond n'est opposé, et c'est l'état du banc, dont le coût
   * est mesuré et non borné. Le client reçu est alors le client nu.
   */
  ouvrirBudget?: (journaliser: (type: string, details?: unknown) => void) => void;
  /**
   * Réglages du profilage IA (brique 4a). ABSENTS : le scan tourne sans
   * profil et le journal le dit — le moteur ne dépend jamais de l'IA
   * (constitution §4).
   */
  profilage?: OptionsProfilage;
  /**
   * Réglages du RAPPORT BUSINESS (brique 5). ABSENTS : le scan ne produit
   * aucun rapport business et le journal le dit — même doctrine que le
   * profilage, et le banc la garde : pour le sujet réel, un attendu de
   * rapport non mesuré est une absence SUBIE, qui interdit le statut `ok`.
   */
  rapport?: ConfigRapport;
}

/**
 * Coût des appels IA de l'exploration quand elle n'en fait aucun (politique
 * déterministe, mode dégradé). La politique IA, elle, dépense par décision :
 * le compteur ci-dessous recueille ce qu'elle engage.
 */
const COUT_API_EXPLORATION_NUL = 0;

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

/** Journal : la part d'échéance réservée à la confirmation ne suffit pas à un seul rejeu. */
export const EVENEMENT_RESERVE_INSUFFISANTE = 'confirmation.reserve.insuffisante';

export interface EcheancesDePhase {
  /** Instant où l'exploration doit avoir rendu la main. */
  exploration: number;
  /** Instant où la confirmation doit avoir rendu la main : l'échéance moins la réserve de rédaction. */
  confirmation: number;
  reserveConfirmationMs: number;
  reserveRedactionMs: number;
}

/**
 * Les échéances de phase, depuis les fractions de config. Ce que l'exploration
 * ne consomme pas revient aux phases suivantes ; ce qu'elle consommerait en
 * trop lui est refusé. Pure : le banc la teste sans horloge.
 */
export function echeancesDePhase(debut: number, timeoutMs: number, repartition: RepartitionEcheance): EcheancesDePhase {
  const reserveConfirmationMs = Math.round(timeoutMs * repartition.confirmation);
  const reserveRedactionMs = Math.round(timeoutMs * repartition.redaction);
  return {
    exploration: debut + Math.round(timeoutMs * repartition.exploration),
    confirmation: debut + timeoutMs - reserveRedactionMs,
    reserveConfirmationMs,
    reserveRedactionMs,
  };
}

export function creerScanner(dependances: DependancesScanner): Scanner {
  const { config, explorateur, detecteurs, protocole, ouvrirRejeu, ia, ouvrirBudget } = dependances;

  return async function scanner(url, options): Promise<Rapport> {
    const debut = Date.now();
    const echeance = debut + options.timeoutMs;
    // LA MÉMOIRE DE FERMETURE naît ICI, dans le scan, et meurt avec lui :
    // c'est la portée qui tient l'invariant, pas une discipline d'appelant
    // (cahier P2-4, F2).
    const memoireFermeture = creerMemoireFermeture();
    // Comme la mémoire de fermeture : né dans le scan, mort avec lui — c'est
    // la portée qui garantit l'unicité des marques (cahier P2-6).
    const compteurObservations = creerCompteurObservations();
    // L'ÉCHÉANCE EST RÉPARTIE, RÉSERVÉE ET APPLIQUÉE (cahier P2-1, contrat 2).
    // Quatre sites de la campagne 6b ont vu l'exploration manger le temps de
    // la confirmation — 0/13, 0/187, 1/22 groupes rejoués —, et un cinquième
    // a vu la rédaction tourner 59 s au-delà de l'échéance. Les phases ne
    // tirent plus sur la même horloge : l'exploration a sa part, la
    // confirmation sa réserve que l'exploration ne peut pas entamer, la
    // rédaction la sienne. Le protocole est le cœur du produit ; il n'est
    // plus la variable d'ajustement du budget.
    const phases = echeancesDePhase(debut, options.timeoutMs, config.echeance.repartition);
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
    journaliser('scan.echeance', {
      timeoutMs: options.timeoutMs,
      explorationMs: phases.exploration - debut,
      confirmationReserveMs: phases.reserveConfirmationMs,
      redactionReserveMs: phases.reserveRedactionMs,
    });
    // Une réserve qui vaut moins qu'un seul rejeu ne protège rien : elle est
    // DITE, jamais subie en silence (P2-1, contrat 2).
    const coutRejeuMs = config.confirmation.rejeu.chargementPageMs;
    if (phases.reserveConfirmationMs < coutRejeuMs) {
      journaliser(EVENEMENT_RESERVE_INSUFFISANTE, { reserveMs: phases.reserveConfirmationMs, coutRejeuMs });
    }
    // Le budget s'ouvre AVANT la première dépense possible, et il est propre à
    // ce scan : le compteur d'un scan précédent ne doit pas amputer celui-ci.
    ouvrirBudget?.(journaliser);
    if (config.budget.maxUsdParScan !== null) {
      journaliser('ia.budget', { maxUsdParScan: config.budget.maxUsdParScan });
    }

    // 0. L'URL de départ doit être une URL web : un fichier local ou une URL de
    // données ne lancent pas de navigateur.
    const refus = refuserUrl(url);
    if (refus !== null) {
      journaliser('scan.erreur', { etape: 'url', message: refus });
      const parcours: Parcours = { urlDepart: url, pages: [], actions: [], arret: 'erreur', enAttenteALArret: 0, pagesRestantesALArret: 0, nbRecouvrementsEcartes: 0 };
      const dureeMs = Date.now() - debut;
      journaliser('scan.fin', { dureeMs, coutApi: COUT_API_EXPLORATION_NUL, nbAnomalies: 0, arret: parcours.arret });
      return { url, anomalies: [], coutApi: COUT_API_EXPLORATION_NUL, dureeMs, journal, parcours, candidates: [], ecartees: [] };
    }

    // 1–2. Exploration, observée. Une exception ici (navigateur, réseau,
    // page hostile) donne un rapport PARTIEL, jamais une exception : le banc
    // note un rapport. Les signaux déjà collectés restent exploitables.
    const observateur = dependances.observateur();
    // La collecte est NEUVE à chaque scan : c'est elle qui garantit l'appel
    // unique, même si l'exploration proposait un contexte par viewport.
    //
    // Elle est ouverte dès que le profilage est ASSEMBLÉ, y compris sans clé
    // d'API : l'extraction en page s'exécute alors à chaque scan, même
    // dégradé. C'est délibéré — le mode dégradé protège l'exécution, il ne
    // vérifie rien, et un chemin que rien n'exécute pourrit en silence
    // (APPRENTISSAGES n°5).
    const profilageOuvert = ouvrirProfilage({
      bornes: {
        maxChars: dependances.profilage?.config.contexteMaxChars ?? 0,
        enTeteMaxChars: dependances.profilage?.config.enTeteMaxChars ?? 0,
      },
      ia,
      ...(dependances.profilage === undefined ? {} : { options: dependances.profilage }),
      journaliser,
      echeance,
    });
    // Le coût des décisions de navigation se totalise ici : il est engagé
    // PENDANT l'exploration, mais c'est le scan qui le paie.
    let coutExploration = COUT_API_EXPLORATION_NUL;
    const compteurCout = {
      ajouter(montant: number): void {
        coutExploration += montant;
      },
    };
    let parcours: Parcours;
    try {
      parcours = await explorateur.explorer(
        {
          urlDepart: url,
          echeance: phases.exploration,
          arretEcheance: 'reserve-confirmation',
          memoireFermeture,
          compteurObservations,
          journaliser,
        },
        observateur,
        dependances.profilage === undefined ? undefined : profilageOuvert.collecte,
        compteurCout,
      );
    } catch (cause: unknown) {
      journaliser('scan.erreur', { etape: 'exploration', message: messageErreur(cause) });
      parcours = { urlDepart: url, pages: [], actions: [], arret: 'erreur', enAttenteALArret: 0, pagesRestantesALArret: 0, nbRecouvrementsEcartes: 0 };
    }
    journaliser('exploration.cout', { coutApi: coutExploration });

    // 2 bis. Profilage IA : UN appel par scan, sur le texte de la page de
    // départ déjà lue par l'exploration. Il a lieu PENDANT l'exploration
    // depuis la brique 4b — la navigation IA le consomme —, et ce qu'on lit
    // ici est le résultat déjà calculé (ou l'absence, journalisée).
    // Aucune panne d'IA ne tue un scan.
    const profilage = await profilageOuvert.resultat();

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
    // La confirmation s'arrête avant la réserve de rédaction : la rédaction
    // est la dernière phase et la seule qui n'avait pas de filet de temps.
    const session = ouvrirRejeu(journaliser, phases.confirmation, memoireFermeture, compteurObservations);
    let confirmation: ResultatConfirmation;
    try {
      confirmation = await protocole.confirmer(candidates, {
        urlDepart: url,
        options,
        echeance: phases.confirmation,
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

    // 5. RAPPORT BUSINESS. Dernière étape, et la seule qui ne regarde pas le
    // site : elle part du rapport technique, et de lui seul. Une panne de
    // rédaction ne coûte jamais un scan — elle coûte la prose, et le rapport
    // structurel reste publié (constitution §4).
    //
    // Ce rapport est CELUI QUI SERA RENDU : les coûts et la durée y sont
    // provisoires, parce qu'ils ne sont connus qu'après la rédaction, et ils
    // sont écrasés au retour. La rédaction ne les lit pas — elle ne lit que
    // les anomalies, les groupes, les découvertes et le profil.
    const rapportTechnique: Rapport = {
      url,
      anomalies: confirmation.retenues,
      coutApi: 0,
      dureeMs: 0,
      journal,
      parcours,
      candidates,
      ecartees: confirmation.ecartees,
      ...(confirmation.groupes === undefined ? {} : { groupes: confirmation.groupes }),
      ...(confirmation.decouvertes === undefined ? {} : { decouvertes: confirmation.decouvertes }),
      ...(profilage.profil === undefined ? {} : { profil: profilage.profil }),
    };
    // La rédaction est la DERNIÈRE étape, et la seule qui n'avait pas son
    // filet : son module lève délibérément sur une configuration dont la
    // langue n'a pas de formulations vérifiées, et une exception à cet endroit
    // aurait emporté un rapport technique DÉJÀ COMPLET. Toutes les autres
    // étapes du pipeline rendent un rapport partiel plutôt qu'une exception
    // (constitution §4) ; celle-ci fait désormais de même.
    let redaction: ResultatRapportBusiness | undefined;
    if (dependances.rapport !== undefined) {
      try {
        redaction = await redigerRapportBusiness({
          rapport: rapportTechnique,
          config: dependances.rapport,
          ia,
          journaliser,
          echeance,
          // Ce que le scan a eu le DROIT de faire fait partie de ce que le
          // rapport doit dire : un scan qui n'a soumis aucun formulaire ne
          // peut pas laisser lire « aucune anomalie » comme « tout marche ».
          soumissionsTestees: config.interaction.soumission !== 'aucune',
          ...(options.langueRapport === undefined ? {} : { langueDemandee: options.langueRapport }),
        });
      } catch (cause: unknown) {
        journaliser('scan.erreur', { etape: 'rapport', message: messageErreur(cause) });
      }
    }

    const coutApiParFamille = {
      exploration: coutExploration,
      profilage: profilage.coutApi,
      confirmation: confirmation.coutApi,
      redaction: redaction?.coutApi ?? 0,
    };
    const coutApi =
      coutApiParFamille.exploration +
      coutApiParFamille.profilage +
      coutApiParFamille.confirmation +
      coutApiParFamille.redaction;
    const dureeMs = Date.now() - debut;
    journaliser('scan.fin', { dureeMs, coutApi, nbAnomalies: confirmation.retenues.length, arret: parcours.arret });

    // Le rapport rendu est celui qui a servi à la rédaction, complété de ce
    // qui n'était pas encore connu quand elle a eu lieu : les coûts et la
    // durée. Le construire une seconde fois à quarante lignes d'écart aurait
    // été deux vérités à tenir d'accord — et c'est la copie oubliée qui aurait
    // porté le champ manquant.
    return { ...rapportTechnique, coutApi, coutApiParFamille, dureeMs,
      ...(redaction === undefined ? {} : { rapportBusiness: redaction.rapportBusiness }) };
  };
}
