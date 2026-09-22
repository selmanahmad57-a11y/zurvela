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
      { bugId: 'M01', nom: 'bouton-masque-mobile', categorie: 'mobile', pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' },
      { bugId: 'V01', nom: 'image-cassee', categorie: 'visuel', pages: ['/', '/contact', '/confirmation'], gravite: 'mineur', verdictAttendu: 'confirmee' },
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
    expect(Object.keys(manifeste.attendus[0] ?? {})).toEqual(['bugId', 'nom', 'categorie', 'pages', 'gravite', 'verdictAttendu']);
  });

  it('dérive le verdict attendu : celui du bug, sinon confirmee', () => {
    // F01 et I01 sont tous deux à RETENIR (confirmee / intermittente) : même
    // catégorie et même page, mais même camp — le manifeste reste notable.
    expect(deriverManifeste(scenario(['F01', 'I01']), gabarit).attendus.map((attendu) => [attendu.bugId, attendu.verdictAttendu])).toEqual([
      ['F01', 'confirmee'],
      ['I01', 'intermittente'],
    ]);
    // T01 et L01 sont tous deux à ÉCARTER, dans deux catégories distinctes.
    expect(deriverManifeste(scenario(['T01', 'L01']), gabarit).attendus.map((attendu) => [attendu.bugId, attendu.verdictAttendu])).toEqual([
      ['T01', 'non-reproduite'],
      ['L01', 'non-reproduite'],
    ]);
  });

  it('D3 — refuse un manifeste AMBIGU : deux bugs de même catégorie et même page, de camps opposés', () => {
    // F01 (à retenir) et T01 (à écarter) sont tous deux `fonctionnel` sur
    // /contact : l'appariement structurel du correcteur ne peut pas les
    // distinguer, et le même groupe écarté se noterait « fausse alerte
    // évitée » ou « anomalie perdue » selon l'ordre des bugs actifs.
    expect(() => deriverManifeste(scenario(['F01', 'T01']), gabarit)).toThrow(/F01/);
    expect(() => deriverManifeste(scenario(['F01', 'T01']), gabarit)).toThrow(/T01/);
    // L'ordre inverse est refusé de la même façon, et pour les deux mêmes bugs.
    expect(() => deriverManifeste(scenario(['T01', 'F01']), gabarit)).toThrow(/T01.*F01|F01.*T01/);
    // R01 (performance, à retenir) et L01 (performance, à écarter) : même piège.
    expect(() => deriverManifeste(scenario(['R01', 'L01']), gabarit)).toThrow(/R01/);
  });

  it('D3 — n’interdit que l’ambiguïté RÉELLE : camps opposés + même catégorie + page partagée', () => {
    // Camps opposés mais catégories différentes : notable.
    expect(() => deriverManifeste(scenario(['F01', 'L01']), gabarit)).not.toThrow();
    // Même catégorie, camps opposés, pages disjointes : notable.
    const pagesDisjointes = gabaritFactice('gabarit-factice', [
      { ...BUGS_FACTICES[0]!, pages: ['/contact'] },
      { ...BUGS_FACTICES[6]!, pages: ['/confirmation'] },
    ]);
    expect(() => deriverManifeste(scenario(['F01', 'T01']), pagesDisjointes)).not.toThrow();
    // Même catégorie, même page, MÊME camp (F01 et F02, tous deux à retenir) : notable.
    expect(() => deriverManifeste(scenario(['F01', 'F02']), gabarit)).not.toThrow();
    // Le `/` final ne fabrique pas une fausse page distincte : c'est la même
    // normalisation que l'appariement qui décide.
    const slashFinal = gabaritFactice('gabarit-factice', [
      { ...BUGS_FACTICES[0]!, pages: ['/contact/'] },
      { ...BUGS_FACTICES[6]!, pages: ['/contact'] },
    ]);
    expect(() => deriverManifeste(scenario(['F01', 'T01']), slashFinal)).toThrow(/contact/);
  });

  it('lève si un bug actif est inconnu du gabarit', () => {
    expect(() => deriverManifeste(scenario(['F01', 'X99']), gabarit)).toThrow(/X99/);
  });

  it('lève si le scénario vise un autre gabarit', () => {
    expect(() => deriverManifeste({ ...scenario([]), gabarit: 'autre' }, gabarit)).toThrow(/autre/);
  });

  it('respecte manifeste.schema.json', async () => {
    const schema = await chargerSchema(FICHIER_SCHEMA_MANIFESTE);
    // Jeux NON ambigus (voir « manifeste ambigu » plus haut) : tous les bugs à
    // retenir d'un côté, tous ceux à écarter de l'autre.
    const aRetenir = ['F01', 'F02', 'R01', 'V01', 'M01', 'I01'];
    for (const bugs of [[], ['F01'], ['F01', 'M01'], aRetenir, ['T01', 'L01']]) {
      const manifeste = deriverManifeste(scenario(bugs), gabarit);
      expect(valider<Manifeste>(schema, JSON.parse(JSON.stringify(manifeste)), 'manifeste')).toEqual(manifeste);
    }
    expect(() => valider<Manifeste>(schema, { scenarioId: 'x', gabarit: 'g', langue: 'fr' }, 'manifeste')).toThrow(/attendus/);
    expect(() =>
      valider<Manifeste>(schema, { ...deriverManifeste(scenario(['F01']), gabarit), attendus: [{ bugId: 'F01', nom: 'n', categorie: 'inconnue', pages: ['/'], gravite: 'mineur', verdictAttendu: 'confirmee' }] }, 'manifeste'),
    ).toThrow(/categorie/);
    // Le verdict attendu est requis et énuméré : un manifeste d'avant la brique 3 ou un verdict inventé est refusé.
    const valide = JSON.parse(JSON.stringify(deriverManifeste(scenario(['T01']), gabarit))) as Manifeste;
    const attendu = valide.attendus[0]!;
    expect(() => valider<Manifeste>(schema, { ...valide, attendus: [{ ...attendu, verdictAttendu: 'douteuse' }] }, 'manifeste')).toThrow(/verdictAttendu/);
    const sansVerdict: Record<string, unknown> = { ...attendu };
    delete sansVerdict['verdictAttendu'];
    expect(() => valider<Manifeste>(schema, { ...valide, attendus: [sansVerdict] }, 'manifeste')).toThrow(/verdictAttendu/);
  });
});
