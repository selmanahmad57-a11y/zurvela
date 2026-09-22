/**
 * Lecture des fichiers *.scenario.json, validés contre scenario.schema.json.
 * Un fichier malformé ou incohérent lève : il fausserait un score.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { depuisRacine } from '../outils/racine.js';
import { chargerSchema, valider } from '../outils/schema.js';
import type { Scenario } from '../types.js';
import { idDepuisNomFichier, nomFichierScenario } from './identifiant.js';

export const FICHIER_SCHEMA_SCENARIO = depuisRacine('banc', 'schemas', 'scenario.schema.json');

/**
 * Scénario demandé sans fichier correspondant. Type distinct pour que les
 * commandes puissent l'afficher via les locales (banc.scenarioIntrouvable)
 * sans comparer un message d'erreur.
 */
export class ErreurScenarioIntrouvable extends Error {
  constructor(
    readonly id: string,
    readonly fichier: string,
  ) {
    super(`Scénario introuvable : ${id} (fichier attendu : ${fichier})`);
    this.name = 'ErreurScenarioIntrouvable';
  }
}

async function lireScenario(fichier: string, idAttendu: string): Promise<Scenario> {
  const schema = await chargerSchema(FICHIER_SCHEMA_SCENARIO);
  const contenu = await readFile(fichier, 'utf8');
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch (erreur) {
    throw new Error(`Fichier ${fichier} : JSON illisible (${(erreur as Error).message})`);
  }
  const scenario = valider<Scenario>(schema, brut, path.basename(fichier));
  if (scenario.id !== idAttendu) {
    throw new Error(
      `Fichier ${fichier} : l'identifiant « ${scenario.id} » ne correspond pas au nom du fichier (attendu : ${idAttendu})`,
    );
  }
  return scenario;
}

/** Tous les scénarios du dossier, triés par identifiant (ordre des unités de code, indépendant de la locale). */
export async function chargerScenarios(dossier: string): Promise<Scenario[]> {
  const noms = await readdir(dossier);
  const scenarios = await Promise.all(
    noms.flatMap((nom) => {
      const id = idDepuisNomFichier(nom);
      return id === null ? [] : [lireScenario(path.join(dossier, nom), id)];
    }),
  );
  return scenarios.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function chargerScenario(dossier: string, id: string): Promise<Scenario> {
  const fichier = path.join(dossier, nomFichierScenario(id));
  try {
    return await lireScenario(fichier, id);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ErreurScenarioIntrouvable(id, fichier);
    }
    throw erreur;
  }
}
