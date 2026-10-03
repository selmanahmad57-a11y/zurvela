/**
 * LE PALIER DE PERSISTANCE (cahier P2-6) — quatre faces, et deux d'entre
 * elles peuvent coûter du SIGNAL. Ce sont celles-là que ce fichier garde.
 */
import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate, TentativeReexecution } from '../../types.js';
import { palierPersistance, victimesDe } from './persistance.js';

function tentative(surcharges: Partial<TentativeReexecution> = {}): TentativeReexecution {
  return { numero: 1, viewport: 'desktop', reproduite: false, echecOutillage: false, dureeMs: 1000, ...surcharges };
}

const ORIGINE = ['#panier'];

describe('les quatre faces du palier', () => {
  it('la cause reparaît sur LA MÊME victime → défaut précis', () => {
    const palier = palierPersistance({
      victimesOrigine: ORIGINE,
      tentatives: [tentative({ reproduite: true, victimes: ['#panier'] }), tentative({ numero: 2, reproduite: true, victimes: ['#panier'] })],
      observationsMin: 2,
    });
    expect(palier).toBe('victime-stable');
  });

  it('la cause reparaît sur d’AUTRES victimes → phénomène, pas occurrence', () => {
    // `#aswift_4` est confirmée sur trois scans d'expandtesting SANS une
    // seule victime commune : le protocole confirmait l'emplacement, pas
    // le défaut.
    const palier = palierPersistance({
      victimesOrigine: ORIGINE,
      tentatives: [tentative({ reproduite: true, victimes: ['#recherche'] }), tentative({ numero: 2, reproduite: true, victimes: ['#menu'] })],
      observationsMin: 2,
    });
    expect(palier).toBe('victime-variable');
  });

  it('la cause ne reparaît PAS, et on a assez regardé → non persistant', () => {
    const palier = palierPersistance({
      victimesOrigine: ORIGINE,
      tentatives: [tentative(), tentative({ numero: 2 })],
      observationsMin: 2,
    });
    expect(palier).toBe('non-persistant');
  });

  it('LA QUATRIÈME FACE : pas assez de rejeux → on ne sait pas, donc on PUBLIE', () => {
    // LE SENS GRAVE, dans sa forme subtile. « Ne persiste pas » conclu sur
    // une seule observation serait le faux stable de P2-5 retourné : un
    // recouvrement vu une fois sur deux peut être
    // persistant-mais-intermittent.
    const palier = palierPersistance({ victimesOrigine: ORIGINE, tentatives: [tentative()], observationsMin: 2 });
    expect(palier).toBe('sous-observe');
  });
});

describe('ce qui ne doit JAMAIS faire taire', () => {
  it('un rejeu en ÉCHEC D’OUTILLAGE ne compte pas comme une observation', () => {
    // Deux tentatives dont une cassée : une seule observation exploitable,
    // donc on ne conclut pas — un échec de notre outillage ne prouve rien
    // sur le site (n°27, la taxonomie des échecs de rejeu).
    const palier = palierPersistance({
      victimesOrigine: ORIGINE,
      tentatives: [tentative(), tentative({ numero: 2, echecOutillage: true, causeEchec: 'outil' })],
      observationsMin: 2,
    });
    expect(palier).toBe('sous-observe');
  });

  it('UNE SEULE reproduction sur la même victime suffit : le doute ne descend pas le palier', () => {
    const palier = palierPersistance({
      victimesOrigine: ORIGINE,
      tentatives: [tentative({ reproduite: true, victimes: ['#panier'] }), tentative({ numero: 2 })],
      observationsMin: 2,
    });
    expect(palier).toBe('victime-stable');
  });

  it('aucune victime à l’origine : la question ne se pose pas, on ne décide rien', () => {
    // Une cause réseau ne désigne aucun élément. Trancher un palier ici
    // serait répondre à une question qu'on n'a pas posée (n°23).
    expect(palierPersistance({ victimesOrigine: [], tentatives: [tentative()], observationsMin: 2 })).toBe('sans-objet');
  });
});

describe('victimesDe — les éléments que les preuves désignent, sans connaître aucun détecteur', () => {
  function candidate(preuves: unknown[]): AnomalieCandidate {
    return { preuves } as unknown as AnomalieCandidate;
  }

  it('relève les sélecteurs des preuves, dédoublonnés et ordonnés', () => {
    const vues = victimesDe(candidate([{ element: { selecteur: '#b' } }, { element: { selecteur: '#a' } }, { element: { selecteur: '#b' } }]));
    expect(vues).toEqual(['#a', '#b']);
  });

  it('une preuve SANS élément n’invente pas de victime', () => {
    expect(victimesDe(candidate([{ urlRessource: 'https://x.invalid/a.js' }]))).toEqual([]);
  });
});
