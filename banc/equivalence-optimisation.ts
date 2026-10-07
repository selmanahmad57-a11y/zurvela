/**
 * L'ORACLE D'ÉQUIVALENCE, en commande (cahier P2-4, contrat 1).
 *
 *   pnpm banc:equivalence-optimisation <référence.json> <optimise.json>
 *
 * Il compare DEUX SCORECARDS produites par le banc — l'une sans
 * optimisation, l'autre avec — et exige la même empreinte sur chaque
 * scénario. Il ne mesure AUCUNE vitesse : le gain se mesure APRÈS que
 * l'équivalence est établie, jamais avant (APPRENTISSAGES n°33), parce
 * qu'un chiffre de vitesse obtenu sur deux scans divergents compare deux
 * comportements et non deux vitesses.
 *
 * Sortie : la liste des divergences, en distinguant ce qui est PERDU de ce
 * qui APPARAÎT — perdre une anomalie est une faute, en gagner une est une
 * question. Code de sortie 1 dès la première divergence : l'équivalence ne
 * se négocie pas, et aucun réglage ne doit pouvoir la rendre tolérable.
 */
import { readFile } from 'node:fs/promises';
import { chargerDictionnaire, traduire } from '../core/i18n.js';
import { chargerConfig } from './config.js';
import { depuisRacine } from './outils/racine.js';
import {
  comparerEmpreintes,
  empreinteIdentite,
  identitesApparues,
  identitesPerdues,
  type EcartElements,
} from './correcteur/empreinte.js';
import type { ResultatScenario } from './types.js';

interface Scorecard {
  politique?: string;
  scenarios: ResultatScenario[];
}

/**
 * Gabarits dont l'identité par-scénario est un ARTEFACT DE TIMING PAR
 * CONCEPTION, donc HORS du contrôle d'identité-équivalence (dette n°33).
 *
 * `site-charge` existe pour METTRE LE BUDGET DE CONFIRMATION SOUS TENSION
 * (cahier P2-4) : il sature, et SOUS saturation, QUELS groupes sont confirmés
 * avant que l'échéance-temps ne tombe dépend de la vitesse de la machine à
 * l'instant. Mesuré (2026-10-07) : sur quatre scorecards à CODE IDENTIQUE, le
 * compte de 404 confirmés bascule d'un run à l'autre. Une identité non
 * déterministe PAR CONCEPTION ne peut pas être comparée par un oracle qui
 * exige l'égalité : l'y soumettre ferait crier « NON ÉQUIVALENT » à chaque
 * tableau, sur un gabarit, pour une raison étrangère à ce qu'on mesure — et un
 * oracle qu'on apprend à ignorer est mort (n°48 sous une autre forme).
 *
 * C'est une PROPRIÉTÉ de l'instrument, pas un réglage : un invariant (quels
 * gabarits n'ont pas d'identité stable), donc en code, sous revue. L'exclusion
 * est ANNONCÉE à chaque run — un oracle qui DÉCLARE ce qu'il ne vérifie pas est
 * honnête ; un skip muet serait précisément le mort-vivant. La CONSTRUCTION de
 * `site-charge` reste couverte par `p2-4.test.ts`, sa PERFORMANCE par les
 * métriques : rien de vérifiable n'est perdu, seul l'axe identité — qui n'était
 * pas fiable sur lui — l'est.
 *
 * Condition de SORTIE de cette liste (dette n°33) : qu'un gabarit soit rendu
 * déterministe sur son identité. Tant qu'il sature un budget-temps, il reste.
 */
export const GABARITS_HORS_EQUIVALENCE: readonly string[] = ['site-charge'];

/** Sépare les scénarios comparables des scénarios hors équivalence (voir `GABARITS_HORS_EQUIVALENCE`). */
export function partitionnerEquivalence(scenarios: ResultatScenario[]): {
  retenus: ResultatScenario[];
  exclus: ResultatScenario[];
} {
  const retenus: ResultatScenario[] = [];
  const exclus: ResultatScenario[] = [];
  for (const scenario of scenarios) {
    (GABARITS_HORS_EQUIVALENCE.includes(scenario.gabarit) ? exclus : retenus).push(scenario);
  }
  return { retenus, exclus };
}

