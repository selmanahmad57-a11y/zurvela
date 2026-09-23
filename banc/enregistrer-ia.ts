/**
 * `pnpm banc:enregistrer-ia` — SEUL chemin d'enregistrement des cassettes,
 * et l'un des deux seuls chemins du dépôt qui appellent un modèle.
 *
 * L'enregistrement passe par un SCAN RÉEL du scénario, pas par un appel
 * fabriqué à la main : la clé d'une cassette est un hash du contexte de
 * profilage, et ce contexte n'est identique à celui d'un run normal que s'il
 * vient de la même extraction, par le même pipeline, sur le même site servi.
 * Une cassette enregistrée autrement serait introuvable au rejeu — une
 * commande qui « réussit » en ne servant à rien.
 *
 * La garde anti-écrasement du dépôt lève si une réponse DIFFÉRENTE existe déjà
 * sous la même clé : la commande s'arrête alors bruyamment. C'est voulu — un
 * enregistrement n'est pas un scan, il n'a pas à continuer vaille que vaille.
 *
 * Usage : pnpm banc:enregistrer-ia --scenario <id> | --tous
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../core/i18n.js';
import type { Cassette } from '../core/ia/index.js';
import { chargerConfig } from './config.js';
import { executerBanc } from './correcteur/index.js';
import { creerSujet } from './correcteur/sujets.js';
import { obtenirGabarit } from './gabarits/index.js';
import { creerClientIaBanc, DOSSIER_CASSETTES } from './ia.js';
import { depuisRacine } from './outils/racine.js';
import { chargerScenario, chargerScenarios } from './scenarios/charger.js';
import type { Scenario } from './types.js';

interface Options {
  scenario?: string;
  tous: boolean;
}

function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({ args, options: { scenario: { type: 'string' }, tous: { type: 'boolean' } }, strict: true });
    return { scenario: values.scenario, tous: values.tous === true };
  } catch {
    return null;
  }
}

/** Les cassettes présentes sur le disque, triées par clé (ordre stable, indépendant du système de fichiers). */
async function lireCassettes(dossier: string): Promise<Cassette[]> {
  let noms: string[];
  try {
    noms = await readdir(dossier);
  } catch {
    return [];
  }
  const cassettes = await Promise.all(
    noms
      .filter((nom) => nom.endsWith('.json'))
      .map(async (nom) => JSON.parse(await readFile(path.join(dossier, nom), 'utf8')) as Cassette),
  );
  return cassettes.sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
}

/**
 * Publie le couple (modèle demandé, modèle servi) de chaque cassette, et
 * alerte si les deux sont PARTOUT identiques.
 *
 * Un alias se résout normalement vers une forme datée : un parc où
 * `modeleServi` est toujours égal à `modeleDemande` est le symptôme d'une
 * recopie de l'alias, pas d'une coïncidence. C'est l'apprentissage n°5
 * appliqué à une donnée de provenance : une estampille que rien ne distingue
 * de sa voisine n'estampille rien. Le typecheck ne peut pas voir ça — les
 * deux champs sont des chaînes ; seule une lecture du parc réel le peut.
 */
function rapporterProvenance(cassettes: readonly Cassette[], dico: Dictionnaire): void {
  if (cassettes.length === 0) return;
  const couples = new Set(cassettes.map((c) => `${c.metadonnees.modeleDemande}→${c.metadonnees.modeleServi}`));
  const distincts = cassettes.filter((c) => c.metadonnees.modeleServi !== c.metadonnees.modeleDemande).length;
  console.log(
    traduire(dico, 'enregistrerIa.provenance', {
      couples: [...couples].join(', '),
      distincts,
      total: cassettes.length,
    }),
  );
  if (distincts === 0) {
    console.error(traduire(dico, 'enregistrerIa.provenanceSuspecte'));
  }
}

async function principal(): Promise<void> {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);

  const montant = new Intl.NumberFormat(config.langueConsole, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const options = lireOptions();
  if (options === null || (!options.tous && options.scenario === undefined)) {
    console.error(traduire(dico, 'enregistrerIa.usage'));
    process.exitCode = 2;
    return;
  }

  const dossierScenarios = depuisRacine(config.scenarios.dossier);
  const scenarios: Scenario[] = options.tous
    ? await chargerScenarios(dossierScenarios)
    : [await chargerScenario(dossierScenarios, options.scenario ?? '')];

  const { client, modele } = await creerClientIaBanc({
    regime: 'enregistrement',
    journaliser: (type, details) => {
      console.log(`  ${type} ${JSON.stringify(details ?? {})}`);
    },
  });
  console.log(traduire(dico, 'enregistrerIa.demarrage', { nombre: scenarios.length, modele, dossier: DOSSIER_CASSETTES }));

  const avant = new Set((await lireCassettes(DOSSIER_CASSETTES)).map((c) => c.cle));
  const scanner = await creerSujet(config.scan.sujetParDefaut, client);
  const scorecard = await executerBanc({ scenarios, scanner, config, dico, obtenirGabarit, journal: console.log });
  const cassettes = await lireCassettes(DOSSIER_CASSETTES);
  // La DÉPENSE de cette exécution est la somme des cassettes réellement
  // ÉCRITES, pas l'agrégat de la scorecard : dès qu'une clé existe déjà, le
  // scan la rejoue et se voit facturer le coût enregistré sans qu'un seul
  // appel ait lieu. Le même contexte étant partagé par la plupart des
  // scénarios, l'agrégat compte plusieurs fois une cassette payée une fois —
  // et il reste non nul quand ZÉRO cassette a été écrite. Un chiffre juste
  // sous une étiquette fausse est un diagnostic faux (APPRENTISSAGES n°6).
  const ecrites = cassettes.filter((cassette) => !avant.has(cassette.cle));
  const depense = ecrites.reduce((total, cassette) => total + cassette.metadonnees.coutApi, 0);

  // Chaque cassette est affichée avec ses métadonnées COMPLÈTES : c'est
  // l'estampille de provenance (version de prompt, modèle, coût). Un parc
  // qu'on ne peut pas relire n'est pas un parc, c'est un cache.
  for (const cassette of cassettes) {
    console.log(traduire(dico, 'enregistrerIa.cassette', { cle: cassette.cle, metadonnees: JSON.stringify(cassette.metadonnees) }));
  }
  rapporterProvenance(cassettes, dico);
  console.log(
    traduire(dico, 'enregistrerIa.termine', {
      ecrites: ecrites.length,
      total: cassettes.length,
      // Les deux montants sont formatés comme ceux de la scorecard : un coût
      // imprimé brut (`0.030350000000000002`) n'est pas un chiffre qu'on lit.
      depense: montant.format(depense),
      scenarios: scorecard.global.nbScenarios,
      coutRejeu: montant.format(scorecard.global.coutApi),
      nonMesures: scorecard.global.nbProfilsNonMesures,
    }),
  );
  // Un attendu de profil resté NON MESURÉ après un enregistrement signale que
  // l'appel n'a pas abouti (clé absente, tarif inconnu, refus) : la commande
  // le dit et sort en échec, plutôt que de laisser croire à un parc complet.
  if (scorecard.global.nbProfilsNonMesures > 0) {
    console.error(traduire(dico, 'enregistrerIa.incomplet'));
    process.exitCode = 1;
  }
}

await principal();
