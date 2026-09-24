/**
 * `pnpm rapport:exemple` — produit un RAPPORT RÉEL, lisible, pour un scénario
 * donné.
 *
 * Cette commande n'est pas un outil de mesure : elle ne note rien, elle ne
 * publie aucun chiffre, elle n'ajoute aucune garde. Elle existe pour une seule
 * raison, et elle est bonne : la Phase 1 n'a pas d'interface, et un rapport
 * qu'on ne peut pas LIRE ne peut pas être jugé. Une scorecard dit qu'un
 * rapport est structurellement juste ; elle ne dit pas s'il est utile, sobre,
 * et digne d'être envoyé à quelqu'un. Cela se lit.
 *
 * Elle passe par le MÊME chemin que la notation (`noterScenario`) et par le
 * même client IA rejouable : ce qu'on lit ici est exactement ce que le banc a
 * mesuré, jamais une variante fabriquée pour la démonstration.
 *
 * Usage : pnpm rapport:exemple --scenario <id> [--politique deterministe|ia] [--sortie <fichier>] [--sans-ia]
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire } from '../core/i18n.js';
import { rendreRapport } from '../core/rapport/index.js';
import { chargerConfigScanner } from '../core/scanner/config.js';
import { chargerConfig } from './config.js';
import { noterScenario } from './correcteur/index.js';
import { chargerDetectionLangue } from './correcteur/langue-prose.js';
import { creerSujet } from './correcteur/sujets.js';
import { obtenirGabarit } from './gabarits/index.js';
import { creerClientIaBanc } from './ia.js';
import { depuisRacine } from './outils/racine.js';
import { chargerScenario } from './scenarios/charger.js';
import { estNomPolitique, POLITIQUES } from './types.js';

interface Options {
  scenario?: string;
  politique?: string;
  sortie?: string;
  sansIa: boolean;
}

function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({
      args,
      options: {
        scenario: { type: 'string' },
        politique: { type: 'string' },
        sortie: { type: 'string' },
        'sans-ia': { type: 'boolean' },
      },
      strict: true,
    });
    return {
      scenario: values.scenario,
      politique: values.politique,
      sortie: values.sortie,
      sansIa: values['sans-ia'] === true,
    };
  } catch {
    return null;
  }
}

async function principal(): Promise<void> {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);

  const options = lireOptions();
  if (options === null || options.scenario === undefined) {
    console.error(traduire(dico, 'rapportExemple.usage'));
    process.exitCode = 2;
    return;
  }

  const configScanner = await chargerConfigScanner();
  const politique = options.politique ?? configScanner.exploration.politique;
  if (!estNomPolitique(politique)) {
    console.error(traduire(dico, 'banc.politiqueInconnue', { politique, politiques: POLITIQUES.join(', ') }));
    process.exitCode = 2;
    return;
  }

  const scenario = await chargerScenario(depuisRacine(config.scenarios.dossier), options.scenario);
  // Le MÊME client que la notation : rejeu sur cassettes, aucun réseau. Ce
  // qu'on lit doit être ce que le banc a mesuré.
  const { client } = await creerClientIaBanc({ regime: options.sansIa ? 'sans-ia' : 'rejeu' });
  const sujet = await creerSujet(config.scan.sujetParDefaut, client, { politique });
  // `--sans-ia` DÉCLARE l'absence, exactement comme pour `pnpm banc` : sans ce
  // drapeau, le scénario passerait en erreur pour un profil non mesuré qu'on
  // a soi-même demandé de ne pas mesurer.
  const resultat = await noterScenario(scenario, {
    sujet,
    politique,
    config,
    dico,
    obtenirGabarit,
    iaDeclareeAbsente: options.sansIa || config.scan.sujetParDefaut !== 'reel',
    // Le rapport JOINT À LA LIVRAISON sort d'ici : il serait absurde qu'il soit
    // le seul à échapper au contrôle de la langue de sa prose.
    detectionLangue: await chargerDetectionLangue(),
  });

  const rapportBusiness = resultat.rapportBusiness;
  if (rapportBusiness === undefined) {
    console.error(traduire(dico, 'rapportExemple.absent', { scenario: scenario.id, erreur: resultat.erreur ?? '' }));
    process.exitCode = 1;
    return;
  }

  const texte = rendreRapport(rapportBusiness, { url: resultat.rapport?.url ?? '' });
  if (options.sortie === undefined) {
    console.log(texte);
  } else {
    await writeFile(options.sortie, texte, 'utf8');
    console.log(traduire(dico, 'rapportExemple.ecrit', { fichier: options.sortie }));
  }
  // Le STATUT du scénario est rappelé à part : un rapport magnifique produit
  // par un scan en erreur n'est pas un rapport, c'est une illusion.
  console.error(
    traduire(dico, 'rapportExemple.statut', {
      scenario: scenario.id,
      statut: resultat.statut,
      politique,
      langue: rapportBusiness.langue,
      sections: rapportBusiness.sections.length,
      sansProse: rapportBusiness.sansProse ? 'oui' : 'non',
    }),
  );
}

await principal();
