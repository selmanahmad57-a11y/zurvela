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

/** Ce qui sépare la langue du SITE de celle du RAPPORT dans l'identifiant d'un scénario croisé. */
export const SEGMENT_RAPPORT = '-rapport-';

/** Suffixe d'identifiant des scénarios à interaction restreinte. */
export const SEGMENT_SANS_SOUMISSION = '-sans-soumission';

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

  // Un bug SEULEMENT EN COMBINAISON n'a pas de scénario seul : il n'y serait
  // jamais constatable. Mais il doit en avoir une — sinon il disparaîtrait du
  // banc sans que rien ne rougisse.
  for (const bug of gabarit.bugs.filter((candidat) => candidat.seulementEnCombinaison === true)) {
    if (!combinaisons.some((combinaison) => combinaison.includes(bug.id))) {
      throw new Error(`Bug ${bug.id} du gabarit ${gabarit.nom} : déclaré seulementEnCombinaison, mais aucune combinaison de la configuration ne le contient`);
    }
  }

  const jeuxDeBugs: string[][] = [
    [],
    ...gabarit.bugs.filter((bug) => bug.seulementEnCombinaison !== true).map((bug) => [bug.id]),
    ...combinaisons.map((combinaison) => [...combinaison]),
  ];

  // Le budget de pages du gabarit, recopié dans CHAQUE scénario qu'il produit.
  // Il voyage dans le fichier de scénario plutôt que d'être relu à la
  // notation : c'est lui qui rend vraies les atteintes attendues du gabarit,
  // et une contrainte qu'on ne peut pas relire dans le scénario noté serait
  // une mesure dont on ne saurait plus sous quelles conditions elle a été
  // prise.
  const contraintes = config.scenarios.contraintes[gabarit.nom];

  const scenarios: Scenario[] = config.langues.flatMap((langue) =>
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

  // Les scénarios CROISÉS, s'il y en a pour ce gabarit. Leur segment de
  // langue porte les DEUX langues (`en-rapport-fr`) : le format
  // `<gabarit>--<bugs>--<langue>` est respecté, le nom de fichier reste
  // lisible, et aucune grammaire d'identifiant ne change. `scenario.langue`,
  // lui, reste celle du SITE — c'est elle qui choisit les locales servies.
  //
  // LES DEUX SENS COMPTENT, et le second n'est pas une symétrie décorative.
  // Le sens dont la langue de rapport est celle du DÉFAUT de
  // `config/rapport.json` est incapable de distinguer un canal qui fonctionne
  // d'un canal MUET : un `OptionsScan.langueRapport` jamais transmis au moteur
  // produirait exactement le même rapport, et le contrôle passerait — la
  // mesure verte du comportement par défaut, étiquetée du nom de l'autre
  // (APPRENTISSAGES n°6). Seul le sens inverse le prouve.
  const croises = (config.scenarios.croises ?? [])
    .filter((croise) => croise.gabarit === gabarit.nom)
    .map((croise): Scenario => {
      for (const bugId of croise.bugsActifs) {
        if (!idsConnus.has(bugId)) {
          throw new Error(`Scénario croisé [${croise.bugsActifs.join(', ')}] : bug ${bugId} inconnu du gabarit ${gabarit.nom}`);
        }
      }
      if (croise.langue === croise.langueRapport) {
        throw new Error(
          `Scénario croisé du gabarit ${gabarit.nom} : la langue du site et celle du rapport sont identiques (${croise.langue}) — il ne croise rien`,
        );
      }
      return {
        id: construireIdScenario(
          gabarit.nom,
          croise.bugsActifs,
          `${croise.langue}${SEGMENT_RAPPORT}${croise.langueRapport}`,
          config.scenarios.jetonSain,
        ),
        gabarit: gabarit.nom,
        langue: croise.langue,
        bugsActifs: [...croise.bugsActifs],
        ...(contraintes === undefined ? {} : { contraintes: { ...contraintes } }),
        langueRapport: croise.langueRapport,
      };
    });
  scenarios.push(...croises);

  // INTERACTION RESTREINTE : le mode par défaut de la production, où le robot
  // regarde sans rien soumettre. Un mode jamais mesuré est un mode qu'on
  // découvre chez le premier client.
  const sansSoumission = (config.scenarios.sansSoumission ?? [])
    .filter((restreint) => restreint.gabarit === gabarit.nom)
    .map((restreint): Scenario => {
      for (const bugId of restreint.bugsActifs) {
        if (!idsConnus.has(bugId)) {
          throw new Error(`Scénario sans soumission [${restreint.bugsActifs.join(', ')}] : bug ${bugId} inconnu du gabarit ${gabarit.nom}`);
        }
      }
      // Un scénario d'interaction restreinte dont aucun bug n'exige la
      // soumission ne mesure rien : il serait identique à son jumeau ordinaire.
      const exigeants = restreint.bugsActifs.filter((bugId) => gabarit.bugs.find((bug) => bug.id === bugId)?.exigeSoumission === true);
      if (exigeants.length === 0) {
        throw new Error(
          `Scénario sans soumission du gabarit ${gabarit.nom} : aucun de ses bugs [${restreint.bugsActifs.join(', ')}] n'exige la soumission — il ne restreint rien`,
        );
      }
      return {
        id: construireIdScenario(gabarit.nom, restreint.bugsActifs, `${restreint.langue}${SEGMENT_SANS_SOUMISSION}`, config.scenarios.jetonSain),
        gabarit: gabarit.nom,
        langue: restreint.langue,
        bugsActifs: [...restreint.bugsActifs],
        contraintes: { ...(contraintes ?? {}), soumission: 'aucune' },
      };
    });
  scenarios.push(...sansSoumission);

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
