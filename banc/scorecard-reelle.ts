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

/**
 * LE SOCLE COMMUN — les pages que les DEUX moteurs ont réellement visitées
 * (dette n°25).
 *
 * Deux moteurs ne voient pas le même nombre de pages : P2-1 a donné à la
 * confirmation une réserve que l'exploration ne peut plus manger, donc le
 * moteur d'aujourd'hui explore moins et JUGE, là où celui d'hier explorait
 * jusqu'à l'échéance et ne jugeait rien. Comparer leurs identités sur des
 * parcours différents mélangerait deux choses : ce que le moteur a changé,
 * et ce qu'il n'a pas eu le temps de voir.
 *
 * La réponse n'est ni « non comparable » (qui jette le site du bilan) ni
 * « comparable » (qui mentirait) : la comparaison porte sur le socle, et le
 * périmètre laissé dehors est DÉCLARÉ. Même honnêteté que « sans objet »
 * pour un ratio sans dénominateur — on ne note pas un échec, on nomme ce
 * qu'on a mesuré et sur quoi.
 */
export function pagesVisitees(rapport: Rapport): Set<string> {
  const pages = (rapport as { parcours?: { pages?: { url?: string }[] } }).parcours?.pages ?? [];
  return new Set(pages.map((page) => page.url).filter((url): url is string => url !== undefined));
}

/**
 * Restreint un rapport au socle : chaque anomalie perd les localisations
 * hors socle, et disparaît si elle n'en garde aucune ; les sections de son
 * groupe partent avec elle.
 *
 * CE QUI N'EST PAS RESTREINT, et c'est dit plutôt que caché : les candidates
 * ÉCARTÉES ne portent pas de page — elles référencent un groupe par sa clé.
 * Elles restent donc comparées en entier, et une divergence d'écartée peut
 * venir du périmètre. Le journal reste l'arbitre (n°40).
 */
export function restreindreAuSocle(rapport: Rapport, socle: ReadonlySet<string>): Rapport {
  const anomalies: unknown[] = [];
  const groupesRetenus = new Set<string>();
  for (const brute of rapport.anomalies ?? []) {
    const anomalie = brute as { groupe?: string; localisations?: { urlOuEtape?: string }[] };
    const gardees = (anomalie.localisations ?? []).filter((place) => place.urlOuEtape !== undefined && socle.has(place.urlOuEtape));
    if (gardees.length === 0) {
      continue;
    }
    groupesRetenus.add(anomalie.groupe ?? '');
    anomalies.push({ ...anomalie, localisations: gardees });
  }
  const business = rapport.rapportBusiness;
  return {
    ...rapport,
    anomalies: anomalies as Rapport['anomalies'],
    ...(business === undefined
      ? {}
      : {
          rapportBusiness: {
            ...business,
            sections: (business.sections ?? []).filter((section) => groupesRetenus.has(section.groupe ?? '')),
          },
        }),
  };
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

export interface Perimetre {
  site: string;
  /** Pages que les deux moteurs ont visitées : c'est là que la comparaison vaut. */
  communes: number;
  /** Pages vues par CE moteur seulement : hors comparaison, et dites. */
  horsSocle: string[];
}

export async function construire(
  chemins: readonly string[],
  /** Les journaux de l'AUTRE moteur : leur intersection de pages fait le socle. */
  cheminsSocle: readonly string[] = [],
): Promise<{ scenarios: ResultatScenario[]; perimetres: Perimetre[] }> {
  const socles = new Map<string, Set<string>>();
  for (const chemin of cheminsSocle) {
    const autre = JSON.parse(await readFile(chemin, 'utf8')) as Rapport;
    socles.set(identifiantDeSite(autre, path.basename(chemin)), pagesVisitees(autre));
  }

  const scenarios: ResultatScenario[] = [];
  const perimetres: Perimetre[] = [];
  const vus = new Set<string>();
  for (const chemin of chemins) {
    const brut = JSON.parse(await readFile(chemin, 'utf8')) as Rapport;
    const identifiant = identifiantDeSite(brut, path.basename(chemin));
    if (vus.has(identifiant)) {
      throw new SitesEnDouble(identifiant);
    }
    vus.add(identifiant);
    const pagesAutre = socles.get(identifiant);
    if (pagesAutre === undefined) {
      scenarios.push(pseudoScenario(brut, identifiant));
      continue;
    }
    const miennes = pagesVisitees(brut);
    const socle = new Set([...miennes].filter((url) => pagesAutre.has(url)));
    perimetres.push({ site: identifiant, communes: socle.size, horsSocle: [...miennes].filter((url) => !pagesAutre.has(url)) });
    scenarios.push(pseudoScenario(restreindreAuSocle(brut, socle), identifiant));
  }
  return { scenarios, perimetres };
}

async function principal(): Promise<void> {
  const dico = await chargerDictionnaire(depuisRacine('locales'), (await chargerConfig()).langueConsole);
  const args = process.argv.slice(2);
  const coupure = args.indexOf('--socle');
  const [sortie, ...journaux] = coupure === -1 ? args : args.slice(0, coupure);
  const socle = coupure === -1 ? [] : args.slice(coupure + 1);
  if (sortie === undefined || journaux.length === 0) {
    console.error(traduire(dico, 'scorecardReelle.usage'));
    process.exitCode = 2;
    return;
  }
  let scorecard;
  try {
    scorecard = await construire(journaux, socle);
  } catch (cause: unknown) {
    if (!(cause instanceof SitesEnDouble)) {
      throw cause;
    }
    console.error(traduire(dico, 'scorecardReelle.siteEnDouble', { site: cause.message }));
    process.exitCode = 2;
    return;
  }
  await writeFile(sortie, `${JSON.stringify(scorecard, null, 1)}\n`, 'utf8');
  for (const perimetre of scorecard.perimetres) {
    console.log(
      traduire(dico, 'scorecardReelle.perimetre', {
        site: perimetre.site,
        communes: perimetre.communes,
        horsSocle: perimetre.horsSocle.length,
      }),
    );
  }
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
