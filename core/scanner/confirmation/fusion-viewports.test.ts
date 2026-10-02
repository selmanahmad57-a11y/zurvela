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

/** L'ordre CONFIGURÉ des viewports : desktop d'abord, comme `config/scanner.json`. */
const ORDRE = [DESKTOP.nom, MOBILE.nom];

const SYMETRIE_PROUVEE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: true, echecOutillage: false, attendue: false };
const ASYMETRIE_ATTENDUE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: false, echecOutillage: false, attendue: true };
const CONTRE_EPREUVE_RATEE: ContreEpreuve = { viewport: MOBILE.nom, reproduite: false, echecOutillage: true, attendue: false };

describe('fusionnerParContreEpreuve', () => {
  it('ce qu’une contre-épreuve RÉUNIT ne fait plus qu’un groupe, avec les deux observations', () => {
    const desktop = resultat(DESKTOP.nom, SYMETRIE_PROUVEE);
    const mobile = resultat(MOBILE.nom);
    const issue = fusionnerParContreEpreuve([desktop, mobile], ORDRE);
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
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, ASYMETRIE_ATTENDUE), resultat(MOBILE.nom)], ORDRE);
    expect(issue.resultats).toHaveLength(2);
    expect(issue.fusions).toEqual([]);
  });

  it('une contre-épreuve qui n’a PAS PU s’exécuter ne fond rien : elle n’a rien prouvé', () => {
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, CONTRE_EPREUVE_RATEE), resultat(MOBILE.nom)], ORDRE);
    expect(issue.resultats).toHaveLength(2);
  });

  it('un groupe seul, même avec sa preuve de symétrie, reste seul : il n’y a personne à absorber', () => {
    // Le jumeau a pu être écarté plus tôt. Le malus, lui, restera entier :
    // le doute existe toujours, et la fusion ne vient pas le résoudre.
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom, SYMETRIE_PROUVEE)], ORDRE);
    expect(issue.resultats).toHaveLength(1);
    expect(issue.fusions).toEqual([]);
  });
});

describe('la SECONDE preuve de symétrie — chacun rejoué chez soi (cahier P2-4, budget réparti)', () => {
  /** Un résultat confirmé par SON PROPRE rejeu, sans contre-épreuve. */
  function rejoueChezSoi(viewport: string, reproduite = true): ResultatGroupe {
    const base = resultat(viewport);
    return {
      ...base,
      verdict: reproduite ? 'confirmee' : 'non-reproduite',
      tentatives: [{ numero: 1, viewport, reproduite, echecOutillage: false, dureeMs: 8000 }],
    };
  }

  it('deux jumeaux chacun rejoué et confirmé FUSIONNENT : c’est la même épreuve, faite deux fois', () => {
    // LE CAS QUI L'A IMPOSÉ. Dès que le budget réparti retire à un groupe
    // les moyens de sa contre-épreuve, le jumeau est rejoué pour son propre
    // compte — et sans cette route, le rapport publie DEUX sections pour un
    // seul défaut (mesuré sur `recouvrement--q10`, 1 faux positif).
    const issue = fusionnerParContreEpreuve([rejoueChezSoi(DESKTOP.nom), rejoueChezSoi(MOBILE.nom)], ORDRE);
    expect(issue.resultats).toHaveLength(1);
    expect(issue.fusions[0]?.absorbees).toEqual([`d-recouvrement:element:bouton:${MOBILE.nom}`]);
    expect(issue.resultats[0]?.groupe.observations).toHaveLength(2);
  });

  it('un seul jumeau confirmé ne fusionne RIEN : on ne fond que sur preuve, et il en manque une', () => {
    const issue = fusionnerParContreEpreuve([rejoueChezSoi(DESKTOP.nom), rejoueChezSoi(MOBILE.nom, false)], ORDRE);
    expect(issue.resultats).toHaveLength(2);
    expect(issue.fusions).toEqual([]);
  });

  it('un « confirmee » SANS tentative ne prouve aucune symétrie — la politique économe en rend', () => {
    // Le contrôle qui peut échouer : se contenter du verdict. Un groupe
    // confirmé par sa seule confiance initiale n'a jamais été rejoué, donc
    // n'a rien constaté dans son viewport.
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom), resultat(MOBILE.nom)], ORDRE);
    expect(issue.resultats).toHaveLength(2);
    expect(issue.fusions).toEqual([]);
  });

  it('une tentative en ÉCHEC D’OUTILLAGE ne prouve rien non plus', () => {
    const casse: ResultatGroupe = {
      ...resultat(MOBILE.nom),
      tentatives: [{ numero: 1, viewport: MOBILE.nom, reproduite: true, echecOutillage: true, dureeMs: 8000 }],
    };
    expect(fusionnerParContreEpreuve([rejoueChezSoi(DESKTOP.nom), casse], ORDRE).fusions).toEqual([]);
  });
});

