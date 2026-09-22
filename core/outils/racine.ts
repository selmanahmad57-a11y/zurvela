import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du dépôt (dossier parent de `core/`), indépendante du dossier courant d'exécution. */
export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Chemin absolu construit depuis la racine du dépôt. */
export function depuisRacine(...segments: string[]): string {
  return path.join(RACINE, ...segments);
}
