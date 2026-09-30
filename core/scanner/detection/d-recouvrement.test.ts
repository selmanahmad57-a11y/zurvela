import { describe, expect, it } from 'vitest';
import type { LocalisationElement, Signal } from '../../types.js';
import { creerDetecteurRecouvrement, DESCRIPTION_CLIC_INTERCEPTE, NOM_DETECTEUR_RECOUVREMENT } from './d-recouvrement.js';
import { CONFIG_TEST, contexte, DESKTOP, interception, MOBILE, signauxSains, soumission, URL_CONTACT } from './fabriques-test.js';

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
      // L'élément EN CAUSE est celui qui reçoit le clic, quand il est connu
      // (P2-2, contrat 4) ; l'élément ciblé reste dans la preuve.
      element: (signal as Extract<typeof signal, { type: 'interception-clic' }>).intercepteur,
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

    // La géométrie connaît son intercepteur, le clic refusé non : deux causes
    // distinctes, l'une nommée par son intercepteur, l'autre par sa cible.
    const intercepteur = (signaux[0] as Extract<(typeof signaux)[number], { type: 'interception-clic' }>).intercepteur;
    expect(candidates.map((candidate) => candidate.element?.selecteur)).toEqual([intercepteur?.selecteur, autre.selecteur]);
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

  it('UNE CAUSE, UN CONSTAT : trois cibles recouvertes par le MÊME intercepteur → une candidate, trois preuves (P2-2, contrat 4)', () => {
    // Le calque de « calque-au-rejeu », l'iframe publicitaire d'expandtesting.
    // Le contrôle qui peut échouer : regroupées par cible, ces trois preuves
    // faisaient trois candidates, donc trois sections.
    const calque = { balise: 'div', selecteur: 'section.offres > div', attributs: {} };
    const cibles = ['a.offre-1', 'a.offre-2', 'a.offre-3'].map((selecteur) => ({ balise: 'a', selecteur, attributs: {} }));
    const signaux = cibles.map((element) => interception({ element, intercepteur: calque }));
    const candidates = detecteur.detecter(signaux, contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element).toEqual(calque);
    expect(candidates[0]?.preuves).toHaveLength(3);
  });

  it('deux intercepteurs distincts restent deux causes, même sur la même page', () => {
    const cibles = ['a.offre-1', 'a.offre-2'].map((selecteur) => ({ balise: 'a', selecteur, attributs: {} }));
    const signaux = [
      interception({ element: cibles[0]!, intercepteur: { balise: 'div', selecteur: 'div.bandeau', attributs: {} } }),
      interception({ element: cibles[1]!, intercepteur: { balise: 'iframe', selecteur: 'iframe#pub', attributs: {} } }),
    ];
    expect(detecteur.detecter(signaux, contexte())).toHaveLength(2);
  });
});

describe('N intercepteurs de MÊME CONSTRUCTION sont une cause (cahier P2-3, contrat 4)', () => {
  /** Un intercepteur d'une grille : même construction, rang de fratrie différent. */
  function carte(rang: number, classes = 'carte.voile'): { intercepteur: LocalisationElement; signature: string } {
    const selecteur = `body > ul > li:nth-of-type(${rang}) > span`;
    return {
      intercepteur: { balise: 'span', selecteur, attributs: {} },
      // Ce que la sonde calcule en page : balise | classes triées | chemin aux rangs effacés.
      signature: `span|${classes}|body > ul > li:nth-of-type() > span`,
    };
  }

  function interceptionDe(cible: string, rang: number, classes?: string): Signal {
    const { intercepteur, signature } = carte(rang, classes);
    return interception({
      element: { balise: 'a', selecteur: cible, attributs: {} },
      intercepteur,
      signatureIntercepteur: signature,
    });
  }

  it('SIX calques d’une même grille → UNE candidate, six preuves', () => {
    // Le legs de P2-2 : six intercepteurs distincts sortaient en six
    // sections. Ils sont la même construction répétée, donc un défaut.
    const signaux = Array.from({ length: 6 }, (_, i) => interceptionDe(`body > ul > li:nth-of-type(${i + 1}) > a`, i + 1));
    const candidates = detecteur.detecter(signaux, contexte([soumission('a1')]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.description).toBe(DESCRIPTION_CLIC_INTERCEPTE);
    expect(candidates[0]?.preuves).toHaveLength(6);
  });

  it('… ET DANS L’AUTRE SENS : deux recouvrements RÉELLEMENT distincts ne fondent PAS', () => {
    // LE SENS QUI PERD DES SIGNAUX, donc le plus grave. Deux calques sans
    // rapport, posés côte à côte, partagent le même chemin générateur : c'est
    // la CLASSE qui les sépare. Un critère qui ne regarderait que le chemin
    // les fondrait en un seul constat et enterrerait un vrai défaut.
    const signaux = [interceptionDe('#connexion', 1, 'bandeau-cookies'), interceptionDe('#panier', 2, 'encart-promo')];
    const candidates = detecteur.detecter(signaux, contexte([soumission('a1')]));
    expect(candidates).toHaveLength(2);
  });

  it('SANS signature, on NE FOND PAS : l’absence de preuve de répétition n’est pas une preuve de répétition', () => {
    // Deux conteneurs sans classe sous `body`. Le chemin seul les
    // confondrait ; la doctrine refuse, et publie deux sections plutôt que
    // d'en perdre une.
    const nu = (selecteur: string, cible: string): Signal =>
      interception({
        element: { balise: 'a', selecteur: cible, attributs: {} },
        intercepteur: { balise: 'div', selecteur, attributs: {} },
        signatureIntercepteur: null,
      });
    const candidates = detecteur.detecter(
      [nu('body > div:nth-of-type(1)', '#a'), nu('body > div:nth-of-type(2)', '#b')],
      contexte([soumission('a1')]),
    );
    expect(candidates).toHaveLength(2);
  });

  it('la même construction sur DEUX PAGES reste deux causes : une cause est locale à sa page', () => {
    const { intercepteur, signature } = carte(1);
    const surPage = (page: string, cible: string): Signal =>
      interception({ page, element: { balise: 'a', selecteur: cible, attributs: {} }, intercepteur, signatureIntercepteur: signature });
    const candidates = detecteur.detecter([surPage(URL_CONTACT, '#a'), surPage(`${URL_CONTACT}/autre`, '#b')], contexte([soumission('a1')]));
    expect(candidates).toHaveLength(2);
  });
});

