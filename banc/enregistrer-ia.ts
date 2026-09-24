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
 * Usage : pnpm banc:enregistrer-ia [--politique deterministe|ia] --scenario <id> | --tous
 *
 * La POLITIQUE compte ici autant que le scénario : les cassettes de décision
 * n'existent que sous la politique IA, puisque la politique déterministe
 * n'appelle aucun modèle. Un parc enregistré en déterministe serait donc
 * complet pour le profilage et vide pour la navigation — et le rejeu en
 * politique IA échouerait, cassette absente, sur la première décision.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../core/i18n.js';
import type { Cassette } from '../core/ia/index.js';
import { chargerConfigScanner } from '../core/scanner/config.js';
import { chargerConfig } from './config.js';
import { chargerDetectionLangue } from './correcteur/langue-prose.js';
import { executerBanc } from './correcteur/index.js';
import { creerSujet } from './correcteur/sujets.js';
import { obtenirGabarit } from './gabarits/index.js';
import { creerClientIaBanc, DOSSIER_CASSETTES } from './ia.js';
import { depuisRacine } from './outils/racine.js';
import { chargerScenario, chargerScenarios } from './scenarios/charger.js';
import { estNomPolitique, POLITIQUES, type Scenario } from './types.js';

interface Options {
  scenario?: string;
  tous: boolean;
  politique?: string;
}

function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({
      args,
      options: { scenario: { type: 'string' }, tous: { type: 'boolean' }, politique: { type: 'string' } },
      strict: true,
    });
    return { scenario: values.scenario, tous: values.tous === true, politique: values.politique };
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

  const configScanner = await chargerConfigScanner();
  const politique = options.politique ?? configScanner.exploration.politique;
  if (!estNomPolitique(politique)) {
    console.error(traduire(dico, 'banc.politiqueInconnue', { politique, politiques: POLITIQUES.join(', ') }));
    process.exitCode = 2;
    return;
  }

  const { client, modele } = await creerClientIaBanc({
    regime: 'enregistrement',
    journaliser: (type, details) => {
      console.log(`  ${type} ${JSON.stringify(details ?? {})}`);
    },
  });
  // UN ENREGISTREMENT SANS CAPACITÉ N'ENREGISTRE RIEN, et le dire APRÈS coup
  // serait le dire trop tard : sans clé ou sans tarif, le scan bascule en
  // déterministe d'emblée, aucune décision n'est prise, aucune cassette n'est
  // écrite — et les cassettes de profil déjà présentes, elles, se rejouent.
  // La commande annonçait donc « APPELS RÉELS au modèle » et sortait en 0 sur
  // un parc vide de décisions. La cause est NOMMÉE (clé absente, tarif absent,
  // fonction non implémentée) plutôt que devinée : une garde qui accuse le
  // mauvais coupable est pire qu'une garde absente (APPRENTISSAGES n°6).
  if (client.mode === 'degrade') {
    console.error(traduire(dico, 'enregistrerIa.sansCapacite', { raison: client.raisonDegrade ?? '' }));
    process.exitCode = 1;
    return;
  }
  console.log(traduire(dico, 'enregistrerIa.demarrage', { nombre: scenarios.length, modele, dossier: DOSSIER_CASSETTES }));

  const avant = new Set((await lireCassettes(DOSSIER_CASSETTES)).map((c) => c.cle));
  const sujet = await creerSujet(config.scan.sujetParDefaut, client, { politique });
  // La table de détection de langue est chargée ICI AUSSI, et ce n'est pas une
  // redite : c'est la SEULE exécution où le modèle écrit réellement la prose.
  // Quand le paramètre était optionnel, ce chemin ne le passait pas, et le
  // contrôle de la langue de la prose y était donc inexistant — absent au seul
  // endroit où il y avait quelque chose à contrôler.
  const detectionLangue = await chargerDetectionLangue();
  const scorecard = await executerBanc({ scenarios, sujet, politique, config, dico, obtenirGabarit, detectionLangue, journal: console.log });
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
  // ---------------------------------------------------------------------
  // GARDE DE COMPLÉTUDE — trois causes, trois diagnostics distincts
  // ---------------------------------------------------------------------
  // La garde de la brique 4a ne regardait que les attendus de PROFIL. Le parc
  // a depuis triplé de nature : les décisions de navigation en forment
  // l'essentiel, et rien ne les couvrait. Ce qui est vérifié ici l'est à
  // travers la scorecard, c'est-à-dire par le même chemin que la notation —
  // une garde qui lirait ailleurs garderait autre chose (APPRENTISSAGES n°4).
  //
  // Le COMPTE de cassettes attendu n'est volontairement PAS une des
  // conditions : il n'a aucune source de vérité. Le nombre de points de
  // décision d'un scan n'est connu qu'après l'avoir fait, et il vaut zéro
  // quand le scan bascule en déterministe. Le prédire supposerait de simuler
  // le parcours dans le banc — un oracle nouveau, et un oracle qu'on ne peut
  // pas éprouver ment tôt ou tard.
  const nonAppliquee = scorecard.scenarios.filter(
    (scenario) => scenario.politiqueAppliquee !== undefined && scenario.politiqueAppliquee !== politique,
  );
  if (scorecard.global.nbProfilsNonMesures > 0) {
    console.error(traduire(dico, 'enregistrerIa.incomplet'));
    process.exitCode = 1;
  }
  if (nonAppliquee.length > 0) {
    console.error(
      traduire(dico, 'enregistrerIa.politiqueNonAppliquee', {
        demandee: politique,
        scenarios: nonAppliquee.map((scenario) => `${scenario.scenarioId} (${scenario.politiqueAppliquee ?? ''})`).join(', '),
      }),
    );
    process.exitCode = 1;
  }
  // LE PARC DE RÉDACTION. Un rapport publié SANS PROSE alors qu'il avait des
  // sections à écrire est une cassette de rédaction manquante ou refusée — et
  // la scorecard le compterait « 100 % de rapports conformes » en toute
  // sincérité, puisque la structure, elle, est juste. C'est exactement l'angle
  // mort de l'apprentissage n°4 : une mesure devenue aveugle doit le DIRE.
  //
  // Les rapports SANS SECTION en sont exclus : un site sain n'a rien à faire
  // rédiger, et aucune cassette ne lui manque.
  const rapportsAEcrire = scorecard.scenarios
    .flatMap((scenario) => scenario.rapports)
    .filter((resultat) => !resultat.nonMesure && resultat.nbSections > 0);
  const sansProse = rapportsAEcrire.filter((resultat) => resultat.sansProse);
  if (sansProse.length > 0) {
    console.error(
      traduire(dico, 'enregistrerIa.redactionIncomplete', {
        sansProse: sansProse.length,
        total: rapportsAEcrire.length,
      }),
    );
    process.exitCode = 1;
  }

  if (scorecard.global.nbErreurs > 0) {
    console.error(
      traduire(dico, 'enregistrerIa.scenariosEnErreur', {
        nombre: scorecard.global.nbErreurs,
        scenarios: scorecard.scenarios
          .filter((scenario) => scenario.statut === 'erreur')
          .map((scenario) => `${scenario.scenarioId} (${scenario.erreur ?? ''})`)
          .join(', '),
      }),
    );
    process.exitCode = 1;
  }
}

await principal();
