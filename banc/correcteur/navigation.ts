/**
 * Notation de ce que la NAVIGATION a fait : les attendus de cible, la
 * couverture du parcours (la jumelle de dépense du coût), le repli par
 * décision, et la garde qui vérifie que les contraintes demandées ont bien
 * été appliquées.
 *
 * Tout ici se lit dans le `Rapport` et dans le manifeste, jamais dans le
 * moteur : le banc note à travers le contrat public (`core/types.ts`), comme
 * pour la détection.
 */
import type { EntreeJournal, Rapport } from '../../core/types.js';
import { attendusBug, attendusCible, type AttenduCible, type CouvertureParcours, type Manifeste, type ResultatCible, type Scenario } from '../types.js';
import { normaliserLocalisation } from './appariement.js';

/** Type d'entrée de journal par laquelle le moteur dit quelle politique il applique au scan. */
export const EVENEMENT_POLITIQUE = 'exploration.politique';

/**
 * Type d'entrée de journal émise à CHAQUE point de décision. Le nom est
 * recopié ici plutôt qu'importé du moteur, comme `EVENEMENT_POLITIQUE` : le
 * banc note à travers le contrat public, et un nom d'événement en fait partie.
 */
export const EVENEMENT_DECISION = 'decision';

// ---------------------------------------------------------------------------
// Raisons techniques stables (jamais de prose)
// ---------------------------------------------------------------------------

/** Aucun parcours exploitable : rien n'a pu être observé du chemin suivi. */
export const RAISON_CIBLE_SANS_PARCOURS = 'cible-non-mesuree:sans-parcours';

/** L'attendu ne se prononce pas sur la politique du run : il n'y a rien à juger. */
export const RAISON_CIBLE_POLITIQUE_HORS_ATTENDU = 'cible-non-mesuree:politique-hors-attendu';

/**
 * La politique demandée n'a pas été celle appliquée au scan (IA indisponible
 * d'emblée, `--sans-ia`). Mesurer quand même imputerait à une politique le
 * résultat d'une autre — un diagnostic faux (APPRENTISSAGES n°6).
 */
export const RAISON_CIBLE_POLITIQUE_NON_APPLIQUEE = 'cible-non-mesuree:politique-non-appliquee';

/** Le scénario a subi au moins un repli par décision alors que l'IA était demandée. */
export const RAISON_REPLIS_DECISION = 'scenario-non-ok:replis-decision';

/** Le moteur n'a pas reçu (ou pas appliqué) la politique que le banc demandait. */
export const RAISON_POLITIQUE_NON_TRANSMISE = 'contrainte-non-appliquee:politique';

/** Le moteur n'a pas respecté le budget de pages du scénario. */
export const RAISON_BUDGET_NON_APPLIQUE = 'contrainte-non-appliquee:pages-max';

/** Le moteur a rendu un parcours mais n'a pas dit quelle politique il appliquait. */
export const RAISON_POLITIQUE_NON_JOURNALISEE = 'contrainte-non-appliquee:politique-non-journalisee';

/**
 * Contrainte demandée par le banc que le moteur n'a pas appliquée.
 *
 * C'est une classe d'erreur à part, et c'est voulu. Le banc IMPOSE deux
 * choses au moteur pour cette brique — une politique et un budget de pages —
 * et toute la mesure de la brique 4b n'a de sens que si elles sont arrivées.
 * Un canal muet (option non lue, surcharge ignorée) produirait des scénarios
 * verts mesurant le comportement par défaut : la cible manquée en IA se
 * lirait « le modèle n'a pas su choisir » alors que le modèle n'a jamais été
 * consulté. Une garantie ne se déclare pas, elle s'éprouve (METHODE §2) :
 * le banc vérifie donc, après coup et dans le rapport, ce qu'il a demandé.
 */
export class ErreurContrainteNonAppliquee extends Error {
  constructor(readonly raison: string, detail: string) {
    super(`${raison} — ${detail}`);
    this.name = 'ErreurContrainteNonAppliquee';
  }
}

