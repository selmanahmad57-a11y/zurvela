import { describe, expect, it } from 'vitest';
import type { TentativeReexecution } from '../../types.js';
import { CONFIG_CONFIRMATION_TEST } from './fabriques-test.js';
import {
  MOTIF_JAMAIS_REPRODUITE,
  MOTIF_MESURE_SOUS_SEUIL,
  MOTIF_REJEU_IMPOSSIBLE,
  MOTIF_REPRODUCTION_PARTIELLE,
  MOTIF_REPRODUITE,
  agreger,
  estExploitable,
  juger,
} from './verdict.js';

const OPTIONS = { tauxRequis: CONFIG_CONFIRMATION_TEST.tauxReproduction, agregation: CONFIG_CONFIRMATION_TEST.agregationMesures };

function tentative(surcharges: Partial<TentativeReexecution> = {}): TentativeReexecution {
  return { numero: 1, viewport: 'desktop', reproduite: false, echecOutillage: false, dureeMs: 100, ...surcharges };
}

const reproduite = (mesureMs?: number): TentativeReexecution =>
  tentative({ reproduite: true, ...(mesureMs === undefined ? {} : { mesureMs }) });
const muette = (mesureMs?: number): TentativeReexecution =>
  tentative({ reproduite: false, ...(mesureMs === undefined ? {} : { mesureMs }) });
const enPanne = (): TentativeReexecution => tentative({ echecOutillage: true, causeEchec: 'outil', erreur: 'navigateur-perdu' });
const siteMuet = (): TentativeReexecution => tentative({ echecOutillage: true, causeEchec: 'reseau-site', erreur: 'page-inchargeable' });

describe('estExploitable', () => {
  it('exploite un rejeu réussi et un rejeu dont le SITE est la cause, jamais une panne d’outil ni un indéterminé', () => {
    expect(estExploitable(tentative())).toBe(true);
    expect(estExploitable(siteMuet())).toBe(true);
    expect(estExploitable(enPanne())).toBe(false);
    expect(estExploitable(tentative({ echecOutillage: true, causeEchec: 'indetermine' }))).toBe(false);
  });
});

describe('agreger', () => {
  it('médiane : valeur centrale d’un nombre impair, moyenne des deux centrales d’un nombre pair', () => {
    expect(agreger([5000, 1000, 3000], 'mediane')).toBe(3000);
    expect(agreger([1000, 3000], 'mediane')).toBe(2000);
    expect(agreger([4000], 'mediane')).toBe(4000);
  });

  it('moyenne et max', () => {
    expect(agreger([1000, 3000, 5000], 'moyenne')).toBe(3000);
    expect(agreger([1000, 3000, 5000], 'max')).toBe(5000);
  });

  it('sans mesure, aucun agrégat', () => {
    expect(agreger([], 'mediane')).toBeUndefined();
    expect(agreger([], 'max')).toBeUndefined();
  });
});

describe('juger', () => {
  it('2/2 : confirmee, motif reproduite, taux 1', () => {
    const jugement = juger([reproduite(), reproduite()], OPTIONS);
    expect(jugement).toEqual({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: 1 });
  });

  it('1/2 : intermittente et RETENUE — un bug sur deux requêtes est un bug', () => {
    const jugement = juger([reproduite(), muette()], OPTIONS);
    expect(jugement).toEqual({ verdict: 'intermittente', motif: MOTIF_REPRODUCTION_PARTIELLE, tauxReproduction: 0.5 });
  });

  it('0/2 : non-reproduite — le faux positif simulé est écarté', () => {
    const jugement = juger([muette(), muette()], OPTIONS);
    expect(jugement).toEqual({ verdict: 'non-reproduite', motif: MOTIF_JAMAIS_REPRODUITE, tauxReproduction: 0 });
  });

  it('aucune tentative exploitable : limite-automatisation, taux inconnu — jamais « non reproduite »', () => {
    const jugement = juger([enPanne(), enPanne()], OPTIONS);
    expect(jugement).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_REJEU_IMPOSSIBLE, tauxReproduction: null });
    // Aucune tentative du tout : même verdict, on ne conclut pas sans preuve.
    expect(juger([], OPTIONS).verdict).toBe('limite-automatisation');
  });

  it('un site qui ne répond plus reste une tentative EXPLOITABLE : le groupe est jugé, pas suspendu', () => {
    const jugement = juger([siteMuet(), siteMuet()], OPTIONS);
    expect(jugement.verdict).toBe('non-reproduite');
    expect(jugement.tauxReproduction).toBe(0);
  });

  it('les tentatives en panne d’outil ne comptent ni au numérateur ni au dénominateur', () => {
    const jugement = juger([reproduite(), enPanne()], OPTIONS);
    expect(jugement).toEqual({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: 1 });
  });

  it('détecteur gradué : la médiane sous le seuil ramène à non-reproduite, même reproduite 2/2', () => {
    const jugement = juger([reproduite(2000), reproduite(2500)], { ...OPTIONS, seuilMesure: 3000 });
    expect(jugement).toEqual({
      verdict: 'non-reproduite',
      motif: MOTIF_MESURE_SOUS_SEUIL,
      tauxReproduction: 1,
      mesureAgregee: 2250,
    });
  });

  it('détecteur gradué : une mesure EXACTEMENT au seuil ne confirme pas (le seuil est la dernière valeur acceptable)', () => {
    expect(juger([reproduite(3000)], { ...OPTIONS, seuilMesure: 3000 }).motif).toBe(MOTIF_MESURE_SOUS_SEUIL);
    expect(juger([reproduite(3001)], { ...OPTIONS, seuilMesure: 3000 }).motif).toBe(MOTIF_REPRODUITE);
  });

  it('détecteur gradué : au-dessus du seuil, la mesure est rendue mais ne change pas le verdict', () => {
    const jugement = juger([reproduite(9000), reproduite(5000)], { ...OPTIONS, seuilMesure: 3000 });
    expect(jugement).toEqual({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: 1, mesureAgregee: 7000 });
  });

  it('sans seuilMesure, la mesure agrégée est rendue sans jamais peser sur le verdict', () => {
    expect(juger([reproduite(10), reproduite(20)], OPTIONS)).toEqual({
      verdict: 'confirmee',
      motif: MOTIF_REPRODUITE,
      tauxReproduction: 1,
      mesureAgregee: 15,
    });
  });

  it('n’agrège que les mesures des tentatives exploitables', () => {
    const jugement = juger([reproduite(9000), { ...enPanne(), mesureMs: 1 }], { ...OPTIONS, seuilMesure: 3000 });
    expect(jugement.mesureAgregee).toBe(9000);
  });

  it('un taux requis plus bas confirme là où le taux par défaut dirait intermittente', () => {
    const jugement = juger([reproduite(), muette()], { ...OPTIONS, tauxRequis: 0.5 });
    expect(jugement.verdict).toBe('confirmee');
  });
});
