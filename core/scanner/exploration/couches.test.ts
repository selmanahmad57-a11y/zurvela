/**
 * Les gardes des couches 1 et 2 s'éprouvent en construisant le cas qui les
 * déclenche, jamais en relisant leur code (METHODE §2). Le moteur ne produit
 * aujourd'hui aucune proposition hors menu : on en fabrique donc une à la
 * main, et on vérifie qu'elle est arrêtée — une garde qu'on ne peut pas faire
 * échouer n'est pas une garde.
 */
import { describe, expect, it } from 'vitest';
import type { Action, ActionProposee } from '../../types.js';
import { actionEnumeree, cleAction, filtrerMenuFerme, MENU_ACTIONS } from './couches.js';

const FORMULAIRE = { balise: 'form', selecteur: 'form#contact', attributs: {} };

function proposee(id: string, action: Action, type = action.type): ActionProposee {
  return { id, type: type as ActionProposee['type'], action, reperes: {}, libelle: null };
}

const NAVIGUER: Action = { type: 'naviguer', url: 'http://site.invalid/a' };
const SOUMETTRE: Action = { type: 'soumettre', formulaire: FORMULAIRE, declencheur: null };

describe('MENU_ACTIONS', () => {
  it('est le menu FERMÉ de la brique 2, inchangé', () => {
    expect([...MENU_ACTIONS]).toEqual(['naviguer', 'remplir', 'soumettre', 'terminer']);
  });
});

describe('cleAction', () => {
  it('identifie un acte par sa STRUCTURE, indépendamment de l’ordre des propriétés', () => {
    const a: Action = { type: 'soumettre', formulaire: FORMULAIRE, declencheur: null };
    const b = { declencheur: null, formulaire: { attributs: {}, selecteur: 'form#contact', balise: 'form' }, type: 'soumettre' } as Action;
    expect(cleAction(a)).toBe(cleAction(b));
  });

  it('distingue deux actes qui ne diffèrent que par une valeur', () => {
    expect(cleAction(NAVIGUER)).not.toBe(cleAction({ type: 'naviguer', url: 'http://site.invalid/b' }));
  });
});

describe('filtrerMenuFerme (couche 2)', () => {
  it('laisse passer les types du menu', () => {
    const { retenues, ecartees } = filtrerMenuFerme([proposee('c1', NAVIGUER), proposee('c2', SOUMETTRE)]);
    expect(retenues.map((p) => p.id)).toEqual(['c1', 'c2']);
    expect(ecartees).toEqual([]);
  });

  it('écarte une proposition dont l’acte n’est pas au menu, et le dit', () => {
    const horsMenu = proposee('c9', { type: 'televerser', chemin: '/etc/passwd' } as unknown as Action);
    const { retenues, ecartees } = filtrerMenuFerme([proposee('c1', NAVIGUER), horsMenu]);
    expect(retenues.map((p) => p.id)).toEqual(['c1']);
    expect(ecartees).toEqual([{ proposition: horsMenu, type: 'televerser' }]);
  });

  it('écarte une proposition dont le type ANNONCÉ ne correspond pas à l’acte porté', () => {
    // Un menu qui ne contrôlerait que l'étiquette laisserait passer un acte
    // déguisé : on compare les deux.
    const deguisee = proposee('c9', SOUMETTRE, 'naviguer');
    const { retenues, ecartees } = filtrerMenuFerme([deguisee]);
    expect(retenues).toEqual([]);
    expect(ecartees.map((e) => e.proposition.id)).toEqual(['c9']);
  });
});

describe('actionEnumeree (couche 1)', () => {
  const enumerees = [proposee('c1', NAVIGUER), proposee('c2', SOUMETTRE)];

  it('retrouve la proposition du moteur à partir d’un acte structurellement identique', () => {
    const reconstruit: Action = { type: 'naviguer', url: 'http://site.invalid/a' };
    expect(actionEnumeree(reconstruit, enumerees)?.id).toBe('c1');
  });

  it('ne retrouve RIEN pour un acte forgé : il n’a aucun chemin jusqu’à l’exécution', () => {
    expect(actionEnumeree({ type: 'naviguer', url: 'http://site.invalid/piege' }, enumerees)).toBeUndefined();
    expect(actionEnumeree({ type: 'soumettre', formulaire: { ...FORMULAIRE, selecteur: 'form#autre' }, declencheur: null }, enumerees)).toBeUndefined();
  });
});
