/**
 * Le pont, cas par cas — et la garde d'UNICITÉ.
 *
 * La table est unique ou elle n'est pas une table : le troisième bloc de ce
 * fichier parcourt le dépôt et vérifie qu'aucun autre module du scanner ou du
 * banc ne convertit un `AvisCause` en `VerdictConfirmation`. Une table dont
 * une copie vit ailleurs finit par diverger, et une divergence de traduction
 * est un diagnostic faux (APPRENTISSAGES n°6) : deux endroits du moteur
 * imputeraient la même cause différemment.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AvisCause } from '../../ia/index.js';
import { VERDICTS_RETENUS, type VerdictConfirmation } from '../../types.js';
import {
  confianceMinoree,
  MOTIF_DECOUVERTE_DIAGNOSTIC_SITE,
  MOTIF_DIAGNOSTIC_INDETERMINE,
  MOTIF_DIAGNOSTIC_OUTIL,
  MOTIF_DIAGNOSTIC_SITE_ECARTE,
  traduireAvis,
  VERDICT_DU_PONT,
} from './pont-vocabulaires.js';

const BORNES = { facteurConfianceDecouverte: 0.6 };
const AVIS: AvisCause[] = ['outil', 'site', 'indetermine'];

describe('traduireAvis — la table, ligne par ligne', () => {
  it('avis « outil » : limite d’automatisation, motif qui dit que l’avis l’a confirmée', () => {
    expect(traduireAvis('outil', BORNES)).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_DIAGNOSTIC_OUTIL });
  });

  it('avis « indetermine » : le silence DEMEURE, mais il est motivé — l’aveu est une réponse, pas une panne', () => {
    expect(traduireAvis('indetermine', BORNES)).toEqual({
      verdict: 'limite-automatisation',
      motif: MOTIF_DIAGNOSTIC_INDETERMINE,
    });
  });

  it('avis « site » : le groupe reste écarté ET une découverte est émise, confiance minorée', () => {
    expect(traduireAvis('site', BORNES)).toEqual({
      verdict: 'limite-automatisation',
      motif: MOTIF_DIAGNOSTIC_SITE_ECARTE,
      decouverte: { facteurConfiance: 0.6, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
    });
  });

  it('seul l’avis « site » émet une découverte : les deux autres ne publient rien', () => {
    expect(traduireAvis('outil', BORNES).decouverte).toBeUndefined();
    expect(traduireAvis('indetermine', BORNES).decouverte).toBeUndefined();
  });

  it('les trois motifs sont distincts : un motif partagé ferait lire trois causes comme une seule', () => {
    const motifs = AVIS.map((avis) => traduireAvis(avis, BORNES).motif);
    expect(new Set(motifs).size).toBe(AVIS.length);
  });
});

describe('INVARIANT — un avis ne promeut JAMAIS un verdict', () => {
  it('le codomaine de la table ne contient aucun verdict retenu, pour aucun avis', () => {
    for (const avis of AVIS) {
      const verdict: VerdictConfirmation = traduireAvis(avis, BORNES).verdict;
      expect(VERDICTS_RETENUS).not.toContain(verdict);
      expect(verdict).toBe(VERDICT_DU_PONT);
    }
  });

  it('la table ne reçoit pas le verdict brut : elle ne PEUT pas en dépendre', () => {
    // La signature est le contrat. Si un jour quelqu'un ajoute un paramètre
    // d'état, ce test tombe — et c'est exactement le moment où il faut se
    // demander si la table est encore une table.
    expect(traduireAvis.length).toBe(2);
  });
});

describe('confianceMinoree — aucune confiance ne monte, jamais', () => {
  it('applique le facteur de config', () => {
    expect(confianceMinoree(0.9, 0.6)).toBeCloseTo(0.54, 10);
  });

  it('un facteur supérieur à 1 ne remonte RIEN : la borne est un invariant du code, pas seulement du schéma', () => {
    // Le schéma interdit déjà `>= 1` (`exclusiveMaximum`). Un schéma est un
    // réglage vérifié au chargement ; l'invariant, lui, tient même si la
    // valeur arrive par un autre chemin — et c'est la seule garantie qui
    // compte quand la brique suivante branchera une autre source.
    expect(confianceMinoree(0.8, 2)).toBe(0.8);
    expect(confianceMinoree(0.8, 1)).toBe(0.8);
  });

  it('une confiance nulle reste nulle', () => {
    expect(confianceMinoree(0, 0.6)).toBe(0);
  });

  it('un facteur NÉGATIF ne publie pas une confiance négative : la borne basse vaut la haute', () => {
    // La jumelle basse du test précédent. Le schéma interdit déjà `<= 0`
    // (`exclusiveMinimum`), mais cette fonction est le seul producteur de
    // confiance du protocole qui ne passe pas par `calibrer()` — donc le seul
    // qui échappe au plancher déclaré dans `calibration.ts`. Une confiance
    // négative ressortirait telle quelle dans `decouvertes` et `retenues`.
    expect(confianceMinoree(0.8, -1)).toBe(0);
    expect(confianceMinoree(0.8, -0.5)).toBe(0);
  });

  it('la sortie reste dans [0, 1] pour tout facteur, y compris hostile', () => {
    for (const facteur of [-100, -1, -0.5, 0, 0.6, 1, 2, 100]) {
      const confiance = confianceMinoree(0.8, facteur);
      expect(confiance).toBeGreaterThanOrEqual(0);
      expect(confiance).toBeLessThanOrEqual(0.8);
    }
  });
});

// ---------------------------------------------------------------------------
// GARDE D'UNICITÉ — la table est le SEUL point de contact des deux vocabulaires
// ---------------------------------------------------------------------------

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Périmètre gardé : le côté CONSOMMATEUR du pont. `core/ia` DÉFINIT `AvisCause`, il ne le traduit pas. */
const DOSSIERS_GARDES = ['core/scanner', 'banc'];
/** Le seul module autorisé à connaître les deux vocabulaires à la fois. */
const TABLE = 'core/scanner/confirmation/pont-vocabulaires.ts';
const VERDICTS: VerdictConfirmation[] = [
  'confirmee',
  'intermittente',
  'non-reproduite',
  'limite-automatisation',
  'basse-confiance',
];

