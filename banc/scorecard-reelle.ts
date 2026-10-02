/**
 * L'ORACLE D'ÉQUIVALENCE, APPLIQUÉ AU RÉEL (cahier P2-4, clôture).
 *
 *   pnpm banc:scorecard-reelle <sortie.json> <journal.json...>
 *
 * Le grand tableau produit des JOURNAUX de scan réel, un par site et par
 * moteur ; l'oracle, lui, compare deux SCORECARDS de banc. Cette commande
 * fait le pont : elle enveloppe chaque journal en pseudo-scénario, nommé par
 * l'hôte du site, et écrit une scorecard que `banc:equivalence-optimisation`
 * lit sans modification.
 *
 * ## Pourquoi ce pont n'est pas un confort
 *
 * Sans lui, le dépouillement du grand tableau serait MANUEL : neuf sites,
 * des dizaines de sections, à la fin d'un cahier, sur des runs coûteux —
 * c'est-à-dire exactement la situation où l'attention cède (n°34). Et la
 * question à trancher y est la plus subtile du projet : les sites lourds
 * vont passer de tronqués à complets, donc des anomalies vont APPARAÎTRE,
 * et il faudra distinguer « la couverture s'élargit » de « le jugement
 * change » — ce que l'oracle ne sait pas faire seul (n°40), mais ce qu'il
 * est seul à savoir POSER. L'oracle trie, le jugement tranche ; sans le
 * pont, il n'y a même pas de tri.
 *
 * ## Ce que le pseudo-scénario contient, et ce qu'il n'invente pas
 *
 * L'oracle ne lit QUE l'empreinte : anomalies, écartées, sections publiées,
 * comptes déclarés, statut. Tout le reste d'un `ResultatScenario` est une
 * notation de banc — attendus, cibles, profils — qui n'existe pas pour un
 * site réel, et qui reste donc VIDE plutôt que fabriquée. Un champ rempli
 * au hasard pour satisfaire un type serait une donnée fausse dans un
 * fichier qui sert à juger la Phase 2.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chargerDictionnaire, traduire } from '../core/i18n.js';
import { chargerConfig } from './config.js';
import { depuisRacine } from './outils/racine.js';
import type { Rapport } from '../core/types.js';
import type { ResultatScenario } from './types.js';

/**
 * Le nom du pseudo-scénario : l'HÔTE du site, pas le chemin du fichier.
 * Deux moteurs écrivent leurs journaux dans des dossiers différents ; c'est
 * le site qui doit les apparier, sans quoi l'oracle croirait que tous les
 * scénarios ont disparu et réapparu.
 */
export function identifiantDeSite(rapport: Rapport, repli: string): string {
  try {
    return new URL(rapport.url).host;
  } catch {
    return repli;
  }
}

/** Un journal de scan, enveloppé pour l'oracle. Rien n'est inventé. */
export function pseudoScenario(rapport: Rapport, scenarioId: string): ResultatScenario {
  return {
    scenarioId,
    gabarit: scenarioId,
    langue: '',
    politique: '',
    statut: 'ok',
    // Vides et non fabriqués : un site réel n'a pas de manifeste.
    attendus: [],
    profils: [],
    cibles: [],
    rapports: [],
    fauxPositifs: [],
    nbReplisDecision: 0,
    coutApi: rapport.coutApi,
    dureeMs: rapport.dureeMs,
    rapport,
    ...(rapport.rapportBusiness === undefined ? {} : { rapportBusiness: rapport.rapportBusiness }),
  };
}

/**
 * Deux journaux du MÊME site dans une même scorecard : refus.
 *
 * C'est l'erreur de manipulation la plus facile à commettre le soir du
 * grand tableau — glisser les journaux des deux moteurs dans la même
 * scorecard. L'oracle n'y verrait que du feu : il apparierait l'un des deux
 * au hasard et déclarerait tranquillement une équivalence qui ne compare
 * rien. Un instrument qui peut mentir en silence sur une faute de frappe
 * n'est pas un instrument.
 */
export class SitesEnDouble extends Error {}

export async function construire(chemins: readonly string[]): Promise<{ scenarios: ResultatScenario[] }> {
  const scenarios: ResultatScenario[] = [];
  const vus = new Set<string>();
  for (const chemin of chemins) {
    const rapport = JSON.parse(await readFile(chemin, 'utf8')) as Rapport;
    const identifiant = identifiantDeSite(rapport, path.basename(chemin));
    if (vus.has(identifiant)) {
      throw new SitesEnDouble(identifiant);
    }
    vus.add(identifiant);
    scenarios.push(pseudoScenario(rapport, identifiant));
  }
  return { scenarios };
}

async function principal(): Promise<void> {
  const dico = await chargerDictionnaire(depuisRacine('locales'), (await chargerConfig()).langueConsole);
  const [sortie, ...journaux] = process.argv.slice(2);
  if (sortie === undefined || journaux.length === 0) {
    console.error(traduire(dico, 'scorecardReelle.usage'));
    process.exitCode = 2;
    return;
  }
  let scorecard;
  try {
    scorecard = await construire(journaux);
  } catch (cause: unknown) {
    if (!(cause instanceof SitesEnDouble)) {
      throw cause;
    }
    console.error(traduire(dico, 'scorecardReelle.siteEnDouble', { site: cause.message }));
    process.exitCode = 2;
    return;
  }
  await writeFile(sortie, `${JSON.stringify(scorecard, null, 1)}\n`, 'utf8');
  console.log(
    traduire(dico, 'scorecardReelle.ecrite', {
      fichier: sortie,
      nombre: scorecard.scenarios.length,
      sites: scorecard.scenarios.map((scenario) => scenario.scenarioId).join(', '),
    }),
  );
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('scorecard-reelle.ts')) {
  await principal();
}
