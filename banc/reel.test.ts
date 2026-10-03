/**
 * `banc:reel` — les parties PURES de la validation réelle (cahier P2-1,
 * contrat 6) : la lecture des options, les mesures d'un rapport, le verdict
 * d'un cas. Le scan lui-même est payant et vivant ; il ne se teste pas ici.
 */
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { chargerDictionnaire, type Dictionnaire } from '../core/i18n.js';
import type { Rapport } from '../core/types.js';
import { chargerCas, creerRendu, juger, lireOptions, mesuresDe, type CasReel, type MesuresScan, type Rendu, cheminDossierDurable } from './reel.js';
import { depuisRacine } from './outils/racine.js';

let dico: Dictionnaire;
let rendu: Rendu;

async function preparer(): Promise<void> {
  dico = await chargerDictionnaire(depuisRacine('locales'), 'fr');
  rendu = creerRendu(dico, 'fr');
}

function cas(surcharges: Partial<CasReel> = {}): CasReel {
  return {
    id: 'site-test',
    url: 'https://site.invalid',
    role: 'defaut',
    fiche: '00',
    defaut: 'C-09',
    avant: { rejouabiliteGroupesPourcent: 0, candidates: 8, groupes: 5, retenues: 0, pages: 26, dureeMs: 170_000 },
    attendus: { rejouabiliteGroupesMinPourcent: 80, dureeMaxMs: 300_000, pagesMin: 12, candidatesMin: 4 },
    ...surcharges,
  };
}

function mesures(surcharges: Partial<MesuresScan> = {}): MesuresScan {
  return { dureeMs: 200_000, pages: 26, candidates: 8, retenues: 0, groupes: 5, groupesRejoues: 5, tauxGroupesPourcent: 100, arret: 'complet', coutApi: 0.01, tailleJournalOctets: 1024, decouvertes: 0, decouvertesAffirmees: 0,
  ecartements: 0, ...surcharges };
}

describe('lireOptions', () => {
  it('accepte plusieurs --site et PLUSIEURS --avant ; refuse un positionnel', () => {
    // Plusieurs moteurs d'avant dans la même session : le seul tableau
    // comparable quand les cibles sont vivantes (P2-2, D4).
    expect(lireOptions(['--site', 'a', '--site', 'b', '--avant', '../campagne', '--avant', '../p2-1'])).toEqual({ sites: ['a', 'b'], avant: ['../campagne', '../p2-1'] });
    expect(lireOptions(['--avant', '../un'])).toEqual({ sites: [], avant: ['../un'] });
    expect(lireOptions([])).toEqual({ sites: [], avant: [] });
    expect(lireOptions(['https://x.invalid'])).toBeNull();
  });
});

describe('mesuresDe — les mêmes chiffres que la fiche recopie', () => {
  it('lit durée, pages, candidates, retenues, rejouabilité par groupes et arrêt sur le rapport technique', () => {
    const rapport = {
      url: 'https://site.invalid',
      anomalies: [{}],
      coutApi: 0.05,
      dureeMs: 123_456,
      journal: [],
      parcours: { urlDepart: 'https://site.invalid', pages: [{}, {}, {}], actions: [], arret: 'limite-pages', enAttenteALArret: 0, pagesRestantesALArret: 0 },
      candidates: [{}, {}, {}, {}],
      ecartees: [],
      groupes: [
        { groupe: { membres: [{}, {}] }, tentatives: [{ echecOutillage: false }] },
        { groupe: { membres: [{}, {}] }, tentatives: [{ echecOutillage: true }] },
      ],
    } as unknown as Rapport;
    expect(mesuresDe(rapport, 2048)).toEqual({ dureeMs: 123_456, pages: 3, candidates: 4, retenues: 1, groupes: 2, groupesRejoues: 1, tauxGroupesPourcent: 50, arret: 'limite-pages', coutApi: 0.05, tailleJournalOctets: 2048, decouvertes: 0, decouvertesAffirmees: 0, ecartements: 0 });
  });

  it('sans candidate, le taux est null — rien à rejouer n’est pas zéro', () => {
    const rapport = { url: 'u', anomalies: [], coutApi: 0, dureeMs: 1, journal: [], candidates: [], ecartees: [], groupes: [] } as unknown as Rapport;
    expect(mesuresDe(rapport, 0).tauxGroupesPourcent).toBeNull();
    expect(mesuresDe(rapport, 0).arret).toBe('erreur');
  });
});

