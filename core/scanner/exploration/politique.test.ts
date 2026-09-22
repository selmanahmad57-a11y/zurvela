import { describe, expect, it } from 'vitest';
import type { ContexteDecision, DescriptionFormulaire, PageVisitee } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { politiqueDeterministe, RAISON_PLUS_RIEN } from './politique.js';

const remplissage: ConfigScanner['remplissage'] = {
  regles: [{ types: ['email'], autocomplete: ['email'], valeur: 'test@zurvela-scan.invalid' }],
  valeurTexteParDefaut: 'Zurvela scan test',
  typesIgnores: ['hidden'],
};

const declencheur = { balise: 'button', selecteur: 'form > button[type="submit"]', attributs: { type: 'submit' } };

function formulaire(selecteur: string): DescriptionFormulaire {
  return {
    localisation: { balise: 'form', selecteur, attributs: {} },
    methode: 'post',
    action: 'http://site.invalid/api',
    champs: [{ localisation: { balise: 'input', selecteur: '#email', attributs: {} }, type: 'email', autocomplete: null, requis: true }],
    declencheur,
  };
}

function contexte(surcharges: Partial<ContexteDecision> = {}): ContexteDecision {
  const pageCourante: PageVisitee = {
    url: 'http://site.invalid/contact',
    viewport: 'desktop',
    statutHttp: 200,
    liensInternes: [],
    formulaires: [formulaire('form:nth-of-type(1)'), formulaire('form:nth-of-type(2)')],
    horodatage: new Date(0).toISOString(),
  };
  return { pageCourante, formulairesRemplis: [], formulairesSoumis: [], urlsEnAttente: [], nbPagesVisitees: 1, ...surcharges };
}

describe('politiqueDeterministe', () => {
  const politique = politiqueDeterministe(remplissage);

  it('remplit le premier formulaire non rempli, avec les valeurs de config', () => {
    const action = politique.decider(contexte());
    expect(action.type).toBe('remplir');
    if (action.type === 'remplir') {
      expect(action.formulaire.selecteur).toBe('form:nth-of-type(1)');
      expect(action.valeurs).toEqual([{ champ: { balise: 'input', selecteur: '#email', attributs: {} }, valeur: 'test@zurvela-scan.invalid' }]);
    }
  });

  it('soumet le premier formulaire rempli non soumis avant de remplir le suivant', () => {
    const action = politique.decider(contexte({ formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'] }));
    expect(action).toEqual({ type: 'soumettre', formulaire: { balise: 'form', selecteur: 'form:nth-of-type(1)', attributs: {} }, declencheur });
  });

  it('passe au second formulaire une fois le premier rempli', () => {
    const action = politique.decider(contexte({ formulairesRemplis: ['form:nth-of-type(1)'] }));
    expect(action.type).toBe('remplir');
    if (action.type === 'remplir') {
      expect(action.formulaire.selecteur).toBe('form:nth-of-type(2)');
    }
  });

  it('navigue vers la première URL en attente quand tout est soumis', () => {
    const remplis = ['form:nth-of-type(1)', 'form:nth-of-type(2)'];
    const action = politique.decider(contexte({ formulairesRemplis: remplis, formulairesSoumis: remplis, urlsEnAttente: ['http://site.invalid/a', 'http://site.invalid/b'] }));
    expect(action).toEqual({ type: 'naviguer', url: 'http://site.invalid/a' });
  });

  it('termine quand il ne reste ni formulaire ni URL', () => {
    const remplis = ['form:nth-of-type(1)', 'form:nth-of-type(2)'];
    expect(politique.decider(contexte({ formulairesRemplis: remplis, formulairesSoumis: remplis }))).toEqual({ type: 'terminer', raison: RAISON_PLUS_RIEN });
  });
});