async function fichiersSources(dossier: string): Promise<string[]> {
  const entrees = await readdir(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers = await Promise.all(
    entrees.map(async (entree) => {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) {
        return fichiersSources(relatif);
      }
      return entree.name.endsWith('.ts') && !entree.name.endsWith('.test.ts') ? [relatif] : [];
    }),
  );
  return fichiers.flat();
}

describe('garde d’unicité du pont', () => {
  /**
   * Un fichier est SUSPECT s'il réunit les deux vocabulaires : un marqueur
   * d'`AvisCause` ET un marqueur de `VerdictConfirmation`. Nommer l'un des
   * deux seul est légitime — le corpus déclare des avis attendus, le verdict
   * vit partout dans le protocole. C'est leur RENCONTRE qui est une
   * traduction, et la traduction n'a qu'un domicile.
   *
   * `'site'` est le seul littéral exclusif d'`AvisCause` : `'outil'` et
   * `'indetermine'` appartiennent aussi à `CauseEchecRejeu`, que le protocole
   * lit légitimement partout.
   */
  function marqueursAvis(source: string): boolean {
    return source.includes('AvisCause') || source.includes("'site'");
  }
  function marqueursVerdict(source: string): boolean {
    return source.includes('VerdictConfirmation') || VERDICTS.some((verdict) => source.includes(`'${verdict}'`));
  }

  it('aucun module du scanner ou du banc ne réunit les deux vocabulaires, hors la table', async () => {
    const dossiers = await Promise.all(DOSSIERS_GARDES.map(fichiersSources));
    const coupables: string[] = [];
    for (const fichier of dossiers.flat()) {
      if (fichier === TABLE) {
        continue;
      }
      const source = await readFile(path.join(RACINE, fichier), 'utf8');
      if (marqueursAvis(source) && marqueursVerdict(source)) {
        coupables.push(fichier);
      }
    }
    expect(coupables).toEqual([]);
  });

  it('la garde a bien du grain à moudre : la table, elle, réunit les deux', async () => {
    // Sans ce contre-cas, la garde passerait aussi si ses deux détecteurs
    // ne détectaient plus rien du tout.
    const table = await readFile(path.join(RACINE, TABLE), 'utf8');
    expect(marqueursAvis(table) && marqueursVerdict(table)).toBe(true);
  });

  it('la garde sait accuser : un module fabriqué qui traduirait serait bien relevé', () => {
    // Si un compteur ne peut pas mentir, il faut que quelqu'un ait essayé de
    // le faire mentir (METHODE §2). Le faux coupable est construit ici, en
    // mémoire, plutôt que déposé sur le disque.
    const fauxModule = "const verdict = avis === 'site' ? 'confirmee' : 'limite-automatisation';";
    expect(marqueursAvis(fauxModule) && marqueursVerdict(fauxModule)).toBe(true);
  });

  it('un module qui ne nomme qu’UN vocabulaire n’est pas accusé', () => {
    expect(marqueursAvis("const attendu: AvisCause = 'indetermine';") && marqueursVerdict("const attendu: AvisCause = 'indetermine';")).toBe(false);
    expect(marqueursAvis("verdict === 'limite-automatisation'") && marqueursVerdict("verdict === 'limite-automatisation'")).toBe(false);
  });
});
