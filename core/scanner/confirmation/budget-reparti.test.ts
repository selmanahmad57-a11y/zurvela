/**
 * LE BUDGET RÉPARTI (cahier P2-4, contrat du budget réparti).
 *
 * Les trois décisions y sont pures, donc éprouvables sans horloge ni
 * navigateur : dans quel ORDRE les groupes sont servis, COMBIEN de rejeux
 * chacun a le droit de prendre, et à QUEL COÛT un rejeu est estimé.
 *
 * Les chiffres des cas viennent du journal réel de `recouvrement--q10--fr`
 * (run du 2026-10-02), et pas d'une hypothèse : 34 302 ms restantes, six
 * groupes, 8 680 ms par rejeu.
 */
import { describe, expect, it } from 'vitest';
import type { GroupeCause } from '../../types.js';
import { coutRejeuEstime, ordonnerParViewport, quotaRejeux } from './protocole.js';

const DESKTOP = { nom: 'desktop', largeur: 1280, hauteur: 800 };
const MOBILE = { nom: 'mobile', largeur: 390, hauteur: 844 };

function groupe(cle: string, viewport: typeof DESKTOP): GroupeCause {
  return { cle, confiance: 0.8, membres: [], representant: { reproduction: { viewport } } } as unknown as GroupeCause;
}

/** Le cas mesuré : 34 302 ms, six groupes, 8 680 ms le rejeu. */
const Q10 = { budgetMs: 34_302, coutRejeuMs: 8_680, groupesRestants: 6, maxParGroupe: 3 };

describe('le quota de rejeux — on alloue des REJEUX, pas des millisecondes (R1)', () => {
  it('q10 : une part ÉGALE en temps affamerait les six, le quota en donne un à chacun', () => {
    // 34 302 / 6 = 5 717 ms par groupe, soit MOINS qu'un rejeu : une
    // répartition en millisecondes ne rejouerait aucun groupe. Le contrôle
    // qui peut échouer : quelqu'un divise le temps au lieu des rejeux.
    expect(Math.floor(Q10.budgetMs / Q10.groupesRestants)).toBeLessThan(Q10.coutRejeuMs);
    expect(quotaRejeux(Q10)).toBe(1);
  });

  it('UN TOUR AVANT DEUX : le reste se distribue à un rejeu par groupe, jamais en bloc au premier (R3)', () => {
    // Trois rejeux payables, six groupes : trois groupes servis une fois,
    // et non un groupe servi trois fois — ce que faisait la file.
    const alloues: number[] = [];
    let budget = Q10.budgetMs;
    for (let restants = 6; restants > 0; restants -= 1) {
      const quota = quotaRejeux({ ...Q10, budgetMs: budget, groupesRestants: restants });
      alloues.push(quota);
      budget -= quota * Q10.coutRejeuMs;
    }
    // 34 302 / 8 680 = 3,95 : trois rejeux payables, donc TROIS groupes
    // servis une fois — contre un seul groupe servi trois fois avec la file.
    expect(alloues).toEqual([1, 1, 1, 0, 0, 0]);
    expect(alloues.filter((q) => q > 0)).toHaveLength(3);
  });

  it('budget confortable : chacun reçoit sa part pleine, plafonnée au maximum du groupe', () => {
    expect(quotaRejeux({ budgetMs: 300_000, coutRejeuMs: 8_000, groupesRestants: 6, maxParGroupe: 3 })).toBe(3);
  });

  it('budget épuisé : zéro, et c’est un aveu, pas un demi-rejeu (R5)', () => {
    expect(quotaRejeux({ ...Q10, budgetMs: 4_000 })).toBe(0);
    expect(quotaRejeux({ ...Q10, budgetMs: -1_000 })).toBe(0);
  });

  it('aucun groupe restant, ou un coût nul : aucune division par zéro, aucun quota infini', () => {
    expect(quotaRejeux({ ...Q10, groupesRestants: 0 })).toBe(0);
    expect(quotaRejeux({ ...Q10, coutRejeuMs: 0 })).toBe(0);
  });
});

describe('le coût d’un rejeu se MESURE (R2)', () => {
  it('sans observation, c’est le plancher : on amorce, on ne devine pas', () => {
    expect(coutRejeuEstime([], 8_000)).toBe(8_000);
  });

  it('avec des observations, c’est leur MÉDIANE : une cible lente est suivie, pas subie', () => {
    // 29 s par rejeu sur expandtesting contre 8,7 s au banc : une constante
    // de config ne vaudrait que pour le site qui l'a inspirée.
    expect(coutRejeuEstime([29_000, 30_000, 31_000], 8_000)).toBe(30_000);
    expect(coutRejeuEstime([8_600, 8_800], 8_000)).toBe(8_700);
  });

  it('jamais sous le plancher : un rejeu anormalement rapide ne fait pas promettre l’impayable', () => {
    expect(coutRejeuEstime([10, 20, 30], 8_000)).toBe(8_000);
  });
});

describe('l’ordre ALTERNE les viewports — aucun n’est sacrifié à l’autre (R4)', () => {
  it('trois desktop puis trois mobile deviennent un desktop, un mobile, un desktop…', () => {
    // Le contrôle qui peut échouer : rendre la liste telle quelle. Le
    // budget se consomme dans l'ordre ; tout desktop d'abord, c'est le
    // mobile jamais rejoué dès que ça sature (n°36).
    const ordonnes = ordonnerParViewport([
      groupe('d1', DESKTOP),
      groupe('d2', DESKTOP),
      groupe('d3', DESKTOP),
      groupe('m1', MOBILE),
      groupe('m2', MOBILE),
      groupe('m3', MOBILE),
    ]);
    expect(ordonnes.map((g) => g.cle)).toEqual(['d1', 'm1', 'd2', 'm2', 'd3', 'm3']);
  });

  it('préserve l’ordre RELATIF à l’intérieur d’un viewport : on alterne, on ne trie pas', () => {
    const ordonnes = ordonnerParViewport([groupe('d1', DESKTOP), groupe('d2', DESKTOP), groupe('m1', MOBILE)]);
    expect(ordonnes.map((g) => g.cle)).toEqual(['d1', 'm1', 'd2']);
  });

  it('un seul viewport : rien ne change, et aucune boucle infinie', () => {
    const ordonnes = ordonnerParViewport([groupe('d1', DESKTOP), groupe('d2', DESKTOP)]);
    expect(ordonnes.map((g) => g.cle)).toEqual(['d1', 'd2']);
    expect(ordonnerParViewport([])).toEqual([]);
  });
});
