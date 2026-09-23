import { describe, expect, it } from 'vitest';
import type { ContexteDecision, DescriptionFormulaire, EtatDecisionEnumere, PageVisitee } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { NOM_POLITIQUE_DETERMINISTE, politiqueDeterministe, RAISON_PLUS_RIEN } from './politique.js';

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

/**
 * Énumération VIDE : la politique déterministe ne la lit pas, et ce test le
 * prouve — elle décide exactement pareil avec ou sans.
 */
const SANS_ENUMERATION: EtatDecisionEnumere = {
  page: '/contact',
  viewport: 'desktop',
  profil: null,
  actions: [],
  historique: [],
  nbPagesVisitees: 1,
  pagesRestantes: 19,
};

describe('politiqueDeterministe', () => {
  const politique = politiqueDeterministe(remplissage);

  it('porte son nom jusqu’au rapport', () => {
    expect(politique.nom).toBe(NOM_POLITIQUE_DETERMINISTE);
  });

  it('remplit le premier formulaire non rempli, avec les valeurs de config', async () => {
    const { action, politique: appliquee, provenance, raisonRepli } = await politique.decider(contexte(), SANS_ENUMERATION);
    expect(appliquee).toBe(NOM_POLITIQUE_DETERMINISTE);
    // Pas de provenance : aucune IA n'a décidé. Pas de repli : rien n'a échoué.
    expect(provenance).toBeUndefined();
    expect(raisonRepli).toBeUndefined();
    expect(action.type).toBe('remplir');
    if (action.type === 'remplir') {
      expect(action.formulaire.selecteur).toBe('form:nth-of-type(1)');
      expect(action.valeurs).toEqual([{ champ: { balise: 'input', selecteur: '#email', attributs: {} }, valeur: 'test@zurvela-scan.invalid' }]);
    }
  });

  it('soumet le premier formulaire rempli non soumis avant de remplir le suivant', async () => {
    const { action } = await politique.decider(contexte({ formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'] }), SANS_ENUMERATION);
    expect(action).toEqual({ type: 'soumettre', formulaire: { balise: 'form', selecteur: 'form:nth-of-type(1)', attributs: {} }, declencheur });
  });

  it('passe au second formulaire une fois le premier rempli', async () => {
    const { action } = await politique.decider(contexte({ formulairesRemplis: ['form:nth-of-type(1)'] }), SANS_ENUMERATION);
    expect(action.type).toBe('remplir');
    if (action.type === 'remplir') {
      expect(action.formulaire.selecteur).toBe('form:nth-of-type(2)');
    }
  });

  it('navigue vers la première URL en attente quand tout est soumis', async () => {
    const remplis = ['form:nth-of-type(1)', 'form:nth-of-type(2)'];
    const { action } = await politique.decider(
      contexte({ formulairesRemplis: remplis, formulairesSoumis: remplis, urlsEnAttente: ['http://site.invalid/a', 'http://site.invalid/b'] }),
      SANS_ENUMERATION,
    );
    expect(action).toEqual({ type: 'naviguer', url: 'http://site.invalid/a' });
  });

  it('termine quand il ne reste ni formulaire ni URL', async () => {
    const remplis = ['form:nth-of-type(1)', 'form:nth-of-type(2)'];
    const { action } = await politique.decider(contexte({ formulairesRemplis: remplis, formulairesSoumis: remplis }), SANS_ENUMERATION);
    expect(action).toEqual({ type: 'terminer', raison: RAISON_PLUS_RIEN });
  });
});
