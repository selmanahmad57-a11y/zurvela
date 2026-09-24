/**
 * `exceptionsSandbox` : UNE VALEUR QUE RIEN N'EXÉCUTE, ET QUI LE DIT.
 *
 * L'apprentissage n°5 est né d'un identifiant de modèle faux qui a survécu
 * deux briques entières, protégé par un mode dégradé qui n'exécutait jamais la
 * valeur. `exceptionsSandbox` est aujourd'hui dans la même position : le
 * schéma la valide, `ConfigScanner` la type, et AUCUNE ligne ne la lit.
 *
 * Elle reste, et c'est délibéré — elle porte une décision de conception (quelles
 * catégories d'interdits un futur mode bac à sable lèvera). Mais une valeur
 * dormante silencieuse devient un jour une valeur qu'on croit active. Ce test
 * la déclare : tant qu'il passe, personne ne peut penser qu'elle protège quoi
 * que ce soit.
 *
 * Le jour où elle sera consommée, CE TEST ÉCHOUERA — et c'est son but. Il
 * faudra alors l'écrire à l'envers : éprouver ce qu'elle fait, et retirer la
 * dette correspondante (docs/DETTES.md n°16).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chargerActionsInterdites } from '../config.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOM = 'exceptionsSandbox';

/**
 * Les fichiers autorisés à NOMMER la valeur sans la consommer : celui qui la
 * type, et celui qui documente pourquoi elle dort.
 */
const DECLARATIONS = ['core/scanner/config.ts', 'core/scanner/exploration/filtre-actions.ts'];

async function fichiersSources(dossier: string): Promise<string[]> {
  const entrees = await readdir(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers = await Promise.all(
    entrees.map(async (entree) => {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) return fichiersSources(relatif);
      return entree.name.endsWith('.ts') && !entree.name.endsWith('.test.ts') ? [relatif] : [];
    }),
  );
  return fichiers.flat();
}

describe('exceptionsSandbox — dormante DÉCLARÉE', () => {
  it('le schéma la valide et la config la porte : elle existe bel et bien', async () => {
    const actions = await chargerActionsInterdites();
    expect(actions.exceptionsSandbox.length).toBeGreaterThan(0);
    // Et chaque catégorie citée doit exister dans les motifs : une exception
    // qui lèverait un interdit inexistant ne lèverait rien.
    for (const categorie of actions.exceptionsSandbox) {
      expect(Object.keys(actions.motifsTexte)).toContain(categorie);
    }
  });

  it('AUCUN code ne la consomme — et le jour où l’un le fera, ce test le dira', async () => {
    const fichiers = await fichiersSources('core');
    const consommateurs: string[] = [];
    for (const fichier of fichiers) {
      if (DECLARATIONS.includes(fichier)) continue;
      if ((await readFile(path.join(RACINE, fichier), 'utf8')).includes(NOM)) {
        consommateurs.push(fichier);
      }
    }
    expect(consommateurs).toEqual([]);
  });

  it('les deux fichiers qui la NOMMENT la nomment encore : pas de déclaration morte', async () => {
    for (const fichier of DECLARATIONS) {
      expect(await readFile(path.join(RACINE, fichier), 'utf8'), fichier).toContain(NOM);
    }
  });
});
