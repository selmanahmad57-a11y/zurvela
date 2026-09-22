import { describe, expect, it } from 'vitest';
import { creerDetecteurEchecMuet, DESCRIPTION_ECHEC_MUET, NOM_DETECTEUR_ECHEC_MUET } from './d-echec-muet.js';
import {
  BOUTON,
  CONFIG_TEST,
  contexte,
  DESKTOP,
  finAction,
  FORMULAIRE,
  horodatage,
  mutation,
  navigation,
  remplissage,
  reponse,
  requeteEchouee,
  signauxSains,
  soumission,
  soumissionImplicite,
  URL_CONTACT,
} from './fabriques-test.js';

const detecteur = creerDetecteurEchecMuet(CONFIG_TEST.echecMuet);

/** Réponse serveur en échec, reçue 100 ms après le début de l'action. */
const echec500 = (): ReturnType<typeof reponse> => reponse({ actionId: 'a1', statut: 500, horodatage: horodatage(100) });

describe('D-ECHEC-MUET', () => {
  it('site sain (réponse 200 puis navigation) → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('échec 500 sans aucune mutation → echec-muet, preuves = la réponse en échec', () => {
    const action = soumission('a1');
    const echec = echec500();
    const candidates = detecteur.detecter([echec, finAction({ actionId: 'a1' })], contexte([action]));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_ECHEC_MUET,
      description: DESCRIPTION_ECHEC_MUET,
      categorie: 'fonctionnel',
      graviteEstimee: CONFIG_TEST.echecMuet.gravite,
      confiance: CONFIG_TEST.echecMuet.confiance,
      urlOuEtape: URL_CONTACT,
      element: BOUTON,
      reproduction: { url: URL_CONTACT, viewport: DESKTOP, action, actionsPrealables: [] },
      preuves: [echec],
    });
  });

  it('mutation en zone APRÈS la réponse → la page a réagi, pas d’échec muet', () => {
    const signaux = [echec500(), mutation({ actionId: 'a1', nbZone: 1, horodatage: horodatage(150) })];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toEqual([]);
  });

  it('mutation en zone AVANT la réponse seulement (bouton désactivé à l’envoi) → echec-muet', () => {
    const signaux = [mutation({ actionId: 'a1', nbZone: 1, horodatage: horodatage(20) }), echec500()];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toHaveLength(1);
  });

  it('mutation après la réponse mais HORS zone → echec-muet (la zone du formulaire n’a pas bougé)', () => {
    const signaux = [echec500(), mutation({ actionId: 'a1', nb: 2, nbZone: 0, horodatage: horodatage(150) })];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toHaveLength(1);
  });

  it('échec suivi d’une navigation → pas d’échec muet (la page a changé)', () => {
    const signaux = [echec500(), navigation({ actionId: 'a1', horodatage: horodatage(200) })];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toEqual([]);
  });

  it('4xx et requête échouée comptent comme échecs ; un échec non lié à l’action ne compte pas', () => {
    expect(detecteur.detecter([reponse({ actionId: 'a1', statut: 422 })], contexte([soumission('a1')]))).toHaveLength(1);
    expect(detecteur.detecter([requeteEchouee({ actionId: 'a1' })], contexte([soumission('a1')]))).toHaveLength(1);
    expect(detecteur.detecter([reponse({ statut: 500 })], contexte([soumission('a1')]))).toEqual([]);
  });

  it('plusieurs échecs : la réaction est jugée après le PREMIER', () => {
    const signaux = [
      reponse({ actionId: 'a1', statut: 500, horodatage: horodatage(100) }),
      mutation({ actionId: 'a1', nbZone: 1, horodatage: horodatage(150) }),
      reponse({ actionId: 'a1', statut: 500, horodatage: horodatage(300) }),
    ];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toEqual([]);
  });

  it('une ressource ANNEXE en échec (pixel, beacon) n’est pas l’échec de la soumission', () => {
    // Formulaire sain : POST 200, la page réagit dans sa zone ; un pixel de
    // suivi en 404 et un beacon tiers bloqué pendant la même fenêtre ne
    // doivent pas transformer cela en échec muet.
    const signaux = [
      reponse({ actionId: 'a1', statut: 200, horodatage: horodatage(100) }),
      mutation({ actionId: 'a1', nbZone: 1, horodatage: horodatage(105) }),
      reponse({ actionId: 'a1', statut: 404, typeRessource: 'image', interne: false, urlRessource: 'https://stats.tiers.invalid/px.gif', horodatage: horodatage(110) }),
      requeteEchouee({ actionId: 'a1', typeRessource: 'ping', interne: false, urlRessource: 'https://beacon.tiers.invalid/b' }),
      finAction({ actionId: 'a1' }),
    ];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toEqual([]);
  });

  it('soumission implicite (aucun déclencheur) : l’élément est le formulaire', () => {
    const action = soumissionImplicite('a1', FORMULAIRE);
    const candidates = detecteur.detecter([echec500(), finAction({ actionId: 'a1' })], contexte([action]));
    expect(candidates[0]?.element).toEqual(FORMULAIRE);
  });

  it('le formulaire rempli avant la soumission est rendu dans les actions préalables (F02 rejouable)', () => {
    const remplir = remplissage('a1');
    const soumettre = soumission('a2');
    const echec = reponse({ actionId: 'a2', statut: 500, horodatage: horodatage(100) });
    const [candidate] = detecteur.detecter([echec], contexte([remplir, soumettre]));
    expect(candidate?.reproduction.actionsPrealables).toEqual([remplir]);
  });

  it('confiance de base UNIQUE : la moitié du constat est une absence de réaction, il n’a pas de palier', () => {
    const quatreCentQuatre = detecteur.detecter([reponse({ actionId: 'a1', statut: 404 })], contexte([soumission('a1')]));
    const cinqCents = detecteur.detecter([echec500()], contexte([soumission('a1')]));
    const echouee = detecteur.detecter([requeteEchouee({ actionId: 'a1' })], contexte([soumission('a1')]));
    expect([quatreCentQuatre, cinqCents, echouee].map((candidates) => candidates[0]?.confiance)).toEqual([
      CONFIG_TEST.echecMuet.confiance,
      CONFIG_TEST.echecMuet.confiance,
      CONFIG_TEST.echecMuet.confiance,
    ]);
  });

  it('ignore les soumissions non exécutées', () => {
    expect(detecteur.detecter([echec500()], contexte([soumission('a1', { resultat: 'bloquee' })]))).toEqual([]);
  });
});
