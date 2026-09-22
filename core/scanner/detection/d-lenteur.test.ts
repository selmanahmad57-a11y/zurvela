import { describe, expect, it } from 'vitest';
import { creerDetecteurLenteur, DESCRIPTION_LENTE, NOM_DETECTEUR_LENTEUR } from './d-lenteur.js';
import { detecter } from './index.js';
import {
  BOUTON,
  CONFIG_TEST,
  contexte,
  DESKTOP,
  navigationAction,
  reponse,
  requeteEnAttente,
  signauxSains,
  soumission,
  URL_CONTACT,
} from './fabriques-test.js';

const detecteur = creerDetecteurLenteur(CONFIG_TEST.lenteur);
const seuil = CONFIG_TEST.lenteur.seuilMs;
const [PALIER_BAS, PALIER_MOYEN, PALIER_HAUT] = CONFIG_TEST.lenteur.paliers;

/** Confiance de l'unique candidate produite par une réponse de cette durée. */
function confiancePourDuree(dureeMs: number): number | undefined {
  const candidates = detecteur.detecter([reponse({ actionId: 'a1', dureeMs })], contexte([soumission('a1')]));
  return candidates[0]?.confiance;
}

describe('D-LENTEUR', () => {
  it('site sain → aucune candidate', () => {
    expect(detecteur.detecter(signauxSains('a1'), contexte([soumission('a1')]))).toEqual([]);
  });

  it('durée exactement au seuil → pas lent ; juste au-dessus → reponse-lente', () => {
    const action = soumission('a1');
    expect(detecteur.detecter([reponse({ actionId: 'a1', dureeMs: seuil })], contexte([action]))).toEqual([]);

    const lente = reponse({ actionId: 'a1', dureeMs: seuil + 1 });
    const candidates = detecteur.detecter([lente], contexte([action]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_LENTEUR,
      description: DESCRIPTION_LENTE,
      categorie: 'performance',
      graviteEstimee: CONFIG_TEST.lenteur.gravite,
      confiance: PALIER_BAS?.confiance,
      urlOuEtape: URL_CONTACT,
      element: BOUTON,
      reproduction: { url: URL_CONTACT, viewport: DESKTOP, action, actionsPrealables: [] },
      preuves: [lente],
    });
  });

  it('requête encore en attente au-delà du seuil → reponse-lente ; au seuil → rien', () => {
    expect(detecteur.detecter([requeteEnAttente({ actionId: 'a1', attenteMs: seuil })], contexte([soumission('a1')]))).toEqual([]);
    expect(detecteur.detecter([requeteEnAttente({ actionId: 'a1', attenteMs: seuil + 1 })], contexte([soumission('a1')]))).toHaveLength(1);
  });

  it('réponse lente hors action (chargement de page) → ignorée ; durée inconnue → ignorée', () => {
    const signaux = [reponse({ dureeMs: seuil * 10 }), reponse({ actionId: 'a1', dureeMs: null })];
    expect(detecteur.detecter(signaux, contexte([soumission('a1')]))).toEqual([]);
  });

  it('navigation lente → élément = ressource (pas de déclencheur)', () => {
    const lente = reponse({ actionId: 'a1', urlRessource: URL_CONTACT, methode: 'GET', typeRessource: 'document', dureeMs: seuil + 1 });
    const [candidate] = detecteur.detecter([lente], contexte([navigationAction('a1', URL_CONTACT)]));
    expect(candidate).toMatchObject({ element: { balise: 'document', selecteur: '/contact' } });
  });

  it('un palier par force de lenteur : le plus grand ratioMin satisfait par durée / seuil', () => {
    expect(confiancePourDuree(seuil + 1)).toBe(PALIER_BAS?.confiance);
    expect(confiancePourDuree(seuil * 2)).toBe(PALIER_MOYEN?.confiance);
    expect(confiancePourDuree(seuil * 10)).toBe(PALIER_HAUT?.confiance);
  });

  it('frontière exacte d’un ratio : le palier s’applique À PARTIR de son ratioMin', () => {
    const ratio = PALIER_MOYEN?.ratioMin ?? 0;
    expect(confiancePourDuree(seuil * ratio)).toBe(PALIER_MOYEN?.confiance);
    expect(confiancePourDuree(seuil * ratio - 1)).toBe(PALIER_BAS?.confiance);
  });

  it('une requête encore en attente est graduée sur son attente, par les mêmes paliers', () => {
    const candidates = detecteur.detecter([requeteEnAttente({ actionId: 'a1', attenteMs: seuil * 10 })], contexte([soumission('a1')]));
    expect(candidates[0]?.confiance).toBe(PALIER_HAUT?.confiance);
  });

  it('paliers donnés en DÉSORDRE dans la config → même résultat (ils sont triés à la construction)', () => {
    const paliers = CONFIG_TEST.lenteur.paliers;
    const desordre = creerDetecteurLenteur({ ...CONFIG_TEST.lenteur, paliers: [...paliers].reverse() });
    const lente = reponse({ actionId: 'a1', dureeMs: seuil * 2 });
    expect(desordre.detecter([lente], contexte([soumission('a1')]))[0]?.confiance).toBe(PALIER_MOYEN?.confiance);
  });

  it('palier UNIQUE → toute lenteur porte cette confiance, quel que soit le dépassement', () => {
    const unique = creerDetecteurLenteur({ ...CONFIG_TEST.lenteur, paliers: [{ ratioMin: 1, confiance: 0.6 }] });
    const durees = [seuil + 1, seuil * 2, seuil * 100];
    const confiances = durees.map((dureeMs) => unique.detecter([reponse({ actionId: 'a1', dureeMs })], contexte([soumission('a1')]))[0]?.confiance);
    expect(confiances).toEqual([0.6, 0.6, 0.6]);
  });

  it('aucun palier satisfait (paliers tous au-dessus du ratio) → le palier le plus bas, jamais rien', () => {
    const exigeant = creerDetecteurLenteur({
      ...CONFIG_TEST.lenteur,
      paliers: [
        { ratioMin: 5, confiance: 0.5 },
        { ratioMin: 10, confiance: 0.9 },
      ],
    });
    expect(exigeant.detecter([reponse({ actionId: 'a1', dureeMs: seuil + 1 })], contexte([soumission('a1')]))[0]?.confiance).toBe(0.5);
  });

  it('le seuil vient de la config reçue', () => {
    const strict = creerDetecteurLenteur({ ...CONFIG_TEST.lenteur, seuilMs: 10 });
    expect(strict.detecter([reponse({ actionId: 'a1', dureeMs: 11 })], contexte([soumission('a1')]))).toHaveLength(1);
  });
});

