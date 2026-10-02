/**
 * LE PLAFOND DE DÉPENSE D'UN SCAN.
 *
 * Décorateur autour d'un `ClientIa` : il compte ce que le scan a réellement
 * dépensé, et refuse les appels suivants une fois le plafond atteint.
 *
 * ── CE QU'IL NE FAIT PAS, ET C'EST LE PLUS IMPORTANT ────────────────────────
 *
 * Il n'ARRÊTE JAMAIS le scan. Un dépassement de budget bascule les appels
 * restants en mode dégradé — le moteur continue avec ses détecteurs
 * mécaniques, le protocole continue de confirmer, et le rapport sort, même
 * structurel. Tuer le scan au dépassement transformerait une limite de coût en
 * perte totale du travail déjà payé.
 *
 * ── LA BORNE EXACTE, ET POURQUOI ELLE N'EST PAS « LE PLAFOND » ──────────────
 *
 * Un appel ne déclare son coût qu'une fois TERMINÉ : on ne peut pas savoir
 * avant de le lancer s'il fera franchir la ligne. La garantie est donc
 * `plafond + le coût d'UN appel`, et pas `plafond` — c'est le maximum d'un
 * seul appel en vol, et il est annoncé plutôt que caché. La resserrer
 * exigerait une estimation du coût avant appel, c'est-à-dire un chiffre
 * inventé.
 *
 * ── UNE ABSENCE SUBIE, JAMAIS SILENCIEUSE ───────────────────────────────────
 *
 * Chaque refus est journalisé avec le cumul et le plafond. Le mode dégradé qui
 * en résulte n'est pas le mode dégradé DÉCLARÉ d'un scan sans clé : c'est une
 * capacité perdue en cours de route, et le journal doit permettre de les
 * distinguer — sans quoi un scan cher ressemblerait à un scan sans clé.
 */
import type {
  ClientIa,
  ContexteDiagnostic,
  ContexteProfilage,
  ContexteRedaction,
  DecisionEstampillee,
  DiagnosticEstampille,
  ProfilPage,
  RedactionEstampillee,
  ResultatIa,
} from './index.js';
import type { EtatDecisionEnumere } from '../types.js';

/** Identifiant technique du refus. Stable, machinable, jamais de la prose. */
export const RAISON_BUDGET_DEPASSE = 'budget-scan-depasse';
/** Événement de journal émis à chaque appel refusé faute de budget. */
export const EVENEMENT_BUDGET_DEPASSE = 'ia.budget-depasse';

export type Journaliser = (type: string, details?: unknown) => void;

/**
 * Le plafond, et sa PORTÉE.
 *
 * Le client IA est construit une fois, à l'assemblage du scanner ; le budget,
 * lui, est par SCAN. D'où ces deux faces : `client` se branche une fois pour
 * toutes sur les quatre surfaces, et `ouvrirScan` remet le compteur à zéro et
 * fixe le journal du scan qui commence.
 *
 * CONTRAT : un scanner ainsi équipé mène UN scan à la fois. Deux scans
 * concurrents sur le même scanner partageraient ce compteur et se voleraient
 * leur budget. Ce n'est pas une limitation de ce module — l'explorateur tient
 * déjà un état par scan — et c'est la file d'attente, hors périmètre de cette
 * brique, qui devra donner un scanner par scan (docs/DETTES.md n°17).
 */
export interface PorteeBudget {
  client: ClientIa;
  ouvrirScan(journaliser: Journaliser): void;
}

/**
 * Enveloppe un client d'un plafond de dépense. Sans plafond, le client est
 * rendu TEL QUEL et `ouvrirScan` ne fait rien : pas de compteur, pas
 * d'indirection, rien à expliquer dans un journal — c'est l'état du banc, dont
 * le coût est mesuré et non borné.
 */
export function creerBudgetScan(client: ClientIa, maxUsdParScan: number | null): PorteeBudget {
  if (maxUsdParScan === null) {
    return { client, ouvrirScan: () => undefined };
  }
  const plafond: number = maxUsdParScan;

  let depense = 0;
  let journaliser: Journaliser = () => undefined;

  function refuser<T>(surface: string): ResultatIa<T> {
    journaliser(EVENEMENT_BUDGET_DEPASSE, { surface, depense, plafond });
    return { disponible: false, raison: RAISON_BUDGET_DEPASSE, coutApi: 0 };
  }

  async function plafonner<T>(surface: string, appel: () => Promise<ResultatIa<T>>): Promise<ResultatIa<T>> {
    if (depense >= plafond) {
      return refuser<T>(surface);
    }
    const resultat = await appel();
    // Le coût est compté même quand l'appel n'a rien produit : un appel qui
    // échoue APRÈS avoir dépensé a bel et bien dépensé (APPRENTISSAGES n°3).
    depense += resultat.coutApi ?? 0;
    return resultat;
  }

  const plafonne: ClientIa = {
    mode: client.mode,
    raisonDegrade: client.raisonDegrade,
    // La clé ne dépense rien : le plafond ne la concerne pas, elle passe.
    cleDecision: (etat) => client.cleDecision(etat),
    profiler: (contexte: ContexteProfilage): Promise<ResultatIa<ProfilPage>> =>
      plafonner('profilage', () => client.profiler(contexte)),
    decider: (etat: EtatDecisionEnumere): Promise<ResultatIa<DecisionEstampillee>> =>
      plafonner('navigation', () => client.decider(etat)),
    diagnostiquer: (contexte: ContexteDiagnostic): Promise<ResultatIa<DiagnosticEstampille>> =>
      plafonner('diagnostic', () => client.diagnostiquer(contexte)),
    rediger: (contexte: ContexteRedaction): Promise<ResultatIa<RedactionEstampillee>> =>
      plafonner('redaction', () => client.rediger(contexte)),
  };

  return {
    client: plafonne,
    ouvrirScan(journalDuScan) {
      depense = 0;
      journaliser = journalDuScan;
    },
  };
}
