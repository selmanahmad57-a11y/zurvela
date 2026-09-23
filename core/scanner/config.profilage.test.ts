/**
 * TEST DE FORME de `config/profilage.json` — APPRENTISSAGES n°5.
 *
 * Le schéma disait « nombre dans ]0, 1] » là où sa propre description, le
 * cahier (§2) et le commentaire de `profilDepuisReponse` disent tous « < 1 ».
 * Avec un facteur de 1, le plafonnement après relance devenait un no-op
 * silencieux : un profil obtenu après une réponse jugée hors contrat sortait
 * avec sa confiance pleine, et l'invariant central de la brique — le doute ne
 * monte jamais la confiance — n'était plus protégé par rien.
 *
 * Aucun test existant ne pouvait le voir : ils multiplient tous par la valeur
 * de config elle-même, donc ils restaient verts avec un facteur de 1. La garde
 * s'éprouve en construisant le cas qui la déclenche (METHODE §2), pas en
 * relisant le schéma. Aucun appel réseau, aucun fichier laissé dans `config/`.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chargerConfigProfilage } from './config.js';

const reference = await chargerConfigProfilage();
const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-config-profilage-'));

afterAll(async () => {
  await rm(dossier, { recursive: true, force: true });
});

/** Écrit une variante de la config réelle et tente de la charger. */
async function charger(surcharges: Record<string, unknown>): Promise<unknown> {
  const fichier = path.join(dossier, `${Object.keys(surcharges).join('-')}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(fichier, JSON.stringify({ ...reference, ...surcharges }), 'utf8');
  return chargerConfigProfilage(fichier);
}

describe('config/profilage.json — les bornes que le schéma doit tenir', () => {
  it('accepte la config du dépôt, telle qu’elle est livrée', async () => {
    await expect(charger({})).resolves.toMatchObject({ typesSite: reference.typesSite });
  });

  it('REFUSE un facteur de confiance après relance de 1 : un plafond qui ne plafonne pas', async () => {
    await expect(charger({ facteurConfianceApresRelance: 1 })).rejects.toThrow();
  });

  it('refuse aussi un facteur nul ou supérieur à 1, et accepte l’intervalle ouvert', async () => {
    await expect(charger({ facteurConfianceApresRelance: 0 })).rejects.toThrow();
    await expect(charger({ facteurConfianceApresRelance: 1.2 })).rejects.toThrow();
    await expect(charger({ facteurConfianceApresRelance: 0.99 })).resolves.toMatchObject({
      facteurConfianceApresRelance: 0.99,
    });
  });

  it('refuse un plafond d’en-tête absent ou nul : sans lui, une seule métadonnée évince le site', async () => {
    const sansPlafond: Record<string, unknown> = { ...reference };
    delete sansPlafond['enTeteMaxChars'];
    const fichier = path.join(dossier, 'sans-plafond.json');
    await writeFile(fichier, JSON.stringify(sansPlafond), 'utf8');
    await expect(chargerConfigProfilage(fichier)).rejects.toThrow();
    await expect(charger({ enTeteMaxChars: 0 })).rejects.toThrow();
  });
});
