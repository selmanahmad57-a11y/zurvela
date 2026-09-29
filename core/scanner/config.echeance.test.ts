/**
 * L'ÉCHÉANCE RÉPARTIE (cahier P2-1, contrat 2) : des fractions en config, un
 * invariant en code. Le schéma borne chaque nombre ; il ne sait pas les
 * additionner, et une répartition qui promet plus que l'échéance serait
 * acceptée au démarrage et ne se manifesterait qu'au premier scan
 * (APPRENTISSAGES n°5). La vérification LÈVE au chargement.
 */
import { describe, expect, it } from 'vitest';
import { echeancesDePhase } from './index.js';
import { chargerConfigScanner, verifierRepartitionEcheance } from './config.js';
import { FICHIERS_CONFIG } from '../../scripts/scan.js';

describe('verifierRepartitionEcheance — l’invariant est en code', () => {
  it('refuse une répartition dont la somme atteint ou dépasse 1, en nommant les trois parts', () => {
    // Le contrôle qui peut échouer : sans la garde, 0,6 + 0,3 + 0,1 = 1,0 passerait.
    expect(() => verifierRepartitionEcheance({ exploration: 0.6, confirmation: 0.3, redaction: 0.1 }, 'test')).toThrow(/somme/);
    expect(() => verifierRepartitionEcheance({ exploration: 0.7, confirmation: 0.5, redaction: 0.2 }, 'test')).toThrow(/1\.4/);
  });

  it('accepte une répartition qui laisse une marge', () => {
    expect(() => verifierRepartitionEcheance({ exploration: 0.5, confirmation: 0.35, redaction: 0.1 }, 'test')).not.toThrow();
    // 0,55 + 0,35 + 0,10 : la somme vaut 1, c'est refusé — l'échéance n'est pas un budget qu'on dépense au dernier milliseconde.
    expect(() => verifierRepartitionEcheance({ exploration: 0.55, confirmation: 0.35, redaction: 0.1 }, 'test')).toThrow(/somme/);
  });

  it('les deux configurations réelles se chargent, et portent la MÊME répartition : des fractions valent pour 300 s comme pour 60 s', async () => {
    const instrument = await chargerConfigScanner(FICHIERS_CONFIG.instrument);
    const production = await chargerConfigScanner(FICHIERS_CONFIG.production);
    expect(production.echeance.repartition).toEqual(instrument.echeance.repartition);
    const somme = production.echeance.repartition.exploration + production.echeance.repartition.confirmation + production.echeance.repartition.redaction;
    expect(somme).toBeLessThan(1);
  });
});

describe('echeancesDePhase — l’exploration a sa part, la confirmation sa réserve, la rédaction la sienne', () => {
  // 0,50 + 0,35 + 0,10 = 0,95 : la marge de 5 % absorbe les transitions de phase.
  const repartition = { exploration: 0.5, confirmation: 0.35, redaction: 0.1 };

  it('sur 300 s : exploration jusqu’à +150 s, confirmation jusqu’à +270 s, réserves de 105 s et 30 s', () => {
    const phases = echeancesDePhase(1_000, 300_000, repartition);
    expect(phases).toEqual({ exploration: 151_000, confirmation: 271_000, reserveConfirmationMs: 105_000, reserveRedactionMs: 30_000 });
  });

  it('sur 60 s (le banc) : les mêmes fractions donnent 30 s, 21 s et 6 s — c’est pourquoi ce sont des fractions', () => {
    const phases = echeancesDePhase(0, 60_000, repartition);
    expect(phases.exploration).toBe(30_000);
    expect(phases.reserveConfirmationMs).toBe(21_000);
    expect(phases.confirmation).toBe(54_000);
  });

  it('ce que l’exploration ne consomme pas revient aux phases suivantes : la confirmation finit à l’échéance moins la réserve de rédaction, jamais avant', () => {
    const phases = echeancesDePhase(0, 100_000, repartition);
    expect(phases.confirmation - phases.exploration).toBeGreaterThanOrEqual(phases.reserveConfirmationMs);
  });
});
