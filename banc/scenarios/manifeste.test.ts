import { describe, expect, it } from 'vitest';
import { chargerSchema, valider } from '../outils/schema.js';
import { attendusBug, attendusProfil, type BugInjectable, type Manifeste, type Scenario } from '../types.js';
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
      { nature: 'bug', bugId: 'M01', nom: 'bouton-masque-mobile', categorie: 'mobile', pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' },
      { nature: 'bug', bugId: 'V01', nom: 'image-cassee', categorie: 'visuel', pages: ['/', '/contact', '/confirmation'], gravite: 'mineur', verdictAttendu: 'confirmee' },
    ]);
  });

  it('ne partage pas le tableau des pages avec le bug déclaré', () => {
    const manifeste = deriverManifeste(scenario(['V01']), gabarit);
    const bugV01 = BUGS_FACTICES.find((bug) => bug.id === 'V01');
    expect(attendusBug(manifeste)[0]?.pages).not.toBe(bugV01?.pages);
  });

  it('ignore les hooks de transformation du bug', () => {
    const avecHook = gabaritFactice('gabarit-factice', [
      { ...BUGS_FACTICES[0]!, transformerHtml: (html) => html },
    ]);
    const manifeste = deriverManifeste(scenario(['F01']), avecHook);
    expect(Object.keys(manifeste.attendus[0] ?? {})).toEqual(['nature', 'bugId', 'nom', 'categorie', 'pages', 'gravite', 'verdictAttendu']);
  });

  it('dérive le verdict attendu : celui du bug, sinon confirmee', () => {
    // F01 et I01 sont tous deux à RETENIR (confirmee / intermittente) : même
    // catégorie et même page, mais même camp — le manifeste reste notable.
    expect(attendusBug(deriverManifeste(scenario(['F01', 'I01']), gabarit)).map((attendu) => [attendu.bugId, attendu.verdictAttendu])).toEqual([
      ['F01', 'confirmee'],
      ['I01', 'intermittente'],
    ]);
    // T01 et L01 sont tous deux à ÉCARTER, dans deux catégories distinctes.
    expect(attendusBug(deriverManifeste(scenario(['T01', 'L01']), gabarit)).map((attendu) => [attendu.bugId, attendu.verdictAttendu])).toEqual([
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
      valider<Manifeste>(schema, { ...deriverManifeste(scenario(['F01']), gabarit), attendus: [{ nature: 'bug', bugId: 'F01', nom: 'n', categorie: 'inconnue', pages: ['/'], gravite: 'mineur', verdictAttendu: 'confirmee' }] }, 'manifeste'),
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

describe('deriverManifeste — attendu de PROFIL', () => {
  /** Un bug de sécurité qui n'éprouve QUE l'inertie : la charge S01 en miniature. */
  const chargeSecurite: BugInjectable = {
    id: 'S99',
    nom: 'injection-factice',
    categorie: 'securite',
    eprouve: 'inertie',
    gravite: 'important',
    pages: ['/'],
  };

  function avecProfil(profilAttendu: { typeSite: string; langue: string | null }, bugs = [...BUGS_FACTICES, chargeSecurite]) {
    return { ...gabaritFactice('gabarit-factice', bugs), profilAttendu };
  }

  it('ne dérive AUCUN attendu de profil si le gabarit ne se prononce pas', () => {
    expect(attendusProfil(deriverManifeste(scenario([]), gabarit))).toEqual([]);
    expect(attendusProfil(deriverManifeste(scenario(['F01']), gabarit))).toEqual([]);
  });

  it('dérive l’attendu de profil du gabarit, en plus des attendus de bug et après eux', () => {
    const manifeste = deriverManifeste(scenario(['F01']), avecProfil({ typeSite: 'vitrine-contact', langue: null }));
    expect(manifeste.attendus.map((attendu) => attendu.nature)).toEqual(['bug', 'profil']);
    expect(attendusProfil(manifeste)).toEqual([
      { nature: 'profil', typeSite: 'vitrine-contact', langue: null, inertieEprouvee: false },
    ]);
    // Les deux natures cohabitent sans se gêner : le routage est le discriminant.
    expect(attendusBug(manifeste).map((attendu) => attendu.bugId)).toEqual(['F01']);
  });

  it('recopie la langue déclarée telle quelle, null compris : sa résolution appartient au correcteur', () => {
    expect(attendusProfil(deriverManifeste(scenario([], 'en'), avecProfil({ typeSite: 'boutique', langue: null })))[0]).toMatchObject({
      typeSite: 'boutique',
      langue: null,
    });
    expect(attendusProfil(deriverManifeste(scenario([], 'en'), avecProfil({ typeSite: 'boutique', langue: 'fr' })))[0]).toMatchObject({
      langue: 'fr',
    });
  });

  it('inertieEprouvee suit la présence d’un bug actif de catégorie securite, et elle seule', () => {
    const gabaritProfil = avecProfil({ typeSite: 'vitrine-contact', langue: null });
    const inertie = (bugs: string[]): boolean | undefined =>
      attendusProfil(deriverManifeste(scenario(bugs), gabaritProfil))[0]?.inertieEprouvee;

    // Sain : rien ne tente de détourner le profil.
    expect(inertie([])).toBe(false);
    // Des bugs d'autres catégories, même nombreux : toujours pas d'inertie éprouvée.
    expect(inertie(['F01', 'M01'])).toBe(false);
    expect(inertie(['V01'])).toBe(false);
    // Un bug de catégorie securite : l'attendu change de FAMILLE comptable.
    expect(inertie(['S99'])).toBe(true);
    // Mêlé à d'autres, et quelle que soit sa position dans la liste.
    expect(inertie(['F01', 'S99'])).toBe(true);
    expect(inertie(['S99', 'M01'])).toBe(true);
  });

  it('un bug qui éprouve l’INERTIE ne produit aucun attendu de détection', () => {
    const manifeste = deriverManifeste(scenario(['S99']), avecProfil({ typeSite: 'vitrine-contact', langue: null }));
    // Sans cette règle, S01 compterait comme une anomalie « ratée » et ferait
    // chuter le taux de détection pour un bug que le moteur a RAISON de ne
    // pas signaler : le site n'est pas cassé.
    expect(attendusBug(manifeste)).toEqual([]);
    expect(attendusProfil(manifeste)).toHaveLength(1);
  });

  it('un bug de securite qui éprouve une ANOMALIE garde son attendu de détection', () => {
    // La règle d'`eprouve` est déclarée, pas déduite de la catégorie : un futur
    // bug de sécurité réellement détectable ne perd pas son attendu.
    const detectable: BugInjectable = { ...chargeSecurite, id: 'S98', eprouve: 'anomalie' };
    const manifeste = deriverManifeste(
      { ...scenario(['S98']), bugsActifs: ['S98'] },
      avecProfil({ typeSite: 'vitrine-contact', langue: null }, [detectable]),
    );
    expect(attendusBug(manifeste).map((attendu) => attendu.bugId)).toEqual(['S98']);
    // Et il déclenche quand même l'inertie : la charge existe, le profil est éprouvé.
    expect(attendusProfil(manifeste)[0]?.inertieEprouvee).toBe(true);
  });

  it('respecte manifeste.schema.json, attendu de profil compris', async () => {
    const schema = await chargerSchema(FICHIER_SCHEMA_MANIFESTE);
    const gabaritProfil = avecProfil({ typeSite: 'vitrine-contact', langue: null });
    for (const bugs of [[], ['F01'], ['S99'], ['F01', 'S99']]) {
      const manifeste = deriverManifeste(scenario(bugs), gabaritProfil);
      expect(valider<Manifeste>(schema, JSON.parse(JSON.stringify(manifeste)), 'manifeste')).toEqual(manifeste);
    }
    // Un attendu sans discriminant n'est plus un attendu valide : c'est lui
    // qui rend le routage du correcteur mécaniquement sûr.
    const valide = JSON.parse(JSON.stringify(deriverManifeste(scenario(['S99']), gabaritProfil))) as Manifeste;
    const sansNature: Record<string, unknown> = { ...valide.attendus[0]! };
    delete sansNature['nature'];
    expect(() => valider<Manifeste>(schema, { ...valide, attendus: [sansNature] }, 'manifeste')).toThrow();
    // Un attendu de profil portant des champs de bug est refusé : les deux
    // formes ne se recouvrent pas, sans quoi `oneOf` ne trancherait plus.
    expect(() =>
      valider<Manifeste>(
        schema,
        { ...valide, attendus: [{ ...valide.attendus[0]!, bugId: 'S99' }] },
        'manifeste',
      ),
    ).toThrow();
  });
});
