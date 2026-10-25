/**
 * TÉMOIN de SYNCHRO config/publication.json ↔ son schéma. `additionalProperties:
 * false` + `required` : un bloc ajouté au JSON sans le schéma (ou l'inverse)
 * rougit ici, pas seulement au chargement réel du serveur (non testé). Prouve
 * aussi que le PLANCHER de fenêtre webhook est bien IMPOSÉ par le schéma — une
 * fenêtre trop courte (sous l'horizon de retry Svix) est refusée à la validation,
 * pas seulement documentée (invariant rendu infranchissable, pas « détecté »).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chargerSchema, valider } from '../outils/schema.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lireConfig = (): Record<string, unknown> => JSON.parse(readFileSync(path.join(RACINE, 'config', 'publication.json'), 'utf8')) as Record<string, unknown>;
const lireSchema = () => chargerSchema(path.join(RACINE, 'config', 'publication.schema.json'));

describe('config/publication.json ↔ schéma', () => {
  it('la config RÉELLE valide contre son schéma (synchro json↔schéma)', async () => {
    const schema = await lireSchema();
    expect(() => valider(schema, lireConfig(), 'config/publication.json')).not.toThrow();
  });

  it('le PLANCHER de fenêtre webhook est imposé : une fenêtre sous l’horizon de retry Svix est REFUSÉE', async () => {
    const schema = await lireSchema();
    const data = lireConfig();
    const tropCourt = { ...data, webhook: { ...(data['webhook'] as Record<string, unknown>), fenetreMs: 1000 } };
    expect(() => valider(schema, tropCourt, 'test')).toThrow();
  });
});
