import { describe, expect, it } from 'vitest';
import { chargerSchema, valider } from '../outils/schema.js';
import type { Manifeste, Scenario } from '../types.js';
import { BUGS_FACTICES, gabaritFactice } from './factices.js';
import { FICHIER_SCHEMA_MANIFESTE, deriverManifeste } from './manifeste.js';

const gabarit = gabaritFactice();

function scenario(bugsActifs: string[], langue = 'fr'): Scenario {
  return { id: `gabarit-factice--${bugsActifs.join('-').toLowerCase() || 'sain'}--${langue}`, gabarit: gabarit.nom, langue, bugsActifs };
}

describe('deriverManifeste', () => {
  it('produit un manifeste vide pour un scénario sain', () => {
    expect(deriverManifeste(scenario([]), gabarit)).toEqual({
      scenarioId: 'gabarit-factice--sain--fr',
      gabarit: 'gabarit-factice',
      langue: 'fr',
      attendus: [],
    });
  });

  it('copie uniquement la partie déclarative de chaque bug, dans l’ordre des bugs actifs', () => {
    const manifeste = deriverManifeste(scenario(['M01', 'V01'], 'en'), gabarit);
    expect(manifeste.langue).toBe('en');
    expect(manifeste.attendus).toEqual([
      { bugId: 'M01', nom: 'bouton-masque-mobile', categorie: 'mobile', pages: ['/contact'], gravite: 'bloquant' },
      { bugId: 'V01', nom: 'image-cassee', categorie: 'visuel', pages: ['/', '/contact', '/confirmation'], gravite: 'mineur' },
    ]);
  });

  it('ne partage pas le tableau des pages avec le bug déclaré', () => {
    const manifeste = deriverManifeste(scenario(['V01']), gabarit);
    const bugV01 = BUGS_FACTICES.find((bug) => bug.id === 'V01');
    expect(manifeste.attendus[0]?.pages).not.toBe(bugV01?.pages);
  });

  it('ignore les hooks de transformation du bug', () => {
    const avecHook = gabaritFactice('gabarit-factice', [
      { ...BUGS_FACTICES[0]!, transformerHtml: (html) => html },
    ]);
    const manifeste = deriverManifeste(scenario(['F01']), avecHook);
    expect(Object.keys(manifeste.attendus[0] ?? {})).toEqual(['bugId', 'nom', 'categorie', 'pages', 'gravite']);
  });

  it('lève si un bug actif est inconnu du gabarit', () => {
    expect(() => deriverManifeste(scenario(['F01', 'X99']), gabarit)).toThrow(/X99/);
  });

  it('lève si le scénario vise un autre gabarit', () => {
    expect(() => deriverManifeste({ ...scenario([]), gabarit: 'autre' }, gabarit)).toThrow(/autre/);
  });

  it('respecte manifeste.schema.json', async () => {
    const schema = await chargerSchema(FICHIER_SCHEMA_MANIFESTE);
    for (const bugs of [[], ['F01'], ['F01', 'M01'], BUGS_FACTICES.map((bug) => bug.id)]) {
      const manifeste = deriverManifeste(scenario(bugs), gabarit);
      expect(valider<Manifeste>(schema, JSON.parse(JSON.stringify(manifeste)), 'manifeste')).toEqual(manifeste);
    }
    expect(() => valider<Manifeste>(schema, { scenarioId: 'x', gabarit: 'g', langue: 'fr' }, 'manifeste')).toThrow(/attendus/);
    expect(() =>
      valider<Manifeste>(schema, { ...deriverManifeste(scenario(['F01']), gabarit), attendus: [{ bugId: 'F01', nom: 'n', categorie: 'inconnue', pages: ['/'], gravite: 'mineur' }] }, 'manifeste'),
    ).toThrow(/categorie/);
  });
});