describe('mesuresDe — les découvertes, et celles publiées comme vérifiées (cahier P2-1, contrat 8)', () => {
  it('reconnaît une découverte à son verdict ou à son motif, et compte comme AFFIRMÉE celle du moteur d’avant', () => {
    const base = { url: 'u', coutApi: 0, dureeMs: 1, journal: [], candidates: [], ecartees: [], groupes: [] };
    const rapport = {
      ...base,
      anomalies: [
        { verdict: 'confirmee', motif: 'reproduite', graviteEstimee: 'bloquant' },
        // Moteur P2-1 : verdict de découverte, gravité bornée.
        { verdict: 'decouverte', motif: 'constatee-au-rejeu', graviteEstimee: 'important' },
        // Moteur d'avant : « confirmee » sur une découverte, gravité du détecteur.
        { verdict: 'confirmee', motif: 'constatee-au-rejeu', graviteEstimee: 'bloquant' },
        { verdict: 'confirmee', motif: 'diagnostic-site', graviteEstimee: 'mineur' },
      ],
    } as unknown as Rapport;
    expect(mesuresDe(rapport, 0)).toMatchObject({ retenues: 4, decouvertes: 3, decouvertesAffirmees: 2 });
  });
});

describe('juger — tenu, non tenu, ou déclaré', () => {
  it('non tenu dès qu’UNE découverte est publiée comme vérifiée — sur tout site, témoin compris (contrat 8)', async () => {
    await preparer();
    const verdict = juger(cas(), mesures({ decouvertes: 6, decouvertesAffirmees: 1 }), rendu);
    expect(verdict.statut).toBe('non-tenu');
    // Des découvertes honnêtes ne font rien perdre.
    expect(juger(cas(), mesures({ decouvertes: 6, decouvertesAffirmees: 0 }), rendu).statut).toBe('tenu');
  });

  it('tenu quand la rejouabilité atteint le seuil et la durée tient', async () => {
    await preparer();
    expect(juger(cas(), mesures(), rendu)).toEqual({ statut: 'tenu', temoinStable: null });
  });

  it('non tenu : sous le seuil de rejouabilité, ou au-delà de la durée — chaque raison est nommée', async () => {
    await preparer();
    const verdict = juger(cas(), mesures({ tauxGroupesPourcent: 40, groupesRejoues: 2, dureeMs: 320_000 }), rendu);
    expect(verdict.statut).toBe('non-tenu');
    if (verdict.statut === 'non-tenu') {
      expect(verdict.raisons).toHaveLength(2);
      // Les nombres suivent la langue console (constitution §2) : « 40 % », « 320 000 ».
      expect(verdict.raisons[0]).toMatch(/40\s%/u);
      expect(verdict.raisons[1]).toMatch(/320\s000/u);
    }
  });

  it('DÉCLARÉ, pas jugé, quand la structure a changé : moins de pages ou de candidates que le cas n’en attend', async () => {
    // Le fantôme de troisième espèce appliqué au réel : un site qui a changé
    // ne compare pas des pommes et des poires. Le contrôle qui peut échouer :
    // sans cette branche, 100 % de rejouabilité sur 1 candidate serait « tenu ».
    await preparer();
    const verdict = juger(cas(), mesures({ candidates: 1, groupes: 1, groupesRejoues: 1 }), rendu);
    expect(verdict).toMatchObject({ statut: 'declare', motif: 'structure-changee' });
    expect(juger(cas(), mesures({ pages: 3 }), rendu)).toMatchObject({ statut: 'declare', motif: 'structure-changee' });
  });

  it('un témoin doit rester où il était : s’il bouge, c’est le moteur ou le réseau, pas le site', async () => {
    await preparer();
    // La fiche du témoin dit 100 % ; son seuil de tenue est 80 %. À 80 %, le
    // seuil est tenu mais le témoin a bougé par rapport à sa fiche.
    const temoin = cas({ role: 'temoin', avant: { ...cas().avant, rejouabiliteGroupesPourcent: 100 }, attendus: { ...cas().attendus, rejouabiliteGroupesMinPourcent: 80 } });
    expect(juger(temoin, mesures(), rendu)).toEqual({ statut: 'tenu', temoinStable: true });
    const bouge = juger(temoin, mesures({ tauxGroupesPourcent: 80, groupesRejoues: 4 }), rendu);
    expect(bouge.statut).toBe('non-tenu');
    if (bouge.statut === 'non-tenu') {
      expect(bouge.raisons).toHaveLength(1);
      expect(bouge.raisons[0]).toMatch(/100\s%/u);
    }
    // Avec un « avant » mesuré dans la même session, c'est LUI la référence du
    // témoin, pas la fiche : à 80 % des deux côtés, rien n'a bougé.
    expect(juger(temoin, mesures({ tauxGroupesPourcent: 80, groupesRejoues: 4 }), rendu, mesures({ tauxGroupesPourcent: 80 }))).toEqual({ statut: 'tenu', temoinStable: true });
  });
});

