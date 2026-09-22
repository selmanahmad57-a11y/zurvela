import { describe, expect, it } from 'vitest';
import { creerDetecteurHttp, DESCRIPTION_404_INTERNE, DESCRIPTION_5XX, NOM_DETECTEUR_HTTP } from './d-http.js';
import {
  BOUTON,
  CONFIG_TEST,
  contexte,
  DESKTOP,
  FORMULAIRE,
  navigationAction,
  ORIGINE,
  reponse,
  signauxSains,
  soumission,
  URL_ACCUEIL,
  URL_API,
  URL_CONTACT,
} from './fabriques-test.js';

const detecteur = creerDetecteurHttp(CONFIG_TEST.http);

describe('D-HTTP', () => {
  it('site sain → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('5xx lié à une soumission → reponse-5xx bloquant, palier haut, élément = déclencheur, reproduction complète', () => {
    const action = soumission('a1');
    const signal = reponse({ actionId: 'a1', statut: 500 });
    const candidates = detecteur.detecter([signal], contexte([action]));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_HTTP,
      description: DESCRIPTION_5XX,
      categorie: CONFIG_TEST.http.categorieParDefaut,
      graviteEstimee: CONFIG_TEST.http.gravite5xxSoumission,
      confiance: CONFIG_TEST.http.confiance5xxSoumission,
      urlOuEtape: URL_CONTACT,
      element: BOUTON,
      reproduction: { url: URL_CONTACT, viewport: DESKTOP, action, actionsPrealables: [] },
      preuves: [signal],
    });
    expect(candidates[0]?.viewport).toBeUndefined();
  });

  it('5xx hors soumission (chargement, navigation) → gravité et palier 5xx ordinaires, élément = ressource', () => {
    const chargement = reponse({ urlRessource: `${ORIGINE}/statique/app.js`, typeRessource: 'script', statut: 503, methode: 'GET' });
    const navigation = reponse({ actionId: 'a1', urlRessource: URL_CONTACT, typeRessource: 'document', statut: 502, methode: 'GET' });
    const candidates = detecteur.detecter([chargement, navigation], contexte([navigationAction('a1', URL_CONTACT)]));

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      graviteEstimee: CONFIG_TEST.http.gravite5xx,
      confiance: CONFIG_TEST.http.confiance5xx,
      element: { balise: 'script', selecteur: '/statique/app.js', attributs: { src: `${ORIGINE}/statique/app.js` } },
      reproduction: { action: null },
    });
    expect(candidates[1]).toMatchObject({
      graviteEstimee: CONFIG_TEST.http.gravite5xx,
      confiance: CONFIG_TEST.http.confiance5xx,
      element: { selecteur: '/contact' },
    });
  });

  it('5xx d’une soumission sans déclencheur (Entrée) → élément = ressource', () => {
    const action = soumission('a1', { action: { type: 'soumettre', formulaire: FORMULAIRE, declencheur: null } });
    const candidates = detecteur.detecter([reponse({ actionId: 'a1', statut: 500 })], contexte([action]));
    expect(candidates[0]).toMatchObject({
      graviteEstimee: CONFIG_TEST.http.gravite5xxSoumission,
      confiance: CONFIG_TEST.http.confiance5xxSoumission,
      element: { selecteur: '/api/contact' },
    });
  });

  it('404 interne → ressource-interne-404, catégorie par type de ressource', () => {
    const image = reponse({ urlRessource: `${ORIGINE}/img/absente.png`, typeRessource: 'image', statut: 404, methode: 'GET', page: URL_ACCUEIL });
    const xhr = reponse({ urlRessource: `${ORIGINE}/api/inconnue`, typeRessource: 'xhr', statut: 404, methode: 'GET' });
    const candidates = detecteur.detecter([image, xhr], contexte());

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      description: DESCRIPTION_404_INTERNE,
      categorie: 'visuel',
      graviteEstimee: CONFIG_TEST.http.gravite404,
      confiance: CONFIG_TEST.http.confiance404,
      urlOuEtape: URL_ACCUEIL,
      element: { balise: 'image', selecteur: '/img/absente.png', attributs: { src: `${ORIGINE}/img/absente.png` } },
      preuves: [image],
    });
    expect(candidates[1]).toMatchObject({ categorie: CONFIG_TEST.http.categorieParDefaut, element: { selecteur: '/api/inconnue' } });
  });

  it('404 externe → aucune candidate ; 4xx autres que 404 → aucune candidate', () => {
    const signaux = [
      reponse({ urlRessource: 'https://cdn.exemple.invalid/lib.js', typeRessource: 'script', statut: 404, interne: false }),
      reponse({ urlRessource: URL_API, statut: 403 }),
      reponse({ urlRessource: URL_API, statut: 422 }),
    ];
    expect(detecteur.detecter(signaux, contexte())).toEqual([]);
  });

  it('trois paliers de confiance, du signal le plus fort au plus faible : 5xx en soumission, 5xx, 404 interne', () => {
    const enSoumission = detecteur.detecter([reponse({ actionId: 'a1', statut: 500 })], contexte([soumission('a1')]));
    const horsSoumission = detecteur.detecter([reponse({ statut: 500, methode: 'GET' })], contexte());
    const introuvable = detecteur.detecter([reponse({ statut: 404, methode: 'GET' })], contexte());
    const confiances = [enSoumission, horsSoumission, introuvable].map((candidates) => candidates[0]?.confiance);

    expect(confiances).toEqual([CONFIG_TEST.http.confiance5xxSoumission, CONFIG_TEST.http.confiance5xx, CONFIG_TEST.http.confiance404]);
    // Les paliers sont bien ordonnés : plus le signal est fort, plus la confiance est haute.
    expect(CONFIG_TEST.http.confiance5xxSoumission).toBeGreaterThan(CONFIG_TEST.http.confiance5xx);
    expect(CONFIG_TEST.http.confiance5xx).toBeGreaterThan(CONFIG_TEST.http.confiance404);
  });

  it('les seuils de gravité et de confiance viennent de la config reçue', () => {
    const autre = creerDetecteurHttp({ ...CONFIG_TEST.http, confiance5xx: 0.42, gravite5xx: 'mineur', categorieParDefaut: 'securite' });
    const [candidate] = autre.detecter([reponse({ statut: 500 })], contexte());
    expect(candidate).toMatchObject({ confiance: 0.42, graviteEstimee: 'mineur', categorie: 'securite' });
  });
});
