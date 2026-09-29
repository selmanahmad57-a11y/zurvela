/**
 * La rejouabilité (cahier P2-1, contrat 5) : ce que le protocole a
 * PHYSIQUEMENT re-testé, sur les candidates du scan — et seulement elles.
 */
import { describe, expect, it } from 'vitest';
import { MOTIF_CONSTATEE_AU_REJEU } from './decouvertes.js';
import { tauxRejouabilite } from './rejouabilite.js';

const groupe = (membres: number, tentatives: boolean[], verdict = 'confirmee', motif = 'reproduite') => ({
  groupe: { membres: Array.from({ length: membres }, (_, i) => i) },
  tentatives: tentatives.map((echecOutillage) => ({ echecOutillage })),
  verdict,
  motif,
});

describe('tauxRejouabilite', () => {
  it('un groupe est rejoué dès qu’une tentative a abouti ; l’échéance et l’outillage ne rejouent rien', () => {
    const taux = tauxRejouabilite({
      groupes: [groupe(3, [false, false]), groupe(2, [true, true]), groupe(1, [], 'limite-automatisation', 'echeance-atteinte')],
    });
    expect(taux).toEqual({ candidates: 6, candidatesRejouees: 3, groupes: 3, groupesRejoues: 1 });
  });

  it('un groupe de DÉCOUVERTE n’entre dans aucun compte : ce n’est pas une candidate du scan (gabarit calque-au-rejeu)', () => {
    // Le contrôle qui peut échouer : compté « non rejoué », un rejeu RÉUSSI
    // qui voit trois choses en passant ferait tomber la métrique à 25 %.
    const rejoue = groupe(2, [false, false]);
    const parVerdict = groupe(1, [], 'decouverte', MOTIF_CONSTATEE_AU_REJEU);
    const parMotif = groupe(1, [], 'confirmee', MOTIF_CONSTATEE_AU_REJEU);
    expect(tauxRejouabilite({ groupes: [rejoue, parVerdict, parMotif, parVerdict] })).toEqual({ candidates: 2, candidatesRejouees: 2, groupes: 1, groupesRejoues: 1 });
  });

  it('sans groupes, tout est à zéro — rien à rejouer n’est pas un échec', () => {
    expect(tauxRejouabilite({})).toEqual({ candidates: 0, candidatesRejouees: 0, groupes: 0, groupesRejoues: 0 });
  });
});