describe('les cas de validation réelle du cahier P2-1', () => {
  it('les NEUF sites distincts de la campagne, défauts et témoins, tous en https, avec leurs attendus', async () => {
    const tous = await chargerCas();
    expect(tous.map((c) => c.id)).toEqual(['automationexercise', 'books', 'cutlybook', 'demoqa', 'expandtesting', 'getlumavo', 'quotes', 'the-internet', 'zurvela']);
    for (const c of tous) {
      expect(c.url.startsWith('https://')).toBe(true);
      expect(c.attendus.rejouabiliteGroupesMinPourcent).toBeGreaterThan(0);
      // L'échéance de production, sans tolérance : « scan.fin.dureeMs ne dépasse
      // jamais scan.timeoutMs » (contrat 2). Les marges de la config se prennent
      // AVANT l'échéance, jamais après.
      expect(c.attendus.dureeMaxMs).toBe(300_000);
    }
    expect(tous.filter((c) => c.role === 'temoin').map((c) => c.id)).toEqual(['getlumavo', 'quotes', 'the-internet', 'zurvela']);
    // Chaque défaut nomme l'entrée du carnet qu'il éprouve, et chaque cas sa fiche.
    expect(tous.filter((c) => c.role === 'defaut').map((c) => c.defaut).sort()).toEqual(['C-05', 'C-06', 'C-06', 'C-09', 'C-10']);
    expect(new Set(tous.map((c) => c.fiche)).size).toBe(tous.length);
  });

  it('« pnpm banc:reel » charge la clé comme les autres commandes de mesure', async () => {
    const paquet = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(paquet.scripts['banc:reel']).toContain('--env-file-if-exists=docs/.env.local');
    expect(paquet.scripts['banc:reel']).toContain('banc/reel.ts');
  });
});

describe('les raisons d’un verdict sont INTERPOLÉES, pas affichées brutes', () => {
  it('toute raison rendue contient ses valeurs, jamais un emplacement resté en place', () => {
    // LE DÉFAUT QUE LE RÉEL A MONTRÉ : une raison écrite avec `{nombre}` au
    // lieu de `{{nombre}}` traverse l'interpolation sans erreur et sort
    // telle quelle. Le verdict était juste, son libellé illisible — et un
    // rapport client au libellé cassé fait douter de tout le reste.
    const verdict = juger(
      cas({ attendus: { rejouabiliteGroupesMinPourcent: 0, dureeMaxMs: 10, pagesMin: 0, candidatesMin: 0, ecartementsMin: 3 } }),
      mesures({ dureeMs: 999_999, ecartements: 0, decouvertesAffirmees: 1 }),
      rendu,
    );
    expect(verdict.statut).toBe('non-tenu');
    const raisons = verdict.statut === 'non-tenu' ? verdict.raisons : [];
    expect(raisons.length).toBeGreaterThan(1);
    for (const raison of raisons) {
      expect(raison, raison).not.toMatch(/\{\{?[a-zA-Z]+\}?\}/);
    }
  });
});

