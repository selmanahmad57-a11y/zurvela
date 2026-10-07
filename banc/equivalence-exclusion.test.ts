/**
 * Dette n°33 — l'exclusion de `site-charge` de l'oracle d'équivalence.
 *
 * `site-charge` sature un budget de confirmation PAR CONCEPTION (cahier P2-4) :
 * son identité par-groupe dépend du timing, donc l'oracle d'identité ne peut
 * l'exiger égale sans crier faux à chaque tableau. Ces contrôles tiennent que
 * le gabarit est bien écarté du décompte comparé — et SEULEMENT lui.
 */
import { describe, expect, it } from 'vitest';
import type { ResultatScenario } from './types.js';
import { GABARITS_HORS_EQUIVALENCE, partitionnerEquivalence } from './equivalence-optimisation.js';

/** Minimal : `partitionnerEquivalence` ne lit que `gabarit` et `scenarioId`. */
function scenario(gabarit: string, scenarioId: string): ResultatScenario {
  return { gabarit, scenarioId } as unknown as ResultatScenario;
}

describe('dette n°33 — site-charge hors équivalence', () => {
  it('la liste des gabarits hors équivalence nomme site-charge', () => {
    expect(GABARITS_HORS_EQUIVALENCE).toContain('site-charge');
  });

  it('partitionne : site-charge en exclus, les autres gabarits en retenus, sans rien perdre', () => {
    const scenarios = [
      scenario('recouvrement', 'recouvrement--q01--fr'),
      scenario('site-charge', 'site-charge--z01--fr'),
      scenario('site-charge', 'site-charge--z01--en'),
      scenario('calque-au-rejeu', 'calque-au-rejeu--d01--fr'),
    ];
    const { retenus, exclus } = partitionnerEquivalence(scenarios);
    expect(exclus.map((s) => s.scenarioId)).toEqual(['site-charge--z01--fr', 'site-charge--z01--en']);
    expect(retenus.map((s) => s.scenarioId)).toEqual(['recouvrement--q01--fr', 'calque-au-rejeu--d01--fr']);
    expect(retenus.length + exclus.length).toBe(scenarios.length);
  });

  it('un gabarit ORDINAIRE n’est jamais écarté : seul le timing-tension l’est', () => {
    const { retenus, exclus } = partitionnerEquivalence([scenario('recouvrement', 'recouvrement--q19--fr')]);
    expect(exclus).toHaveLength(0);
    expect(retenus).toHaveLength(1);
  });

  it('une divergence CONFINÉE à site-charge ne peut pas atteindre la comparaison (elle est en exclus)', () => {
    // La garde de fond : le seul gabarit non déterministe ne passe jamais à
    // `comparerEmpreintes`, donc il ne peut pas faire crier « NON ÉQUIVALENT ».
    const { retenus } = partitionnerEquivalence([
      scenario('site-charge', 'site-charge--z01--fr'),
      scenario('recouvrement', 'recouvrement--q01--fr'),
    ]);
    expect(retenus.some((s) => s.gabarit === 'site-charge')).toBe(false);
  });
});
