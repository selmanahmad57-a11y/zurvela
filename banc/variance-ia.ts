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
 * Usage : pnpm banc:variance-ia --scenario <id> [--scenario <id>…] [--appels N]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../core/i18n.js';
import { chargerConfigProfilage } from '../core/scanner/config.js';
import { chargerConfig } from './config.js';
import { noterScenario } from './correcteur/index.js';
import { creerSujet } from './correcteur/sujets.js';
import { obtenirGabarit } from './gabarits/index.js';
import { creerClientIaBanc } from './ia.js';
import { depuisRacine } from './outils/racine.js';
import { chargerScenario } from './scenarios/charger.js';
import type { ConfigBanc, Scenario } from './types.js';

interface Options {
  scenarios: string[];
  appels?: number;
}

function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({
      args,
      options: { scenario: { type: 'string', multiple: true }, appels: { type: 'string' } },
      strict: true,
    });
    const appels = values.appels === undefined ? undefined : Number(values.appels);
    if (appels !== undefined && (!Number.isInteger(appels) || appels < 1)) {
      return null;
    }
    return { scenarios: values.scenario ?? [], ...(appels === undefined ? {} : { appels }) };
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
 * Mesure un scénario et rend le nombre d'appels EXPLOITABLES (ceux qui ont
 * réellement produit un profil).
 *
 * Un échantillon vide ne doit JAMAIS se lire comme un accord parfait : sans
 * ce compte, cinq appels muets s'affichaient « 5/5, 1 valeur distincte »,
 * c'est-à-dire l'accord sur le silence — un compteur incapable de révéler
 * qu'il n'a rien mesuré (APPRENTISSAGES n°4), doublé d'un diagnostic faux
 * (n°6 : le lecteur y lit une inertie parfaite là où il n'y a eu aucun appel).
 */
async function mesurerScenario(
  scenario: Scenario,
  appels: number,
  params: { scanner: Awaited<ReturnType<typeof creerSujet>>; config: ConfigBanc; dico: Dictionnaire },
): Promise<number> {
  const { scanner, config, dico } = params;
  const typesSite: string[] = [];
  const langues: string[] = [];
  let cout = 0;

  for (let appel = 1; appel <= appels; appel += 1) {
    const resultat = await noterScenario(scenario, { scanner, config, dico, obtenirGabarit });
    const profil = resultat.rapport?.profil;
    typesSite.push(profil?.typeSite ?? VALEUR_ABSENTE);
    langues.push(profil?.langue ?? VALEUR_ABSENTE);
    cout += resultat.coutApi;
    console.log(
      traduire(dico, 'varianceIa.appel', {
        appel,
        appels,
        typeSite: profil?.typeSite ?? VALEUR_ABSENTE,
        langue: profil?.langue ?? VALEUR_ABSENTE,
        confiance: profil?.confiance ?? VALEUR_ABSENTE,
      }),
    );
  }

  const mesures = nbMesuresExploitables(typesSite);
  if (mesures === 0) {
    // Échec BRUYANT : aucune valeur à comparer, donc aucun accord à publier.
    console.error(traduire(dico, 'varianceIa.aucuneMesure', { id: scenario.id, appels }));
    return 0;
  }

  const parType = accord(typesSite);
  const parLangue = accord(langues);
  console.log(
    traduire(dico, 'varianceIa.accord', {
      id: scenario.id,
      typeSite: parType.modalite,
      accordTypeSite: parType.occurrences,
      distinctesTypeSite: parType.distinctes,
      langue: parLangue.modalite,
      accordLangue: parLangue.occurrences,
      distinctesLangue: parLangue.distinctes,
      appels,
      mesures,
      cout,
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

  const dossierScenarios = depuisRacine(config.scenarios.dossier);
  const scenarios = await Promise.all(options.scenarios.map((id) => chargerScenario(dossierScenarios, id)));

  const { client, modele } = await creerClientIaBanc({ regime: 'direct' });
  const scanner = await creerSujet(config.scan.sujetParDefaut, client);
  console.log(traduire(dico, 'varianceIa.demarrage', { nombre: scenarios.length, appels, modele }));

  let scenariosSansMesure = 0;
  for (const scenario of scenarios) {
    if ((await mesurerScenario(scenario, appels, { scanner, config, dico })) === 0) {
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
