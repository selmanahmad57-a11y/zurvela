/**
 * LE STATUT ÉPISTÉMIQUE — la promesse la plus exposée du produit.
 *
 * Ce que ces tests éprouvent n'est pas une table, c'est une limite : qu'aucune
 * anomalie ne puisse obtenir un statut qui promet plus que ce que le protocole
 * a établi. Chaque cas est construit pour FAIRE TOMBER la limite, jamais pour
 * la confirmer.
 */
import { describe, expect, it } from 'vitest';
import { MOTIF_CONSTATEE_AU_REJEU } from '../scanner/confirmation/decouvertes.js';
import { MOTIF_DECOUVERTE_DIAGNOSTIC_SITE } from '../scanner/confirmation/pont-vocabulaires.js';
import type { VerdictConfirmation } from '../types.js';
import { anomalie, resultatGroupe, tentative } from './aide-tests.js';
import { STATUT_PAR_VERDICT, chiffresDe, statutDe } from './statuts.js';

describe('statutDe — l’ordre de lecture est une décision de sécurité', () => {
  it('une DÉCOUVERTE n’obtient jamais « confirmee », alors même qu’elle porte ce verdict', () => {
    // `anomalieDecouverte` pose `verdict: 'confirmee'` — correct pour le
    // protocole, qui veut dire « retenue » — sur une anomalie vue UNE FOIS et
    // jamais re-confirmée. C'est le piège central de la brique : un module qui
    // lirait le verdict d'abord publierait « constaté et re-vérifié » sur une
    // observation unique.
    const decouverte = anomalie('g1', { verdict: 'confirmee', motif: MOTIF_CONSTATEE_AU_REJEU });
    expect(statutDe(decouverte)).toBe('constatee-au-rejeu');
  });

  it('une découverte sur AVIS de diagnostic porte son statut propre, le plus fragile des quatre', () => {
    const surAvis = anomalie('g1', { verdict: 'confirmee', motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE });
    expect(statutDe(surAvis)).toBe('diagnostic-site');
  });

  it('une anomalie ordinaire porte le statut de son verdict', () => {
    expect(statutDe(anomalie('g1', { verdict: 'confirmee' }))).toBe('confirmee');
    expect(statutDe(anomalie('g1', { verdict: 'intermittente' }))).toBe('intermittente');
  });

  it('les verdicts NON retenus n’ont aucune formulation client : la table rend null', () => {
    // Elle rend `null` plutôt que d'inventer une phrase. Une anomalie qui les
    // porterait tout en figurant parmi les retenues est une incohérence du
    // protocole, et elle doit remonter — pas être publiée sous le statut du
    // voisin.
    const nonRetenus: VerdictConfirmation[] = ['non-reproduite', 'limite-automatisation', 'basse-confiance'];
    for (const verdict of nonRetenus) {
      expect(STATUT_PAR_VERDICT[verdict]).toBeNull();
      expect(statutDe(anomalie('g1', { verdict }))).toBeNull();
    }
  });

  it('une anomalie SANS verdict (protocole passe-plat) n’obtient aucun statut', () => {
    // Ne rien avoir vérifié n'autorise aucune des quatre formulations, et
    // surtout pas la première. Le passe-plat retient tout sans rien rejouer.
    const sansVerdict = { ...anomalie('g1'), verdict: undefined };
    expect(statutDe(sansVerdict)).toBeNull();
  });

  it('la table couvre les CINQ verdicts : un sixième casserait la compilation ici', () => {
    expect(Object.keys(STATUT_PAR_VERDICT).sort()).toEqual(
      ['basse-confiance', 'confirmee', 'intermittente', 'limite-automatisation', 'non-reproduite'].sort(),
    );
  });
});

describe('chiffresDe — ce qu’une formulation a le droit d’annoncer', () => {
  it('ne compte que les tentatives EXPLOITABLES : un rejeu que l’outil n’a pas su mener ne vérifie rien', () => {
    // Compter les échecs d'outillage gonflerait le nombre de vérifications
    // annoncé au client avec des vérifications qui n'ont pas eu lieu.
    const resultat = resultatGroupe('g1', [tentative(1, true), tentative(2, false, false), tentative(3, true)]);
    expect(chiffresDe(resultat)).toEqual({ nbVerifications: 2, nbReproductions: 2 });
  });

  it('un groupe sans aucune tentative rend zéro vérification, jamais une valeur par défaut flatteuse', () => {
    expect(chiffresDe(resultatGroupe('g1', []))).toEqual({ nbVerifications: 0, nbReproductions: 0 });
  });

  it('compte séparément les reproductions : une intermittente doit pouvoir dire X sur Y', () => {
    const resultat = resultatGroupe('g1', [tentative(1, true), tentative(2, false)], 'intermittente');
    expect(chiffresDe(resultat)).toEqual({ nbVerifications: 2, nbReproductions: 1 });
  });
});
