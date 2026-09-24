/**
 * LE STATUT ÉPISTÉMIQUE D'UNE SECTION — ce que le rapport a le droit de
 * promettre, et rien de plus.
 *
 * Tout le moteur existe pour produire une phrase qu'un commerçant croira. Ce
 * module est l'endroit où l'on décide de ce que cette phrase a le droit
 * d'affirmer, et il est délibérément le plus petit et le plus lisible de la
 * brique : le statut est DÉRIVÉ mécaniquement du rapport technique, par une
 * table, et jamais rédigé, jamais choisi, jamais demandé au modèle.
 *
 * ── L'ORDRE DE LECTURE EST UNE DÉCISION DE SÉCURITÉ ─────────────────────────
 *
 * Le MOTIF est lu AVANT le verdict, et ce n'est pas un détail d'implémentation.
 * `anomalieDecouverte` pose `verdict: 'confirmee'` sur une découverte — ce qui
 * est correct pour le protocole, qui veut dire « retenue » — alors qu'une
 * découverte n'a JAMAIS été re-confirmée. Un module qui lirait le verdict
 * d'abord publierait « constaté et re-vérifié » sur une anomalie vue une seule
 * fois : le sur-engagement exact que la brique existe pour rendre impossible.
 *
 * ── CE QUE LA TABLE NE PEUT PAS TRADUIRE ────────────────────────────────────
 *
 * Les trois verdicts non retenus (`non-reproduite`, `limite-automatisation`,
 * `basse-confiance`) n'ont PAS de formulation client, et la table le dit par
 * `null` plutôt que de leur en inventer une. Une anomalie qui les porterait
 * tout en figurant parmi les retenues serait une incohérence du protocole :
 * elle n'est ni publiée avec un statut faux, ni perdue en silence — elle
 * remonte à l'appelant, qui la journalise (constitution §5).
 */
import type { Anomalie, ResultatGroupe, StatutSection, VerdictConfirmation } from '../types.js';
import { estExploitable } from '../scanner/confirmation/verdict.js';
import { MOTIF_CONSTATEE_AU_REJEU } from '../scanner/confirmation/decouvertes.js';
import { MOTIF_DECOUVERTE_DIAGNOSTIC_SITE } from '../scanner/confirmation/pont-vocabulaires.js';

/**
 * Motif technique → statut publiable. Les DEUX familles de découverte du
 * troisième état épistémique, et elles seules : les autres motifs du protocole
 * (`reproduite`, `reproduction-partielle`…) accompagnent un verdict qui suffit.
 */
const STATUT_PAR_MOTIF: Readonly<Record<string, StatutSection>> = {
  [MOTIF_CONSTATEE_AU_REJEU]: 'constatee-au-rejeu',
  [MOTIF_DECOUVERTE_DIAGNOSTIC_SITE]: 'diagnostic-site',
};

/**
 * Verdict du protocole → statut publiable, ou `null` quand il n'en existe
 * aucun d'honnête.
 *
 * Écrite en `Record<VerdictConfirmation, …>` et non en table partielle : un
 * sixième verdict ajouté au protocole CASSE la compilation ici, à l'endroit
 * précis où il faut décider ce que le client en lira — plutôt que de se
 * glisser dans le produit sous la formulation de son voisin.
 */
export const STATUT_PAR_VERDICT: Readonly<Record<VerdictConfirmation, StatutSection | null>> = {
  confirmee: 'confirmee',
  intermittente: 'intermittente',
  'non-reproduite': null,
  'limite-automatisation': null,
  'basse-confiance': null,
};

/**
 * Le statut d'une anomalie retenue, ou `null` si aucun statut ne peut être
 * promis sans mentir.
 *
 * Une anomalie SANS verdict (protocole passe-plat, qui retient tout sans rien
 * vérifier) rend `null` : ne rien avoir vérifié n'autorise aucune des quatre
 * formulations, et surtout pas la première.
 */
export function statutDe(anomalie: Anomalie): StatutSection | null {
  const parMotif = anomalie.motif === undefined ? undefined : STATUT_PAR_MOTIF[anomalie.motif];
  if (parMotif !== undefined) {
    return parMotif;
  }
  return anomalie.verdict === undefined ? null : STATUT_PAR_VERDICT[anomalie.verdict];
}

/**
 * Les deux CHIFFRES qui accompagnent un statut, mesurés sur le résultat de
 * groupe. Ce sont des comptes du protocole, jamais une estimation : la
 * formulation qui les porte les affiche tels quels.
 */
export interface ChiffresStatut {
  /** Tentatives de re-exécution EXPLOITABLES (celles qui disent quelque chose du site). */
  nbVerifications: number;
  /** Celles d'entre elles qui ont reproduit le défaut. */
  nbReproductions: number;
}

export const AUCUNE_VERIFICATION: ChiffresStatut = { nbVerifications: 0, nbReproductions: 0 };

/**
 * Les chiffres d'un groupe. La notion d'« exploitable » est celle du
 * protocole (`estExploitable`), importée plutôt que réécrite : un rejeu que
 * l'outil n'a pas su mener ne prouve rien, et compter ces tentatives-là
 * gonflerait le nombre de vérifications annoncé au client avec des
 * vérifications qui n'ont pas eu lieu.
 */
export function chiffresDe(resultat: ResultatGroupe): ChiffresStatut {
  const exploitables = resultat.tentatives.filter(estExploitable);
  return {
    nbVerifications: exploitables.length,
    nbReproductions: exploitables.filter((tentative) => tentative.reproduite).length,
  };
}