export function lireArguments(args: string[]): { reference: string; optimise: string } | null {
  const [reference, optimise] = args;
  return reference === undefined || optimise === undefined ? null : { reference, optimise };
}

async function charger(chemin: string): Promise<Scorecard> {
  return JSON.parse(await readFile(chemin, 'utf8')) as Scorecard;
}

async function principal(): Promise<void> {
  const dico = await chargerDictionnaire(depuisRacine('locales'), (await chargerConfig()).langueConsole);
  const args = lireArguments(process.argv.slice(2));
  if (args === null) {
    console.error(traduire(dico, 'equivalence.usage'));
    process.exitCode = 2;
    return;
  }
  const [reference, optimise] = await Promise.all([charger(args.reference), charger(args.optimise)]);
  const ref = partitionnerEquivalence(reference.scenarios);
  const opt = partitionnerEquivalence(optimise.scenarios);
  const divergences = comparerEmpreintes(ref.retenus, opt.retenus);
  const perdues = identitesPerdues(divergences);
  const apparues = identitesApparues(divergences);

  console.log(traduire(dico, 'equivalence.entete', { reference: ref.retenus.length, optimise: opt.retenus.length }));
  // L'exclusion N'EST PAS un skip muet : on déclare, à chaque run, ce qui est
  // hors équivalence et pourquoi (dette n°33). Un oracle qui dit ce qu'il ne
  // vérifie pas est honnête ; le taire serait le mort-vivant.
  const gabaritsExclus = [...new Set(ref.exclus.map((s) => s.gabarit))].sort();
  if (ref.exclus.length > 0) {
    console.log(traduire(dico, 'equivalence.exclusion', { nombre: ref.exclus.length, gabarits: gabaritsExclus.join(', ') }));
  }
  if (divergences.length === 0) {
    console.log(traduire(dico, 'equivalence.equivalent', { nombre: ref.retenus.length }));
    console.log(traduire(dico, 'equivalence.gainMesurable'));
    return;
  }

  const bloc = (titre: string, ecart: EcartElements): void => {
    if (ecart.perdus.length === 0 && ecart.apparus.length === 0) {
      return;
    }
    console.log(traduire(dico, titre));
    for (const perdu of ecart.perdus) {
      console.log(traduire(dico, 'equivalence.perdu', { element: perdu }));
    }
    for (const apparu of ecart.apparus) {
      console.log(traduire(dico, 'equivalence.apparu', { element: apparu }));
    }
  };

  console.log('');
  for (const divergence of divergences) {
    console.log(traduire(dico, 'equivalence.scenario', { id: divergence.scenarioId }));
    bloc('equivalence.titreIdentite', divergence.identite);
    bloc('equivalence.titreEffort', divergence.effort);
  }

  // LE VERDICT. Seule une identité PERDUE est un échec : c'est l'erreur
  // cardinale du projet. Une identité gagnée n'est pas une équivalence pour
  // autant — elle s'affiche assez fort pour qu'on l'explique par écrit, et
  // le banc la garde de son côté (une anomalie gagnée à tort est un faux
  // positif, qu'il compte et punit).
  console.log('');
  if (perdues > 0) {
    console.log(traduire(dico, 'equivalence.nonEquivalent', { nombre: divergences.length }));
    console.log(traduire(dico, 'equivalence.bilanPerdus', { nombre: perdues }));
    process.exitCode = 1;
    return;
  }
  if (apparues > 0) {
    // Et SURTOUT PAS `gainMesurable` ici : les deux exécutions ne font pas
    // la même chose, donc la durée ne compare pas deux vitesses. Promettre
    // le contraire serait l'erreur que l'oracle existe pour empêcher.
    console.log(traduire(dico, 'equivalence.identiteGagnee', { nombre: apparues, scenarios: divergences.length }));
    console.log(traduire(dico, 'equivalence.gainNonComparable'));
    return;
  }
  console.log(traduire(dico, 'equivalence.identitePreservee', { nombre: divergences.length }));
  console.log(traduire(dico, 'equivalence.gainMesurable'));
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('equivalence-optimisation.ts')) {
  await principal();
}

export { empreinteIdentite };