describe('le journal du réel doit SURVIVRE (checklist n°34, case 1)', () => {
  it('écrit hors du dépôt ET hors des temporaires du système, dans un dossier horodaté', () => {
    // Le défaut trouvé à froid : les journaux partaient dans
    // `mkdtemp(tmpdir())`, 59 Mo pour un grand tableau, dans un dossier que
    // l'OS purge — alors que ce sont les runs les plus chers du projet et
    // que toute l'analyse se fait après coup, sur ces fichiers. Les perdre,
    // c'est payer deux fois. Le contrôle qui peut échouer : un retour aux
    // temporaires.
    const chemin = cheminDossierDurable('2026-10-02T09:15:30.123Z', '/maison');
    expect(chemin).toBe('/maison/.config/zurvela/reel/2026-10-02T09-15-30-123Z');
    expect(chemin).not.toContain(tmpdir());
    expect(chemin.startsWith('/maison/.config/zurvela/')).toBe(true);
  });

  it('deux runs ne se marchent pas dessus : l’horodatage sépare', () => {
    const a = cheminDossierDurable('2026-10-02T09:15:30.123Z', '/maison');
    const b = cheminDossierDurable('2026-10-02T09:15:31.000Z', '/maison');
    expect(a).not.toBe(b);
  });

  it('`--dossier` permet de choisir, et son absence ne laisse jamais le dossier indéfini', () => {
    expect(lireOptions(['--dossier', '/ailleurs'])?.dossier).toBe('/ailleurs');
    expect(lireOptions([])?.dossier).toBeUndefined();
  });
});

describe('un ratio SANS DÉNOMINATEUR est sans objet, ni tenu ni non tenu (dette n°23 levée)', () => {
  // ARBITRAGE DU PROPRIÉTAIRE, 2026-10-02. La règle a été DÉLÉGUÉE parce
  // que j'avais déjà vu les chiffres qu'elle fait basculer — trois sites
  // sortaient « non tenu » pour n'avoir rien à rejouer. Le raisonnement ne
  // dépend pas de ces chiffres : un ratio sans numérateur ni dénominateur
  // ne mesure rien, le noter en échec répond à une question jamais posée.
  const vide = { tauxGroupesPourcent: null, groupes: 0, groupesRejoues: 0 };

  it('aucun groupe à rejouer : TENU, et le dit — pas un vert qui masque, une mesure qui manque', () => {
    const verdict = juger(cas(), mesures(vide), rendu);
    expect(verdict).toEqual({ statut: 'tenu', temoinStable: null, rejouabiliteSansObjet: true });
  });

  it('un TÉMOIN sans dénominateur ne « bouge » pas : le ratio ne dit rien, dans aucun sens', () => {
    const temoin = cas({ role: 'temoin', avant: { ...cas().avant, rejouabiliteGroupesPourcent: 100 } });
    const verdict = juger(temoin, mesures(vide), rendu);
    expect(verdict.statut).toBe('tenu');
    expect((verdict as { temoinStable: boolean | null }).temoinStable).toBeNull();
  });

  it('LA RÈGLE N’EXCUSE QUE L’ABSENCE DE MESURE : un taux réellement bas reste NON TENU', () => {
    // Le contrôle qui peut échouer : étendre « sans objet » à zéro.
    // Rejouer 0 groupe sur 5 est un échec mesuré ; n'avoir aucun groupe est
    // une absence de mesure. Les deux ne se notent pas pareil.
    const verdict = juger(cas(), mesures({ tauxGroupesPourcent: 0, groupes: 5, groupesRejoues: 0 }), rendu);
    expect(verdict.statut).toBe('non-tenu');
  });

  it('LA GARDE : un moteur qui cesserait de détecter est DÉCLARÉ, jamais blanchi en « sans objet »', () => {
    // Sans cette garde, la règle serait un trou : tous les sites
    // deviendraient « sans objet » le jour où la détection s'effondre.
    // `candidatesMin` l'attrape en amont.
    const verdict = juger(cas(), mesures({ ...vide, candidates: 0 }), rendu);
    expect(verdict).toMatchObject({ statut: 'declare', motif: 'structure-changee' });
  });
});

