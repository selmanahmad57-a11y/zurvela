/**
 * `pnpm banc:variance-ia` — mesure la VARIANCE du modèle, et rien d'autre.
 *
 * N appels RÉELS (config `profilage.varianceAppels`) sur le même scénario,
 * sans cassette, puis publication de l'accord inter-appels sur `typeSite` et
 * `langue`.
 *
 * Elle vit délibérément HORS de la scorecard. La scorecard doit rester bit à
 * bit reproductible : y verser une mesure qui change à chaque exécution
 * rendrait impossible la comparaison de deux runs, et le premier écart
 * inexpliqué ferait douter de tout le reste. La variance est une
 * caractérisation de l'instrument de mesure, pas une note du moteur — et,
 * sur un scénario d'injection, elle répond à la seule question qui compte :
 * l'inertie tient-elle 5 fois sur 5, ou 3 fois sur 5 ? Les deux sont des
 * résultats ; seul le silence n'en est pas un.
 *
 * DEUX MESURES, une seule garde. `--mesure profil` (défaut) publie l'accord
 * sur `typeSite` et `langue` ; `--mesure decision` publie l'accord sur
 * l'`actionId` élu au PREMIER POINT DE DÉCISION du scénario. La seconde n'a
 * de sens que sous la politique IA — la déterministe n'appelle aucun modèle,
 * et mesurer sa « variance » reviendrait à mesurer la variance de zéro.
 *
 * Usage : pnpm banc:variance-ia [--mesure profil|decision] --scenario <id> [--scenario <id>…] [--appels N]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../core/i18n.js';
import type { Rapport } from '../core/types.js';
import { chargerConfigProfilage } from '../core/scanner/config.js';
import { chargerConfig } from './config.js';
import { noterScenario } from './correcteur/index.js';
import { creerSujet } from './correcteur/sujets.js';
import { obtenirGabarit } from './gabarits/index.js';
import { creerClientIaBanc } from './ia.js';
import { depuisRacine } from './outils/racine.js';
import { chargerScenario } from './scenarios/charger.js';
import { POLITIQUE_DETERMINISTE, POLITIQUE_IA, type ConfigBanc, type Scenario, type SujetNote } from './types.js';

/**
 * Ce qu'on mesure. `profil` : la classification (brique 4a). `decision` :
 * l'élection au premier point de décision (brique 4b).
 */
export const MESURES = ['profil', 'decision'] as const;
export type Mesure = (typeof MESURES)[number];

export function estMesure(nom: string): nom is Mesure {
  return (MESURES as readonly string[]).includes(nom);
}

interface Options {
  scenarios: string[];
  appels?: number;
  mesure: Mesure;
}

function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({
      args,
      options: { scenario: { type: 'string', multiple: true }, appels: { type: 'string' }, mesure: { type: 'string' } },
      strict: true,
    });
    const appels = values.appels === undefined ? undefined : Number(values.appels);
    if (appels !== undefined && (!Number.isInteger(appels) || appels < 1)) {
      return null;
    }
    const mesure = values.mesure ?? MESURES[0];
    if (!estMesure(mesure)) {
      return null;
    }
    return { scenarios: values.scenario ?? [], mesure, ...(appels === undefined ? {} : { appels }) };
  } catch {
    return null;
  }
}

/** Valeur observée d'un appel : absente quand le profil n'a pas été produit. */
const VALEUR_ABSENTE = '—';

/**
 * Accord inter-appels sur une valeur : part de la modalité la plus fréquente.
 *
 * C'est la mesure la MOINS flatteuse des lectures possibles (on ne compte pas
 * « la bonne réponse au moins une fois »), et elle inclut les appels sans
 * valeur : un appel qui n'a rien produit est un désaccord avec ceux qui ont
 * produit quelque chose, pas une observation à retirer de l'échantillon.
 */
export function nbMesuresExploitables(valeurs: readonly string[]): number {
  return valeurs.filter((valeur) => valeur !== VALEUR_ABSENTE).length;
}

