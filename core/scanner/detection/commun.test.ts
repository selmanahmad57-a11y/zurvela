import { describe, expect, it } from 'vitest';
import type { ActionExecutee, Parcours } from '../../types.js';
import { actionsPrealablesDe, construireCandidate } from './commun.js';
import {
  BOUTON,
  contexte,
  DESKTOP,
  MOBILE,
  navigationAction,
  remplissage,
  reponse,
  soumission,
  URL_ACCUEIL,
  URL_CONTACT,
} from './fabriques-test.js';

/** Un parcours réduit à sa liste d'actions : le seul élément que la dérivation lit. */
function parcoursDe(actions: ActionExecutee[]): Parcours {
  return contexte(actions).parcours;
}

describe('actionsPrealablesDe', () => {
  it('formulaire rempli puis soumis → le remplissage', () => {
    const remplir = remplissage('a1');
    const soumettre = soumission('a2');
    expect(actionsPrealablesDe(parcoursDe([remplir, soumettre]), soumettre)).toEqual([remplir]);
  });

  it('soumission sans remplissage → aucune action préalable', () => {
    const soumettre = soumission('a1');
    expect(actionsPrealablesDe(parcoursDe([soumettre]), soumettre)).toEqual([]);
  });

  it('aucune action déclenchante (anomalie constatée au chargement) → aucune action préalable', () => {
    expect(actionsPrealablesDe(parcoursDe([remplissage('a1')]), null)).toEqual([]);
  });

  it('action absente du parcours → aucune action préalable (rien à affirmer)', () => {
    const inconnue = soumission('a99');
    expect(actionsPrealablesDe(parcoursDe([remplissage('a1'), soumission('a2')]), inconnue)).toEqual([]);
  });

  it('une navigation coupe la remontée : l’état d’avant le chargement n’a pas survécu', () => {
    const avant = remplissage('a1', { page: URL_ACCUEIL });
    const naviguer = navigationAction('a2', URL_CONTACT);
    const remplir = remplissage('a3');
    const soumettre = soumission('a4');
    expect(actionsPrealablesDe(parcoursDe([avant, naviguer, remplir, soumettre]), soumettre)).toEqual([remplir]);
  });

  it('les actions d’une AUTRE page sont exclues', () => {
    const ailleurs = remplissage('a1', { page: URL_ACCUEIL });
    const remplir = remplissage('a2');
    const soumettre = soumission('a3');
    expect(actionsPrealablesDe(parcoursDe([ailleurs, remplir, soumettre]), soumettre)).toEqual([remplir]);
  });

  it('les actions d’un AUTRE viewport sont exclues (les deux passages sont indépendants)', () => {
    const surMobile = remplissage('a1', { viewport: MOBILE.nom });
    const soumettre = soumission('a2', { viewport: DESKTOP.nom });
    expect(actionsPrealablesDe(parcoursDe([surMobile, soumettre]), soumettre)).toEqual([]);
  });

  it('une action dont le résultat n’est pas ok est ignorée, sans interrompre la remontée', () => {
    const utile = remplissage('a1');
    for (const resultat of ['bloquee', 'interdite', 'echec'] as const) {
      const ratee = remplissage('a2', { resultat });
      const soumettre = soumission('a3');
      expect(actionsPrealablesDe(parcoursDe([utile, ratee, soumettre]), soumettre)).toEqual([utile]);
    }
  });

  it('ordre CHRONOLOGIQUE, quel que soit le sens de la remontée', () => {
    const premier = remplissage('a1');
    const second = remplissage('a2');
    const troisieme = remplissage('a3');
    const soumettre = soumission('a4');
    expect(actionsPrealablesDe(parcoursDe([premier, second, troisieme, soumettre]), soumettre)).toEqual([premier, second, troisieme]);
  });
});

describe('construireCandidate', () => {
  it('remplit systématiquement le contexte de reproduction, actions préalables comprises', () => {
    const remplir = remplissage('a1');
    const soumettre = soumission('a2');
    const ctx = contexte([remplir, soumettre]);
    const signal = reponse({ actionId: 'a2', statut: 500 });

    const candidate = construireCandidate(
      {
        detecteur: 'd-test',
        description: 'cas-de-test',
        categorie: 'fonctionnel',
        gravite: 'bloquant',
        confiance: 0.5,
        page: URL_CONTACT,
        viewport: DESKTOP.nom,
        dependDuViewport: false,
        action: soumettre,
        element: BOUTON,
        preuves: [signal],
      },
      ctx,
    );

    expect(candidate.reproduction).toEqual({
      url: URL_CONTACT,
      viewport: DESKTOP,
      action: soumettre,
      actionsPrealables: [remplir],
    });
  });

  it('une candidate sans action déclenchante porte une liste d’actions préalables vide, jamais absente', () => {
    const candidate = construireCandidate(
      {
        detecteur: 'd-test',
        description: 'cas-de-test',
        categorie: 'visuel',
        gravite: 'mineur',
        confiance: 0.5,
        page: URL_CONTACT,
        viewport: DESKTOP.nom,
        dependDuViewport: false,
        action: null,
        preuves: [],
      },
      contexte([remplissage('a1')]),
    );
    expect(candidate.reproduction.actionsPrealables).toEqual([]);
  });
});