describe('qui SURVIT à une fusion — l’ordre de dépense ne décide pas de ce que le client lit', () => {
  function rejoueChezSoi(viewport: string): ResultatGroupe {
    const base = resultat(viewport);
    return { ...base, tentatives: [{ numero: 1, viewport, reproduite: true, echecOutillage: false, dureeMs: 8000 }] };
  }

  it('le survivant suit la liste CONFIGURÉE, pas l’ordre d’arrivée des résultats', () => {
    // LE DÉFAUT MESURÉ SUR `recouvrement--q05`. La catégorie d'un
    // `clic-intercepte` vaut `mobile` ou `fonctionnel` SELON LE VIEWPORT :
    // prendre le premier arrivé laissait l'ordre de dépense du budget
    // décider de ce que le rapport publie — l'anomalie passait de
    // `fonctionnel` à `mobile` et devenait un faux positif.
    //
    // Le contrôle qui peut échouer : revenir à `famille[0]`.
    const mobileDAbord = fusionnerParContreEpreuve([rejoueChezSoi(MOBILE.nom), rejoueChezSoi(DESKTOP.nom)], ORDRE);
    expect(mobileDAbord.resultats[0]?.groupe.representant.reproduction.viewport.nom).toBe(DESKTOP.nom);
    const desktopDAbord = fusionnerParContreEpreuve([rejoueChezSoi(DESKTOP.nom), rejoueChezSoi(MOBILE.nom)], ORDRE);
    expect(desktopDAbord.resultats[0]?.groupe.representant.reproduction.viewport.nom).toBe(DESKTOP.nom);
  });

  it('une liste configurée INVERSÉE renverse le survivant : c’est bien la config qui décide', () => {
    const issue = fusionnerParContreEpreuve([rejoueChezSoi(DESKTOP.nom), rejoueChezSoi(MOBILE.nom)], [MOBILE.nom, DESKTOP.nom]);
    expect(issue.resultats[0]?.groupe.representant.reproduction.viewport.nom).toBe(MOBILE.nom);
  });

  it('par CONTRE-ÉPREUVE aussi : la preuve dit qu’il faut fondre, la config dit qui survit', () => {
    // Le porteur de la preuve est ici le groupe MOBILE — c'est lui qui a pu
    // se payer la contre-épreuve. Il ne doit pas pour autant imposer sa
    // catégorie : un défaut présent sur les deux viewports n'est pas un
    // défaut mobile, et le dire ainsi désignerait au commerçant la moitié
    // de son problème.
    const issue = fusionnerParContreEpreuve([resultat(DESKTOP.nom), resultat(MOBILE.nom, SYMETRIE_PROUVEE)], ORDRE);
    expect(issue.resultats).toHaveLength(1);
    expect(issue.resultats[0]?.groupe.representant.reproduction.viewport.nom).toBe(DESKTOP.nom);
  });
});
