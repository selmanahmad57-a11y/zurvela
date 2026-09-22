import { describe, expect, it } from 'vitest';
import type { ContreEpreuve, VerdictConfirmation } from '../../types.js';
import { CONFIG_CONFIRMATION_TEST } from './fabriques-test.js';
import { MOTIF_SOUS_SEUIL_RETENUE, calculerConfiance, calibrer } from './calibration.js';

const CONFIG = CONFIG_CONFIRMATION_TEST;
const FACTEURS = CONFIG.calibration;

function entree(surcharges: Partial<Parameters<typeof calculerConfiance>[0]> = {}) {
  return {
    confianceInitiale: 0.8,
    verdict: 'confirmee' as VerdictConfirmation,
    motif: 'reproduite',
    tauxReproduction: 1,
    ...surcharges,
  };
}

const contreEpreuve = (surcharges: Partial<ContreEpreuve> = {}): ContreEpreuve => ({
  viewport: 'desktop',
  reproduite: false,
  echecOutillage: false,
  attendue: true,
  ...surcharges,
});

describe('calculerConfiance', () => {
  it('facteur de verdict : confirmee renforce, intermittente dégrade, les autres verdicts sont neutres', () => {
    expect(calculerConfiance(entree(), FACTEURS)).toBeCloseTo(0.8 * FACTEURS.facteurVerdict.confirmee, 10);
    expect(calculerConfiance(entree({ verdict: 'intermittente', tauxReproduction: 1 }), FACTEURS)).toBeCloseTo(
      0.8 * FACTEURS.facteurVerdict.intermittente,
      10,
    );
    expect(calculerConfiance(entree({ verdict: 'non-reproduite', tauxReproduction: 1 }), FACTEURS)).toBeCloseTo(0.8, 10);
    expect(calculerConfiance(entree({ verdict: 'limite-automatisation', tauxReproduction: 1 }), FACTEURS)).toBeCloseTo(0.8, 10);
  });

  it('facteur de taux : un taux de 1 est neutre, un taux partiel pèse selon poidsTauxReproduction', () => {
    const partielle = calculerConfiance(entree({ verdict: 'intermittente', tauxReproduction: 0.5 }), FACTEURS);
    expect(partielle).toBeCloseTo(0.8 * FACTEURS.facteurVerdict.intermittente * (1 + FACTEURS.poidsTauxReproduction * -0.5), 10);
  });

  it('facteur de taux : un taux inconnu (aucune tentative exploitable) est neutre', () => {
    expect(calculerConfiance(entree({ verdict: 'limite-automatisation', tauxReproduction: null }), FACTEURS)).toBeCloseTo(0.8, 10);
  });

  it('contre-épreuve attendue : bonus ; symétrie inattendue : malus ; absente ou en échec : neutre', () => {
    const base = 0.8 * FACTEURS.facteurVerdict.confirmee;
    expect(calculerConfiance(entree({ contreEpreuve: contreEpreuve() }), FACTEURS)).toBeCloseTo(base * (1 + FACTEURS.bonusContreEpreuve), 10);
    expect(calculerConfiance(entree({ contreEpreuve: contreEpreuve({ reproduite: true, attendue: false }) }), FACTEURS)).toBeCloseTo(
      base * (1 - FACTEURS.malusSymetrieInattendue),
      10,
    );
    expect(calculerConfiance(entree(), FACTEURS)).toBeCloseTo(base, 10);
    // Une contre-épreuve qui n'a pas pu s'exécuter n'apprend rien : ni bonus ni malus.
    expect(
      calculerConfiance(entree({ contreEpreuve: contreEpreuve({ echecOutillage: true, attendue: false }) }), FACTEURS),
    ).toBeCloseTo(base, 10);
  });

  it('borne par le plafond et par le plancher de la config', () => {
    expect(calculerConfiance(entree({ confianceInitiale: 1 }), FACTEURS)).toBe(FACTEURS.confianceMax);
    expect(calculerConfiance(entree({ confianceInitiale: 0 }), FACTEURS)).toBe(FACTEURS.confianceMin);
  });

  it('une confiance reste dans [0, 1] même si la config est fautive : c’est un INVARIANT, pas un réglage', () => {
    const fautive = { ...FACTEURS, confianceMax: 5, confianceMin: -3, facteurVerdict: { confirmee: 100, intermittente: 0 } };
    expect(calculerConfiance(entree({ confianceInitiale: 0.9 }), fautive)).toBe(1);
    expect(calculerConfiance(entree({ confianceInitiale: 0.9, verdict: 'intermittente' }), fautive)).toBe(0);
  });
});

describe('calibrer', () => {
  it('laisse le verdict et le motif intacts quand la confiance finale tient le seuil de retenue', () => {
    const sortie = calibrer(entree(), CONFIG);
    expect(sortie.verdict).toBe('confirmee');
    expect(sortie.motif).toBe('reproduite');
    expect(sortie.confianceFinale).toBeGreaterThanOrEqual(CONFIG.seuilRetenue);
  });

  it('rétrograde en basse-confiance une RETENUE passée sous seuilRetenue : le dernier filet avant la fausse alerte', () => {
    const sortie = calibrer(entree({ confianceInitiale: 0.5, verdict: 'intermittente', tauxReproduction: 0.5 }), CONFIG);
    expect(sortie.confianceFinale).toBeLessThan(CONFIG.seuilRetenue);
    expect(sortie.verdict).toBe('basse-confiance');
    expect(sortie.motif).toBe(MOTIF_SOUS_SEUIL_RETENUE);
  });

  it('ne rétrograde pas un verdict déjà écarté : il garde son motif et sa confiance calculée (traçabilité)', () => {
    const sortie = calibrer(entree({ confianceInitiale: 0.1, verdict: 'non-reproduite', motif: 'jamais-reproduite', tauxReproduction: 0 }), CONFIG);
    expect(sortie.verdict).toBe('non-reproduite');
    expect(sortie.motif).toBe('jamais-reproduite');
    expect(sortie.confianceFinale).toBeLessThan(CONFIG.seuilRetenue);
  });

  it('une confiance exactement au seuil de retenue n’est PAS rétrogradée', () => {
    const neutre = {
      ...CONFIG,
      seuilRetenue: 0.8,
      calibration: { ...FACTEURS, facteurVerdict: { confirmee: 1, intermittente: 1 }, poidsTauxReproduction: 0 },
    };
    expect(calibrer(entree({ confianceInitiale: 0.8 }), neutre).verdict).toBe('confirmee');
    expect(calibrer(entree({ confianceInitiale: 0.79 }), neutre).verdict).toBe('basse-confiance');
  });
});
