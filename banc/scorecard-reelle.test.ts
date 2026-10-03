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
import { SitesEnDouble, construire, identifiantDeSite, pagesVisitees, pseudoScenario, restreindreAuSocle } from './scorecard-reelle.js';

function journal(url: string, descriptions: readonly string[], pages: readonly string[] = [url]): Rapport {
  return {
    url,
    parcours: { pages: pages.map((page) => ({ url: page })), arret: 'complet' },
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
      localisations: [{ urlOuEtape: pages[descriptions.indexOf(description) % pages.length] ?? url, viewport: 'desktop' }],
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

describe('le SOCLE COMMUN — comparer sur ce que les deux moteurs ont vu (dette n°25)', () => {
  // ARBITRAGE DÉLÉGUÉ, 2026-10-02 : le nombre de pages explorées décrit
  // NOTRE scan, pas le site. Sur demoqa, la campagne voyait 16 pages (elle
  // explorait jusqu'à l'échéance et ne jugeait rien) et P2-4 en voit 8 (il
  // garde la réserve de confirmation et JUGE). Comparer leurs identités sur
  // des parcours différents mélangerait « ce que le moteur a changé » et
  // « ce qu'il n'a pas eu le temps de voir ».
  const P = ['https://a.invalid/1', 'https://a.invalid/2', 'https://a.invalid/3'];

  it('une anomalie HORS SOCLE ne compte pas comme perdue : c’est du périmètre, pas du signal', async () => {
    // Le moteur d'avant a vu trois pages et trouvé trois défauts ; le nôtre
    // n'a vu que les deux premières. Sans socle, l'oracle crierait à la
    // perte du troisième — alors qu'on ne l'a pas cherché.
    const avantChemins = await ecrire([journal('https://a.invalid/1', ['a', 'b', 'c'], P)]);
    const apresChemins = await ecrire([journal('https://a.invalid/1', ['a', 'b'], P.slice(0, 2))]);
    const avant = await construire(avantChemins, apresChemins);
    const apres = await construire(apresChemins, avantChemins);
    expect(identitesPerdues(comparerEmpreintes(avant.scenarios, apres.scenarios))).toBe(0);
  });

  it('DÉCLARE le périmètre laissé dehors : on nomme ce qu’on n’a pas comparé', async () => {
    const avantChemins = await ecrire([journal('https://a.invalid/1', ['a', 'b', 'c'], P)]);
    const apresChemins = await ecrire([journal('https://a.invalid/1', ['a', 'b'], P.slice(0, 2))]);
    const avant = await construire(avantChemins, apresChemins);
    expect(avant.perimetres).toEqual([{ site: 'a.invalid', communes: 2, horsSocle: [P[2]] }]);
  });

  it('DANS le socle, une anomalie perdue reste perdue : le socle n’excuse pas le signal', async () => {
    // LA MUTATION À TUER : restreindre trop, et le socle deviendrait une
    // amnistie. Les deux moteurs ont vu les deux mêmes pages ; une anomalie
    // qui disparaît là est une vraie perte.
    const avantChemins = await ecrire([journal('https://a.invalid/1', ['a', 'b'], P.slice(0, 2))]);
    const apresChemins = await ecrire([journal('https://a.invalid/1', ['a'], P.slice(0, 2))]);
    const avant = await construire(avantChemins, apresChemins);
    const apres = await construire(apresChemins, avantChemins);
    expect(identitesPerdues(comparerEmpreintes(avant.scenarios, apres.scenarios))).toBeGreaterThan(0);
  });

  it('sans socle fourni, rien n’est restreint : le comportement d’avant est préservé', async () => {
    const chemins = await ecrire([journal('https://a.invalid/1', ['a', 'b', 'c'], P)]);
    const sans = await construire(chemins);
    expect(sans.scenarios[0]?.rapport?.anomalies).toHaveLength(3);
    expect(sans.perimetres).toEqual([]);
  });

  it('la restriction garde l’anomalie et ne lui laisse QUE ses localisations du socle', () => {
    const r = journal('https://a.invalid/1', ['a'], P);
    const restreint = restreindreAuSocle(r, new Set([P[0] as string]));
    expect(restreint.anomalies).toHaveLength(1);
    expect(pagesVisitees(r).size).toBe(3);
  });
});
