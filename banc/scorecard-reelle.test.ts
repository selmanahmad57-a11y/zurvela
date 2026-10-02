/**
 * LE PONT ENTRE LES JOURNAUX RÉELS ET L'ORACLE (cahier P2-4, clôture).
 *
 * Ce qui s'éprouve ici n'est pas « la commande tourne » — un adaptateur vert
 * parce qu'il n'a jamais été mis en défaut est le fantôme du gabarit sous
 * une cinquième forme. Ce qui s'éprouve, c'est qu'il FAIT ROUGIR l'oracle
 * quand une anomalie disparaît. L'instrument qui jugera le bilan de la
 * Phase 2 doit avoir montré qu'il sait dire non.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Rapport } from '../core/types.js';
import { comparerEmpreintes, identitesApparues, identitesPerdues } from './correcteur/empreinte.js';
import { SitesEnDouble, construire, identifiantDeSite, pseudoScenario } from './scorecard-reelle.js';

function journal(url: string, descriptions: readonly string[]): Rapport {
  return {
    url,
    dureeMs: 1000,
    coutApi: 0.1,
    journal: [],
    anomalies: descriptions.map((description) => ({
      description,
      categorie: 'fonctionnel',
      graviteEstimee: 'important',
      verdict: 'confirmee',
      motif: 'reproduite',
      groupe: `g-${description}`,
      localisations: [{ urlOuEtape: url, viewport: 'desktop' }],
      observations: [{ viewport: 'desktop' }],
    })),
    ecartees: [],
    rapportBusiness: {
      sections: descriptions.map((description) => ({
        categorie: 'fonctionnel',
        gravite: 'important',
        statut: 'confirmee',
        groupe: `g-${description}`,
      })),
      nbEcartes: 0,
      nbNonVerifies: 0,
      nbRecouvrementsEcartes: 0,
    },
  } as unknown as Rapport;
}

async function ecrire(rapports: readonly Rapport[]): Promise<string[]> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-reel-'));
  const chemins: string[] = [];
  for (const [index, rapport] of rapports.entries()) {
    const chemin = path.join(dossier, `${index}.journal.json`);
    await writeFile(chemin, JSON.stringify(rapport), 'utf8');
    chemins.push(chemin);
  }
  return chemins;
}

describe('l’adaptateur FAIT ROUGIR l’oracle — l’épreuve qui compte', () => {
  it('une anomalie retirée d’une copie : identité PERDUE, et son nombre est exact', async () => {
    const complet = journal('https://a.invalid/', ['clic-intercepte', 'ressource-404']);
    const ampute = journal('https://a.invalid/', ['ressource-404']);
    const [avant, apres] = await Promise.all([construire(await ecrire([complet])), construire(await ecrire([ampute]))]);
    const divergences = comparerEmpreintes(avant.scenarios, apres.scenarios);
    // L'anomalie, sa localisation et sa section : trois éléments d'identité.
    expect(identitesPerdues(divergences)).toBe(3);
    expect(identitesApparues(divergences)).toBe(0);
  });

  it('une anomalie AJOUTÉE : identité gagnée, et rien de perdu — le sens que l’oracle distingue', async () => {
    const avant = await construire(await ecrire([journal('https://a.invalid/', ['clic-intercepte'])]));
    const apres = await construire(await ecrire([journal('https://a.invalid/', ['clic-intercepte', 'ressource-404'])]));
    const divergences = comparerEmpreintes(avant.scenarios, apres.scenarios);
    expect(identitesPerdues(divergences)).toBe(0);
    expect(identitesApparues(divergences)).toBe(3);
  });

  it('deux journaux identiques ne divergent pas : l’adaptateur n’invente aucun écart', async () => {
    const chemins = await ecrire([journal('https://a.invalid/', ['clic-intercepte'])]);
    const a = await construire(chemins);
    const b = await construire(chemins);
    expect(comparerEmpreintes(a.scenarios, b.scenarios)).toEqual([]);
  });
});

describe('l’appariement des sites', () => {
  it('nomme un pseudo-scénario par l’HÔTE : deux moteurs écrivent dans deux dossiers, c’est le site qui apparie', () => {
    expect(identifiantDeSite(journal('https://exemple.invalid/chemin', []), 'repli')).toBe('exemple.invalid');
  });

  it('une URL illisible retombe sur le nom du fichier plutôt que de faire disparaître le site', () => {
    expect(identifiantDeSite(journal('pas-une-url', []), 'repli.json')).toBe('repli.json');
  });

  it('REFUSE deux journaux du même site : l’oracle apparierait l’un des deux au hasard', async () => {
    // L'erreur de manipulation la plus facile le soir du grand tableau :
    // glisser les deux moteurs dans la même scorecard. Un instrument qui
    // ment en silence sur une faute de frappe n'est pas un instrument.
    const chemins = await ecrire([journal('https://a.invalid/', ['x']), journal('https://a.invalid/', ['y'])]);
    await expect(construire(chemins)).rejects.toThrow(SitesEnDouble);
  });
});

describe('ce que le pseudo-scénario n’invente pas', () => {
  it('laisse VIDES les notations de banc : un site réel n’a pas de manifeste', () => {
    const scenario = pseudoScenario(journal('https://a.invalid/', ['x']), 'a.invalid');
    expect(scenario.attendus).toEqual([]);
    expect(scenario.profils).toEqual([]);
    expect(scenario.cibles).toEqual([]);
    expect(scenario.rapports).toEqual([]);
    expect(scenario.fauxPositifs).toEqual([]);
  });

  it('reporte le rapport business, sans quoi l’oracle ne verrait aucune section publiée', () => {
    const scenario = pseudoScenario(journal('https://a.invalid/', ['x']), 'a.invalid');
    expect(scenario.rapportBusiness?.sections).toHaveLength(1);
  });
});
