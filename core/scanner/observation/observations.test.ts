/**
 * LE COMPTEUR D'OBSERVATIONS (cahier P2-6, contrat préalable).
 *
 * Ce qui s'éprouve ici est l'UNICITÉ des marques, parce que tout P2-6 en
 * dépend : deux chargements confondus sous une même marque feraient croire
 * à une persistance là où il n'y a qu'un seul regard.
 */
import { describe, expect, it } from 'vitest';
import { creerCompteurObservations } from './observations.js';

describe('creerCompteurObservations', () => {
  it('rend des marques TOUTES DIFFÉRENTES : deux chargements ne se confondent jamais', () => {
    const compteur = creerCompteurObservations();
    const marques = Array.from({ length: 50 }, () => compteur.ouvrir());
    expect(new Set(marques).size).toBe(50);
    expect(compteur.total()).toBe(50);
  });

  it('ne consulte NI horloge NI hasard : deux compteurs neufs rendent la même suite', () => {
    // Le banc compare des scorecards : une marque tirée au hasard ou
    // horodatée rendrait deux scans du même site incomparables.
    const un = creerCompteurObservations();
    const deux = creerCompteurObservations();
    expect([un.ouvrir(), un.ouvrir(), un.ouvrir()]).toEqual([deux.ouvrir(), deux.ouvrir(), deux.ouvrir()]);
  });

  it('un compteur neuf n’a rien ouvert', () => {
    expect(creerCompteurObservations().total()).toBe(0);
  });
});