/**
 * D-LENTEUR est le seul détecteur GRADUÉ : il expose au protocole de
 * confirmation la mesure brute de ses candidates et le seuil auquel la
 * comparer. Le protocole n'a ainsi rien à savoir de la lenteur.
 */
describe('D-LENTEUR — détecteur gradué', () => {
  it('expose le seuil de sa config comme seuilMesure', () => {
    expect(detecteur.seuilMesure).toBe(seuil);
    expect(creerDetecteurLenteur({ ...CONFIG_TEST.lenteur, seuilMs: 42 }).seuilMesure).toBe(42);
  });

  it('mesureDe rend la durée observée de la candidate, réponse reçue comme requête encore en attente', () => {
    const [lente] = detecteur.detecter([reponse({ actionId: 'a1', dureeMs: seuil + 1500 })], contexte([soumission('a1')]));
    expect(lente !== undefined && detecteur.mesureDe?.(lente)).toBe(seuil + 1500);
    const [enAttente] = detecteur.detecter([requeteEnAttente({ actionId: 'a1', attenteMs: seuil + 200 })], contexte([soumission('a1')]));
    expect(enAttente !== undefined && detecteur.mesureDe?.(enAttente)).toBe(seuil + 200);
  });

  it('mesureDe rend la PIRE durée quand le dédoublonnage a fusionné plusieurs preuves', () => {
    const candidates = detecter(
      [reponse({ actionId: 'a1', dureeMs: seuil + 100 }), reponse({ actionId: 'a1', dureeMs: seuil + 9000, viewport: 'mobile' })],
      contexte([soumission('a1')]),
      [detecteur],
    );
    expect(candidates).toHaveLength(1);
    const fusionnee = candidates[0];
    expect(fusionnee !== undefined && detecteur.mesureDe?.(fusionnee)).toBe(seuil + 9000);
  });

  it('mesureDe ne rend rien pour une candidate sans preuve de requête mesurable', () => {
    const [lente] = detecteur.detecter([reponse({ actionId: 'a1', dureeMs: seuil + 1 })], contexte([soumission('a1')]));
    expect(lente !== undefined && detecteur.mesureDe?.({ ...lente, preuves: [] })).toBeUndefined();
  });
});
