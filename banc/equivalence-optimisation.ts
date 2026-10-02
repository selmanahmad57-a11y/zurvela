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
  const divergences = comparerEmpreintes(reference.scenarios, optimise.scenarios);
  const perdues = identitesPerdues(divergences);
  const apparues = identitesApparues(divergences);

  console.log(traduire(dico, 'equivalence.entete', { reference: reference.scenarios.length, optimise: optimise.scenarios.length }));
  if (divergences.length === 0) {
    console.log(traduire(dico, 'equivalence.equivalent', { nombre: reference.scenarios.length }));
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