export function accord(valeurs: readonly string[]): { modalite: string; occurrences: number; total: number; distinctes: number } {
  const comptes = new Map<string, number>();
  for (const valeur of valeurs) {
    comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
  }
  const trie = [...comptes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const [modalite, occurrences] = trie[0] ?? [VALEUR_ABSENTE, 0];
  return { modalite, occurrences, total: valeurs.length, distinctes: comptes.size };
}

/**
 * `actionId` élu au PREMIER POINT DE DÉCISION du parcours, ou `undefined` si
 * aucune décision de modèle n'a été prise.
 *
 * Il se lit sur l'ACTE et non sur le journal : `ActionExecutee.decision`
 * porte la provenance jusqu'à l'action réellement exécutée, et c'est elle
 * qu'on veut caractériser. Une action tranchée par le repli déterministe n'a
 * pas de provenance : elle ne compte donc pas comme une mesure du modèle —
 * sans quoi l'accord publierait la stabilité du repli sous le nom de la
 * stabilité du modèle (APPRENTISSAGES n°6).
 */
export function premierActionIdElu(rapport: Rapport | undefined): string | undefined {
  for (const action of rapport?.parcours?.actions ?? []) {
    const actionId = action.decision?.provenance?.actionId;
    if (actionId !== undefined) {
      return actionId;
    }
  }
  return undefined;
}

/** Un appel de la campagne : ce qu'il a produit, et ce qu'il a coûté. */
interface Observation {
  valeurs: Record<string, string>;
  cout: number;
}

/**
 * Mesure un scénario et rend le nombre d'appels EXPLOITABLES (ceux qui ont
 * réellement produit une valeur).
 *
 * Un échantillon vide ne doit JAMAIS se lire comme un accord parfait : sans
 * ce compte, cinq appels muets s'affichaient « 5/5, 1 valeur distincte »,
 * c'est-à-dire l'accord sur le silence — un compteur incapable de révéler
 * qu'il n'a rien mesuré (APPRENTISSAGES n°4), doublé d'un diagnostic faux
 * (n°6 : le lecteur y lit une inertie parfaite là où il n'y a eu aucun appel).
 *
 * LA GARDE EST COMMUNE AUX DEUX MESURES, et c'est délibéré : elle a été posée
 * à la clôture de la 4a pour le profil, et un second mode qui la
 * réimplémenterait à sa façon finirait par en diverger. Ici, une seule
 * fonction décide, et « aucune mesure exploitable » est un échec bruyant quel
 * que soit ce qu'on mesurait.
 */
async function mesurerScenario(
  scenario: Scenario,
  appels: number,
  params: { sujet: SujetNote; politique: string; mesure: Mesure; config: ConfigBanc; dico: Dictionnaire },
): Promise<number> {
  const { sujet, politique, mesure, config, dico } = params;
  const observations: Observation[] = [];

  for (let appel = 1; appel <= appels; appel += 1) {
    const resultat = await noterScenario(scenario, { sujet, politique, config, dico, obtenirGabarit });
    const profil = resultat.rapport?.profil;
    const valeurs: Record<string, string> =
      mesure === 'decision'
        ? { actionId: premierActionIdElu(resultat.rapport) ?? VALEUR_ABSENTE }
        : {
            typeSite: profil?.typeSite ?? VALEUR_ABSENTE,
            langue: profil?.langue ?? VALEUR_ABSENTE,
          };
    observations.push({ valeurs, cout: resultat.coutApi });
    console.log(
      traduire(dico, 'varianceIa.appel', {
        appel,
        appels,
        valeurs: Object.entries(valeurs)
          .map(([nom, valeur]) => `${nom}=${valeur}`)
          .join(', '),
      }),
    );
  }

  // La PREMIÈRE valeur porte la garde : c'est celle sans laquelle les autres
  // n'ont pas de sens (le `typeSite` du profil, l'`actionId` de la décision).
  const [nomPrincipal = ''] = Object.keys(observations[0]?.valeurs ?? {});
  const principales = observations.map((observation) => observation.valeurs[nomPrincipal] ?? VALEUR_ABSENTE);
  const mesures = nbMesuresExploitables(principales);
  if (mesures === 0) {
    // Échec BRUYANT : aucune valeur à comparer, donc aucun accord à publier.
    console.error(traduire(dico, 'varianceIa.aucuneMesure', { id: scenario.id, appels, mesure }));
    return 0;
  }

  const accords = Object.keys(observations[0]?.valeurs ?? {}).map((nom) => {
    const resultat = accord(observations.map((observation) => observation.valeurs[nom] ?? VALEUR_ABSENTE));
    return `${nom} « ${resultat.modalite} » ${resultat.occurrences}/${appels} (${resultat.distinctes})`;
  });
  console.log(
    traduire(dico, 'varianceIa.accord', {
      id: scenario.id,
      mesure,
      accords: accords.join(', '),
      appels,
      mesures,
      cout: observations.reduce((total, observation) => total + observation.cout, 0),
    }),
  );
  return mesures;
}

async function principal(): Promise<void> {
  const [config, profilage] = await Promise.all([chargerConfig(), chargerConfigProfilage()]);
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);

  const options = lireOptions();
  if (options === null || options.scenarios.length === 0) {
    console.error(traduire(dico, 'varianceIa.usage'));
    process.exitCode = 2;
    return;
  }
  const appels = options.appels ?? profilage.varianceAppels;
  // La variance des DÉCISIONS n'a de sens que sous la politique IA : la
  // déterministe n'appelle aucun modèle, et publier « accord 5/5 » sur ses
  // choix mesurerait la stabilité d'un algorithme, pas celle d'un modèle.
  const politique = options.mesure === 'decision' ? POLITIQUE_IA : POLITIQUE_DETERMINISTE;

  const dossierScenarios = depuisRacine(config.scenarios.dossier);
  const scenarios = await Promise.all(options.scenarios.map((id) => chargerScenario(dossierScenarios, id)));

  const { client, modele } = await creerClientIaBanc({ regime: 'direct' });
  const sujet = await creerSujet(config.scan.sujetParDefaut, client, { politique });
  console.log(traduire(dico, 'varianceIa.demarrage', { nombre: scenarios.length, appels, modele, mesure: options.mesure, politique }));

  let scenariosSansMesure = 0;
  for (const scenario of scenarios) {
    if ((await mesurerScenario(scenario, appels, { sujet, politique, mesure: options.mesure, config, dico })) === 0) {
      scenariosSansMesure += 1;
    }
  }
  if (scenariosSansMesure > 0) {
    // Une commande de mesure qui n'a rien mesuré échoue : sortir en 0 ferait
    // passer l'absence de donnée pour un résultat.
    console.error(traduire(dico, 'varianceIa.echec', { nombre: scenariosSansMesure, total: scenarios.length }));
    process.exitCode = 1;
    return;
  }
  console.log(traduire(dico, 'varianceIa.horsScorecard'));
}

// Exécuté seulement en ligne de commande : le module exporte aussi des
// fonctions pures, et un import de test ne doit jamais lancer la commande
// (ni ses appels réseau payants).
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await principal();
}
