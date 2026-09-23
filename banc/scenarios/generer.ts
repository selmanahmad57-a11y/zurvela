/**
 * Génération des scénarios d'un gabarit (cahier des charges §5) : les
 * fichiers *.scenario.json sont produits ici, jamais dupliqués à la main.
 *
 * Pour chaque langue de la configuration : un scénario sain, puis un par
 * bug du gabarit (dans l'ordre de son registre), puis un par combinaison
 * déclarée dans la configuration. Ajouter un bug au gabarit suffit à
 * étendre la fournée (extensibilité, cahier §9.4).
 *
 * Exécuté directement (`pnpm banc:generer`), régénère les scénarios de
 * tous les gabarits du registre.
 */
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerDictionnaire, traduire } from '../../core/i18n.js';
import { chargerConfig } from '../config.js';
import { depuisRacine } from '../outils/racine.js';
import type { ConfigBanc, Gabarit, Scenario } from '../types.js';
import { construireIdScenario, idDepuisNomFichier, nomFichierScenario } from './identifiant.js';

export function genererScenarios(gabarit: Gabarit, config: ConfigBanc): Scenario[] {
  const idsConnus = new Set(gabarit.bugs.map((bug) => bug.id));
  // Les combinaisons sont déclarées PAR GABARIT : un gabarit absent n'en
  // reçoit aucune. Celles qui le nomment restent validées strictement — un
  // bug inconnu lève, il n'est jamais ignoré en silence (un scénario qui
  // disparaît sans le dire est une mesure qui s'éteint sans devenir rouge,
  // APPRENTISSAGES n°7).
  const combinaisons = config.scenarios.combinaisons[gabarit.nom] ?? [];
  for (const combinaison of combinaisons) {
    for (const bugId of combinaison) {
      if (!idsConnus.has(bugId)) {
        throw new Error(
          `Combinaison [${combinaison.join(', ')}] : bug ${bugId} inconnu du gabarit ${gabarit.nom}`,
        );
      }
    }
  }

  const jeuxDeBugs: string[][] = [
    [],
    ...gabarit.bugs.map((bug) => [bug.id]),
    ...combinaisons.map((combinaison) => [...combinaison]),
  ];

  // Le budget de pages du gabarit, recopié dans CHAQUE scénario qu'il produit.
  // Il voyage dans le fichier de scénario plutôt que d'être relu à la
  // notation : c'est lui qui rend vraies les atteintes attendues du gabarit,
  // et une contrainte qu'on ne peut pas relire dans le scénario noté serait
  // une mesure dont on ne saurait plus sous quelles conditions elle a été
  // prise.
  const contraintes = config.scenarios.contraintes[gabarit.nom];

  const scenarios = config.langues.flatMap((langue) =>
    jeuxDeBugs.map(
      (bugsActifs): Scenario => ({
        id: construireIdScenario(gabarit.nom, bugsActifs, langue, config.scenarios.jetonSain),
        gabarit: gabarit.nom,
        langue,
        bugsActifs,
        ...(contraintes === undefined ? {} : { contraintes: { ...contraintes } }),
      }),
    ),
  );

  // Deux combinaisons identiques dans la configuration donneraient deux fichiers de même nom.
  const idsVus = new Set<string>();
  for (const scenario of scenarios) {
    if (idsVus.has(scenario.id)) {
      throw new Error(`Identifiant de scénario généré en double : ${scenario.id}`);
    }
    idsVus.add(scenario.id);
  }
  return scenarios;
}

/**
 * Écrit chaque scénario dans `<dossier>/<id>.scenario.json` après avoir
 * supprimé tous les fichiers de scénario existants : ils sont générés, un
 * fichier orphelin serait un scénario fantôme noté par le banc.
 * Retourne les chemins écrits, dans l'ordre des scénarios.
 */
export async function ecrireScenarios(scenarios: Scenario[], dossier: string): Promise<string[]> {
  await mkdir(dossier, { recursive: true });
  const existants = (await readdir(dossier)).filter((nom) => idDepuisNomFichier(nom) !== null);
  await Promise.all(existants.map((nom) => unlink(path.join(dossier, nom))));

  const chemins: string[] = [];
  for (const scenario of scenarios) {
    const chemin = path.join(dossier, nomFichierScenario(scenario.id));
    await writeFile(chemin, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
    chemins.push(chemin);
  }
  return chemins;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
  // Le registre n'est nécessaire qu'en mode CLI : les fonctions exportées
  // restent importables (et testables) sans lui.
  const { gabarits }: { gabarits: Record<string, Gabarit> } = await import('../gabarits/index.js');
  const scenarios = Object.values(gabarits).flatMap((gabarit) => genererScenarios(gabarit, config));
  const dossier = depuisRacine(config.scenarios.dossier);
  const chemins = await ecrireScenarios(scenarios, dossier);
  console.log(traduire(dico, 'generer.termine', { nombre: chemins.length, dossier }));
}
