/**
 * LA CONTRE-ÉPREUVE FUSIONNE AU LIEU DE MINORER (cahier P2-3, contrat 5 —
 * carnet C-11). Le contrôle porte sur les DEUX sens : ce qu'une preuve
 * réunit doit fondre, et ce qu'aucune preuve ne réunit doit rester séparé.
 */
import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate, ContreEpreuve, GroupeCause, ResultatGroupe } from '../../types.js';
import { DESKTOP, MOBILE, URL_CONTACT, interception, soumission } from '../detection/fabriques-test.js';
import { fusionnerParContreEpreuve } from './fusion-viewports.js';

function candidate(viewport: string): AnomalieCandidate {
  return {
    categorie: 'fonctionnel',
    description: 'clic-intercepte',
    urlOuEtape: URL_CONTACT,
    graviteEstimee: 'bloquant',
    confiance: 0.8,
    detecteur: 'd-recouvrement',
    reproduction: {
      url: URL_CONTACT,
      pageDepart: URL_CONTACT,
      viewport: viewport === MOBILE.nom ? MOBILE : DESKTOP,
      action: soumission('a1', { viewport }),
      actionsPrealables: [],
    },
    preuves: [interception({ viewport })],
  };
}

function resultat(viewport: string, contreEpreuve?: ContreEpreuve): ResultatGroupe {
  const representant = candidate(viewport);
  const groupe: GroupeCause = {
    cle: `d-recouvrement:element:bouton:${viewport}`,
    representant,
    membres: [representant],
    confiance: 0.8,
    localisations: [{ urlOuEtape: URL_CONTACT }],
    observations: [{ viewport }],
    descriptions: ['clic-intercepte'],
  };
  return {
    groupe,
    verdict: 'confirmee',
    motif: 'reproduite',
    tentatives: [],
    tauxReproduction: 1,
    confianceInitiale: 0.8,
    confianceFinale: 0.8,
    coutApi: 0,
    ...(contreEpreuve === undefined ? {} : { contreEpreuve }),
  };
}

const SYMETRIE_PROUVEE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: true, echecOutillage: false, attendue: false };
const ASYMETRIE_ATTENDUE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: false, echecOutillage: false, attendue: true };
const CONTRE_EPREUVE_RATEE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: false, echecOutillage: true, attendue: false };

describe('fusionnerParContreEpreuve', () => {
  it('ce qu’une contre-épreuve RÉUNIT ne fait plus qu’un groupe, avec les deux observations', () => {
    const desktop = resultat(DESKTOP.nom, SYMETRIE_PROUVEE);
    const mobile = resultat(MOBILE.nom);
    const issue = fusionnerParContreEpreuve([desktop, mobile]);
    expect(issue.resultats).toHaveLength(1);
    expect(issue.resultats[0]).toBe(desktop);
    expect(issue.fusions).toHaveLength(1);
    expect(issue.fusions[0]?.absorbees).toEqual([mobile.groupe.cle]);
    // Les preuves de l'absorbé ne disparaissent pas : elles changent de dossier.
    expect(desktop.groupe.membres).toHaveLength(2);
    expect(desktop.groupe.observations).toEqual([{ viewport: DESKTOP.nom }, { viewport: MOBILE.nom }]);
  });

  it('… ET DANS L’AUTRE SENS : sans preuve de symétrie, rien ne fond', () => {
    // Deux groupes qui se RESSEMBLENT ne sont pas un groupe. On ne fond que
    // sur une contre-épreuve qui est allée voir, et qui a retrouvé le défaut.
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, ASYMETRIE_ATTENDUE), resultat(MOBILE.nom)]);
    expect(issue.resultats).toHaveLength(2);
    expect(issue.fusions).toEqual([]);
  });

  it('une contre-épreuve qui n’a PAS PU s’exécuter ne fond rien : elle n’a rien prouvé', () => {
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, CONTRE_EPREUVE_RATEE), resultat(MOBILE.nom)]);
    expect(issue.resultats).toHaveLength(2);
  });

  it('un groupe seul, même avec sa preuve de symétrie, reste seul : il n’y a personne à absorber', () => {
    // Le jumeau a pu être écarté plus tôt. Le malus, lui, restera entier :
    // le doute existe toujours, et la fusion ne vient pas le résoudre.
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, SYMETRIE_PROUVEE)]);
    expect(issue.resultats).toHaveLength(1);
    expect(issue.fusions).toEqual([]);
  });
});
