import { describe, expect, it } from 'vitest';
import { creerDetecteurRecouvrement, DESCRIPTION_CLIC_INTERCEPTE, NOM_DETECTEUR_RECOUVREMENT } from './d-recouvrement.js';
import { BOUTON, CONFIG_TEST, contexte, DESKTOP, interception, MOBILE, signauxSains, soumission, URL_CONTACT } from './fabriques-test.js';

const detecteur = creerDetecteurRecouvrement(CONFIG_TEST.recouvrement);

describe('D-RECOUVREMENT', () => {
  it('site sain → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('dépend du viewport', () => {
    expect(detecteur.dependDuViewport).toBe(true);
  });

  it('interception sur le viewport mobile → clic-intercepte, catégorie mobile, viewport renseigné', () => {
    const signal = interception({ viewport: MOBILE.nom });
    const candidates = detecteur.detecter([signal], contexte());

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_RECOUVREMENT,
      description: DESCRIPTION_CLIC_INTERCEPTE,
      categorie: 'mobile',
      graviteEstimee: CONFIG_TEST.recouvrement.gravite,
      confiance: CONFIG_TEST.recouvrement.confianceGeometrie,
      urlOuEtape: URL_CONTACT,
      viewport: MOBILE.nom,
      element: BOUTON,
      reproduction: { url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: MOBILE, action: null, actionsPrealables: [] },
      preuves: [signal],
    });
  });

  it('interception sur un viewport non mobile → catégorie fonctionnel', () => {
    const [candidate] = detecteur.detecter([interception()], contexte());
    expect(candidate).toMatchObject({ categorie: 'fonctionnel', viewport: 'desktop' });
  });

  it('clic refusé pendant une soumission → reproduction avec l’action', () => {
    const action = soumission('a1', { viewport: MOBILE.nom, resultat: 'bloquee' });
    const signal = interception({ viewport: MOBILE.nom, source: 'clic', intercepteur: null, actionId: 'a1' });
    const [candidate] = detecteur.detecter([signal], contexte([action]));
    expect(candidate?.reproduction).toEqual({ url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: MOBILE, action, actionsPrealables: [] });
  });
});

describe('D-RECOUVREMENT — paliers de confiance', () => {
  it('géométrie seule, ou clic seul → palier bas', () => {
    const geometrieSeule = detecteur.detecter([interception({ viewport: MOBILE.nom })], contexte());
    const clicSeul = detecteur.detecter([interception({ viewport: MOBILE.nom, source: 'clic', intercepteur: null })], contexte());
    expect(geometrieSeule[0]?.confiance).toBe(CONFIG_TEST.recouvrement.confianceGeometrie);
    expect(clicSeul[0]?.confiance).toBe(CONFIG_TEST.recouvrement.confianceGeometrie);
  });

  it('géométrie ET clic, même élément / page / viewport → UNE candidate au palier haut, les deux preuves', () => {
    // Le regroupement a lieu dans le détecteur : la candidate porte d'emblée
    // la confiance du palier haut, sans dépendre de la fusion (cas M01).
    const geometrie = interception({ viewport: MOBILE.nom });
    const clic = interception({ viewport: MOBILE.nom, source: 'clic', intercepteur: null, actionId: 'a1' });
    const ctx = contexte([soumission('a1', { viewport: MOBILE.nom, resultat: 'bloquee' })]);

    const candidates = detecteur.detecter([geometrie, clic], ctx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confiance).toBe(CONFIG_TEST.recouvrement.confianceGeometrieEtClic);
    expect(candidates[0]?.preuves).toEqual([geometrie, clic]);
    expect(CONFIG_TEST.recouvrement.confianceGeometrieEtClic).toBeGreaterThan(CONFIG_TEST.recouvrement.confianceGeometrie);
  });

  it('géométrie et clic sur des VIEWPORTS différents → deux candidates au palier bas', () => {
    const signaux = [interception({ viewport: DESKTOP.nom }), interception({ viewport: MOBILE.nom, source: 'clic', intercepteur: null })];
    const candidates = detecteur.detecter(signaux, contexte());

    expect(candidates.map((candidate) => candidate.viewport)).toEqual([DESKTOP.nom, MOBILE.nom]);
    expect(candidates.map((candidate) => candidate.confiance)).toEqual([
      CONFIG_TEST.recouvrement.confianceGeometrie,
      CONFIG_TEST.recouvrement.confianceGeometrie,
    ]);
  });

  it('géométrie et clic sur des ÉLÉMENTS différents → deux candidates au palier bas', () => {
    const autre = { balise: 'a', selecteur: 'nav > a:nth-of-type(2)', attributs: {} };
    const signaux = [
      interception({ viewport: MOBILE.nom }),
      interception({ viewport: MOBILE.nom, element: autre, source: 'clic', intercepteur: null }),
    ];
    const candidates = detecteur.detecter(signaux, contexte());

    expect(candidates.map((candidate) => candidate.element?.selecteur)).toEqual([BOUTON.selecteur, autre.selecteur]);
    expect(candidates.every((candidate) => candidate.confiance === CONFIG_TEST.recouvrement.confianceGeometrie)).toBe(true);
  });

  it('géométrie et clic sur des PAGES différentes → deux candidates au palier bas', () => {
    const signaux = [
      interception({ viewport: MOBILE.nom }),
      interception({ viewport: MOBILE.nom, page: 'http://127.0.0.1:4800/tarifs', source: 'clic', intercepteur: null }),
    ];
    const candidates = detecteur.detecter(signaux, contexte());
    expect(candidates.map((candidate) => candidate.confiance)).toEqual([
      CONFIG_TEST.recouvrement.confianceGeometrie,
      CONFIG_TEST.recouvrement.confianceGeometrie,
    ]);
  });
});
