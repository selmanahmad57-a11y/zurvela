import { describe, expect, it } from 'vitest';
import { creerDetecteurImage, DESCRIPTION_IMAGE_CASSEE, NOM_DETECTEUR_IMAGE } from './d-image.js';
import {
  CONFIG_TEST,
  contexte,
  DESKTOP,
  etatImage,
  LOGO,
  ORIGINE,
  reponse,
  requeteEchouee,
  signauxSains,
  soumission,
  URL_CONTACT,
  URL_LOGO,
} from './fabriques-test.js';

const detecteur = creerDetecteurImage(CONFIG_TEST.image);

describe('D-IMAGE', () => {
  it('site sain (logo décodé, réponse 200) → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('image complete sans dimensions → image-cassee, palier du signal simple, élément = celui du signal', () => {
    const etat = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0 });
    const candidates = detecteur.detecter([etat], contexte());

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_IMAGE,
      description: DESCRIPTION_IMAGE_CASSEE,
      categorie: 'visuel',
      graviteEstimee: CONFIG_TEST.image.gravite,
      confiance: CONFIG_TEST.image.confianceSignalSimple,
      urlOuEtape: URL_CONTACT,
      element: LOGO,
      reproduction: { url: URL_CONTACT, viewport: DESKTOP, action: null, actionsPrealables: [] },
      preuves: [etat],
    });
  });

  it('ressource en échec (404 ou requête échouée) → image-cassee même avec des dimensions, preuves réseau jointes', () => {
    const quatreCentQuatre = reponse({ urlRessource: URL_LOGO, methode: 'GET', typeRessource: 'image', statut: 404 });
    const etat = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0 });
    expect(detecteur.detecter([quatreCentQuatre, etat], contexte())[0]?.preuves).toEqual([etat, quatreCentQuatre]);

    const echouee = requeteEchouee({ urlRessource: URL_LOGO, methode: 'GET', typeRessource: 'image' });
    const decodee = etatImage();
    expect(detecteur.detecter([echouee, decodee], contexte())[0]?.preuves).toEqual([decodee, echouee]);
  });

  it('largeur nulle mais réponse 200 (SVG sans dimension intrinsèque) → candidate, par la règle physique « complete sans dimensions »', () => {
    const ok = reponse({ urlRessource: URL_LOGO, methode: 'GET', typeRessource: 'image', statut: 200 });
    const svg = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0 });
    const candidates = detecteur.detecter([ok, svg], contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.preuves).toEqual([svg]);
  });

  it('image SANS source (chargement différé par script) → aucune candidate : rien n’a été demandé', () => {
    // `<img data-src="...">` ou `src=""` : `complete` vaut true et les
    // dimensions sont nulles, mais aucune requête n'a eu lieu.
    const sansSource = etatImage({ ressource: '', largeurNaturelle: 0, hauteurNaturelle: 0 });
    expect(detecteur.detecter([sansSource], contexte())).toEqual([]);
  });

  it('deux paliers : un seul signal (dimension nulle OU ressource en échec) → palier bas ; les deux → palier haut', () => {
    const dimensionNulle = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0 });
    const decodee = etatImage();
    const echec = reponse({ urlRessource: URL_LOGO, methode: 'GET', typeRessource: 'image', statut: 404 });

    expect(detecteur.detecter([dimensionNulle], contexte())[0]?.confiance).toBe(CONFIG_TEST.image.confianceSignalSimple);
    expect(detecteur.detecter([echec, decodee], contexte())[0]?.confiance).toBe(CONFIG_TEST.image.confianceSignalSimple);
    expect(detecteur.detecter([echec, dimensionNulle], contexte())[0]?.confiance).toBe(CONFIG_TEST.image.confianceSignalDouble);
    expect(CONFIG_TEST.image.confianceSignalDouble).toBeGreaterThan(CONFIG_TEST.image.confianceSignalSimple);
  });

  it('cas négatifs : pas encore chargée, une seule dimension nulle, échec d’une AUTRE ressource', () => {
    const signaux = [
      etatImage({ complete: false, largeurNaturelle: 0, hauteurNaturelle: 0 }),
      etatImage({ largeurNaturelle: 0, hauteurNaturelle: 12 }),
      reponse({ urlRessource: `${ORIGINE}/autre.png`, methode: 'GET', typeRessource: 'image', statut: 404 }),
      etatImage(),
    ];
    expect(detecteur.detecter(signaux, contexte())).toEqual([]);
  });
});