// ---------------------------------------------------------------------------
// Lecture du parcours et du journal
// ---------------------------------------------------------------------------

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null;
}

function chaineOuIndefini(valeur: unknown): string | undefined {
  return typeof valeur === 'string' ? valeur : undefined;
}

/** Détails de l'entrée de journal de politique, si le moteur en a émis une. */
function lireEntreePolitique(journal: readonly EntreeJournal[]): { demandee?: string; appliquee?: string } | undefined {
  const entree = journal.find((ligne) => ligne.type === EVENEMENT_POLITIQUE);
  if (entree === undefined || !estObjet(entree.details)) {
    return undefined;
  }
  return { demandee: chaineOuIndefini(entree.details.demandee), appliquee: chaineOuIndefini(entree.details.appliquee) };
}

/** Politique que le moteur dit avoir APPLIQUÉE au scan, ou `undefined` s'il ne l'a pas dit. */
export function politiqueAppliquee(rapport: Rapport): string | undefined {
  return lireEntreePolitique(rapport.journal)?.appliquee;
}

/** URL distinctes effectivement chargées, normalisées en chemins, tous viewports confondus. */
export function pagesVisitees(rapport: Rapport): Set<string> {
  return new Set((rapport.parcours?.pages ?? []).map((page) => normaliserLocalisation(page.url)));
}

/**
 * Décisions tranchées par la politique déterministe alors qu'une autre était
 * à l'oeuvre : un repli SUBI, à l'intérieur du scan.
 *
 * Il se lit sur le JOURNAL DES DÉCISIONS, et non sur les actes exécutés — et
 * c'est une correction, pas une préférence. `ActionExecutee.decision` ne porte
 * la provenance que jusqu'aux actes ENREGISTRÉS ; or une décision tranchée en
 * `terminer` n'en produit aucun (le moteur retourne avant l'enregistrement).
 * Un repli sur un point de décision terminal — il y en a un par viewport dans
 * chaque scan — était donc invisible au compteur, la garde de statut ne se
 * déclenchait pas, et une cassette de décision retirée pouvait laisser un
 * scénario intégralement VERT sous l'étiquette « ia ».
 *
 * La règle qui en sort est celle de l'apprentissage n°4 : une jumelle doit
 * lire la MÊME SOURCE que ce qu'elle garde. Ce qu'on garde, ce sont les
 * DÉCISIONS ; la source est donc le journal des décisions, où le moteur émet
 * une entrée par point de choix, `terminer` compris et cas dégénéré compris.
 */
export function compterReplisDecision(rapport: Rapport): number {
  return rapport.journal.filter(
    (entree) =>
      entree.type === EVENEMENT_DECISION &&
      estObjet(entree.details) &&
      chaineOuIndefini(entree.details.raisonRepli) !== undefined,
  ).length;
}

// ---------------------------------------------------------------------------
// Garde : ce que le banc a demandé est-il arrivé ?
// ---------------------------------------------------------------------------

/**
 * Vérifie que le moteur a bien reçu la politique demandée et le budget de
 * pages du scénario. Lève (`ErreurContrainteNonAppliquee`) sinon.
 *
 * Un rapport SANS parcours (scanner factice, scan qui n'a pas exploré) n'est
 * pas vérifié : il n'y a rien à vérifier, et exiger un journal d'exploration
 * d'un sujet qui n'explore pas transformerait le témoin négatif du banc en
 * erreur.
 *
 * Le budget se compte PAR VIEWPORT, comme le moteur le borne : chaque
 * viewport explore pour son compte, et additionner leurs pages ferait échouer
 * la garde sur un moteur parfaitement conforme.
 */
