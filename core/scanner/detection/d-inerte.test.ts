import { describe, expect, it } from 'vitest';
import { creerDetecteurInerte, DESCRIPTION_SANS_EFFET, NOM_DETECTEUR_INERTE } from './d-inerte.js';
import type { LocalisationElement } from '../../types.js';
import {
  BOUTON,
  CONFIG_TEST,
  contexte,
  DESKTOP,
  finAction,
  FORMULAIRE,
  remplissage,
  signauxSains,
  soumission,
  soumissionImplicite,
  URL_CONTACT,
} from './fabriques-test.js';

const detecteur = creerDetecteurInerte(CONFIG_TEST.inerte);

/** Résumé d'une fenêtre d'effet où rien ne s'est passé. */
const AUCUN_EFFET = { requetes: 0, requetesEnAttente: 0, navigation: false, mutations: 0, mutationsZone: 0, mutationsHorsBruit: 0, attenteMs: 500 };

describe('D-INERTE', () => {
  it('site sain (soumission suivie d’effets) → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('soumission sans aucun effet → element-sans-effet, élément = déclencheur', () => {
    const action = soumission('a1');
    const fin = finAction({ actionId: 'a1', effets: AUCUN_EFFET });
    const candidates = detecteur.detecter([fin], contexte([action]));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_INERTE,
      description: DESCRIPTION_SANS_EFFET,
      categorie: 'fonctionnel',
      graviteEstimee: CONFIG_TEST.inerte.gravite,
      confiance: CONFIG_TEST.inerte.confiance,
      urlOuEtape: URL_CONTACT,
      element: BOUTON,
      reproduction: { url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: DESKTOP, action, actionsPrealables: [] },
      preuves: [fin],
    });
  });

  it('un seul effet (requête, attente, navigation ou mutation significative) suffit à écarter la candidate', () => {
    const variantes = [
      { ...AUCUN_EFFET, requetes: 1 },
      { ...AUCUN_EFFET, requetesEnAttente: 1 },
      { ...AUCUN_EFFET, navigation: true },
      { ...AUCUN_EFFET, mutations: 1, mutationsHorsBruit: 1 },
      { ...AUCUN_EFFET, mutations: 1, mutationsHorsBruit: 1, mutationsZone: 1 },
    ];
    for (const effets of variantes) {
      expect(detecteur.detecter([finAction({ actionId: 'a1', effets })], contexte([soumission('a1')]))).toEqual([]);
    }
  });

  it('ignore les soumissions non exécutées (bloquée, interdite, échec) et les autres actions', () => {
    const fin = finAction({ actionId: 'a1', effets: AUCUN_EFFET });
    for (const resultat of ['bloquee', 'interdite', 'echec'] as const) {
      expect(detecteur.detecter([fin], contexte([soumission('a1', { resultat })]))).toEqual([]);
    }
    const remplir = soumission('a1', { action: { type: 'remplir', formulaire: FORMULAIRE, valeurs: [] } });
    expect(detecteur.detecter([fin], contexte([remplir]))).toEqual([]);
  });

  it('mutations de BRUIT DE FOND seules (carrousel, horloge, hors zone) → le bouton reste inerte', () => {
    const effets = { ...AUCUN_EFFET, mutations: 27, mutationsHorsBruit: 0, mutationsZone: 0 };
    expect(detecteur.detecter([finAction({ actionId: 'a1', effets })], contexte([soumission('a1')]))).toHaveLength(1);
  });

  it('soumission implicite (aucun déclencheur) : l’élément est le formulaire, deux formulaires ne se confondent pas', () => {
    const f2: LocalisationElement = { balise: 'form', selecteur: '#f2', attributs: {} };
    const actions = [soumissionImplicite('a1', FORMULAIRE), soumissionImplicite('a2', f2)];
    const signaux = [finAction({ actionId: 'a1', effets: AUCUN_EFFET }), finAction({ actionId: 'a2', effets: AUCUN_EFFET })];
    const candidates = detecteur.detecter(signaux, contexte(actions));
    expect(candidates.map((c) => c.element?.selecteur)).toEqual([FORMULAIRE.selecteur, f2.selecteur]);
  });

  it('le formulaire rempli avant la soumission est rendu dans les actions préalables (F01 rejouable)', () => {
    const remplir = remplissage('a1');
    const soumettre = soumission('a2');
    const fin = finAction({ actionId: 'a2', effets: AUCUN_EFFET });
    const [candidate] = detecteur.detecter([fin], contexte([remplir, soumettre]));
    expect(candidate?.reproduction.actionsPrealables).toEqual([remplir]);
  });

  it('confiance de base UNIQUE : ce détecteur conclut d’une absence, il n’a pas de palier', () => {
    const variantes = [AUCUN_EFFET, { ...AUCUN_EFFET, mutations: 27 }, { ...AUCUN_EFFET, attenteMs: 8000 }];
    const confiances = variantes.map((effets) => detecteur.detecter([finAction({ actionId: 'a1', effets })], contexte([soumission('a1')]))[0]?.confiance);
    expect(confiances).toEqual([CONFIG_TEST.inerte.confiance, CONFIG_TEST.inerte.confiance, CONFIG_TEST.inerte.confiance]);
  });

  it('sans résumé fin-action pour l’action, ne conclut rien', () => {
    expect(detecteur.detecter([finAction({ actionId: 'a2', effets: AUCUN_EFFET })], contexte([soumission('a1')]))).toEqual([]);
  });
});
