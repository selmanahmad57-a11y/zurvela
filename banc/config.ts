/**
 * Chargement de `config/banc.json`, validé par `config/banc.schema.json`.
 * Aucun seuil du banc ne vit ailleurs (constitution §2).
 */
import { readFile } from 'node:fs/promises';
import type { ConfigBanc } from './types.js';
import { depuisRacine } from './outils/racine.js';
import { chargerSchema, valider } from './outils/schema.js';

export const FICHIER_CONFIG = depuisRacine('config', 'banc.json');
export const FICHIER_SCHEMA_CONFIG = depuisRacine('config', 'banc.schema.json');

export async function chargerConfig(fichier: string = FICHIER_CONFIG): Promise<ConfigBanc> {
  const [schema, contenu] = await Promise.all([chargerSchema(FICHIER_SCHEMA_CONFIG), readFile(fichier, 'utf8')]);
  return valider<ConfigBanc>(schema, JSON.parse(contenu), 'config/banc.json');
}