export function verifierContraintes(rapport: Rapport, scenario: Scenario, politiqueDemandee: string): void {
  const parcours = rapport.parcours;
  if (parcours === undefined) {
    return;
  }
  const entree = lireEntreePolitique(rapport.journal);
  if (entree?.demandee === undefined) {
    throw new ErreurContrainteNonAppliquee(
      RAISON_POLITIQUE_NON_JOURNALISEE,
      `le moteur a rendu un parcours sans entrée de journal « ${EVENEMENT_POLITIQUE} » : impossible de savoir quelle politique a été demandée`,
    );
  }
  if (entree.demandee !== politiqueDemandee) {
    throw new ErreurContrainteNonAppliquee(
      RAISON_POLITIQUE_NON_TRANSMISE,
      `politique demandée par le banc « ${politiqueDemandee} », politique reçue par le moteur « ${entree.demandee} »`,
    );
  }
  const pagesMax = scenario.contraintes?.pagesMax;
  if (pagesMax === undefined) {
    return;
  }
  const parViewport = new Map<string, Set<string>>();
  for (const page of parcours.pages) {
    const vues = parViewport.get(page.viewport) ?? new Set<string>();
    vues.add(normaliserLocalisation(page.url));
    parViewport.set(page.viewport, vues);
  }
  for (const [viewport, vues] of parViewport) {
    if (vues.size > pagesMax) {
      throw new ErreurContrainteNonAppliquee(
        RAISON_BUDGET_NON_APPLIQUE,
        `budget de ${pagesMax} page(s) demandé, ${vues.size} page(s) distinctes chargées dans le viewport « ${viewport} »`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Notation des attendus de CIBLE
// ---------------------------------------------------------------------------

export interface ContextePolitique {
  /** Politique DEMANDÉE au moteur pour ce run. */
  demandee: string;
  /** Politique que le moteur dit avoir appliquée, si elle est connue. */
  appliquee?: string;
}

function cibleNonMesuree(attendu: AttenduCible, politique: string, raison: string): ResultatCible {
  return {
    attendu,
    politique,
    atteinteAttendue: attendu.atteinteAttendue[politique] ?? false,
    atteinte: null,
    nonMesure: true,
    raisonNonMesure: raison,
    satisfait: false,
  };
}

/**
 * Note les attendus de nature `cible` contre le parcours du rapport, pour la
 * politique DEMANDÉE au run.
 *
 * TROIS REFUS DE FLATTER, symétriques de ceux des profils :
 *
 * 1. **Les deux sens comptent pareil.** L'attendu est satisfait quand
 *    l'atteinte observée est celle qu'il annonçait — atteinte OU non atteinte.
 *    La politique déterministe qui manque la cible sous budget est donc une
 *    RÉUSSITE de la mesure : c'est le prix affiché de la gratuité, pas un
 *    raté du moteur. La compter en échec détruirait le seul chiffre qui
 *    justifie le coût IA par scan.
 * 2. **Rien n'est déduit d'une absence.** Sans parcours, ou quand la politique
 *    demandée n'a pas été celle appliquée, l'attendu est NON MESURÉ : ni
 *    crédité, ni imputé, hors des dénominateurs.
 * 3. **Une politique dont l'attendu ne parle pas n'est pas jugée.** Un attendu
 *    qui ne se prononce pas sur `ia` ne dit pas « non » : il ne dit rien.
 */
export function noterCibles(rapport: Rapport, manifeste: Manifeste, contexte: ContextePolitique): ResultatCible[] {
  const cibles = attendusCible(manifeste);
  if (cibles.length === 0) {
    return [];
  }
  if (rapport.parcours === undefined) {
    return cibles.map((attendu) => cibleNonMesuree(attendu, contexte.demandee, RAISON_CIBLE_SANS_PARCOURS));
  }
  if (contexte.appliquee !== undefined && contexte.appliquee !== contexte.demandee) {
    return cibles.map((attendu) => cibleNonMesuree(attendu, contexte.demandee, RAISON_CIBLE_POLITIQUE_NON_APPLIQUEE));
  }
  const visitees = pagesVisitees(rapport);
  return cibles.map((attendu): ResultatCible => {
    const attendue = attendu.atteinteAttendue[contexte.demandee];
    if (attendue === undefined) {
      return cibleNonMesuree(attendu, contexte.demandee, RAISON_CIBLE_POLITIQUE_HORS_ATTENDU);
    }
    const atteinte = visitees.has(normaliserLocalisation(attendu.page));
    return {
      attendu,
      politique: contexte.demandee,
      atteinteAttendue: attendue,
      atteinte,
      nonMesure: false,
      satisfait: atteinte === attendue,
    };
  });
}

/** Les attendus de cible d'un scénario dont aucun rapport exploitable n'est sorti. */
export function ciblesNonMesurees(manifeste: Manifeste, politique: string): ResultatCible[] {
  return attendusCible(manifeste).map((attendu) => cibleNonMesuree(attendu, politique, RAISON_CIBLE_SANS_PARCOURS));
}

// ---------------------------------------------------------------------------
// Couverture : la jumelle de dépense du coût par scan
// ---------------------------------------------------------------------------

/**
 * Pages que le manifeste voulait voir atteintes : celles où un bug est
 * constatable, plus les cibles dont l'atteinte est ATTENDUE pour la politique
 * du run.
 *
 * Une page piège n'en fait jamais partie (son atteinte n'est attendue d'aucune
 * politique), et la cible manquée volontairement par la déterministe n'entre
 * pas dans SON dénominateur : l'efficacité mesure ce qu'une politique devait
 * atteindre, pas ce qu'une autre atteint.
 */
export function pagesUtilesDeclarees(manifeste: Manifeste, politique: string): Set<string> {
  const utiles = new Set<string>();
  for (const attendu of attendusBug(manifeste)) {
    for (const page of attendu.pages) {
      utiles.add(normaliserLocalisation(page));
    }
  }
  for (const attendu of attendusCible(manifeste)) {
    if (attendu.atteinteAttendue[politique] === true) {
      utiles.add(normaliserLocalisation(attendu.page));
    }
  }
  return utiles;
}

/**
 * Ce que le parcours a visité, et ce qu'il en a tiré. `undefined` sans
 * parcours : une couverture de zéro page visitée serait une efficacité de
 * 0 %, c'est-à-dire un chiffre là où il n'y a pas de mesure.
 */
export function calculerCouverture(
  rapport: Rapport,
  manifeste: Manifeste,
  contexte: ContextePolitique,
): CouvertureParcours | undefined {
  if (rapport.parcours === undefined) {
    return undefined;
  }
  // MÊME REFUS QUE LES CIBLES, et pour la même raison : le dénominateur des
  // pages utiles DÉPEND de la politique (une cible attendue hors parcours n'en
  // fait pas partie). Publier une efficacité sous l'étiquette « ia » pour un
  // parcours entièrement déterministe imputerait à une politique le résultat
  // d'une autre — un diagnostic faux (APPRENTISSAGES n°6). Sans mesure, pas
  // de chiffre : c'est traité comme un scénario sans parcours.
  if (contexte.appliquee !== undefined && contexte.appliquee !== contexte.demandee) {
    return undefined;
  }
  const visitees = pagesVisitees(rapport);
  const utiles = pagesUtilesDeclarees(manifeste, contexte.demandee);
  return {
    nbPagesVisitees: visitees.size,
    nbPagesUtiles: [...utiles].filter((page) => visitees.has(page)).length,
    nbPagesUtilesDeclarees: utiles.size,
  };
}

/**
 * INVARIANT ÉTENDU (jumeau de celui des profils non mesurés, brique 4a).
 *
 * Un repli par décision est une ABSENCE SUBIE : le moteur voulait consulter
 * l'IA, il ne l'a pas pu, et la déterministe a tranché à sa place. Le scan
 * continue — c'est le bon comportement —, mais le scénario ne peut pas être
 * `ok` : ce qu'il mesure n'est plus ce qu'on croit mesurer. En régime déclaré
 * sans IA ou en politique déterministe demandée, il n'y a aucun repli
 * possible, donc rien à signaler.
 */
export function replisDecisionSubis(nbReplis: number, politiqueDemandee: string, politiqueIa: string): number {
  return politiqueDemandee === politiqueIa ? nbReplis : 0;
}
