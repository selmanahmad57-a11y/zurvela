/**
 * Ce que le protocole doit voir sans l'avoir cherché — et ce qu'il ne doit
 * SURTOUT pas compter deux fois.
 */
import { describe, expect, it } from 'vitest';
import { BOUTON, MOBILE, URL_ACCUEIL, interception, reponse } from '../detection/fabriques-test.js';
import { consolider } from './consolidation.js';
import { MOTIF_CONSTATEE_AU_REJEU, anomalieDecouverte, collecterDecouvertes, estDecouverte, identitesConnues } from './decouvertes.js';
import { candidateSimulee } from './fabriques-test.js';

/** Un groupe d'origine construit à partir d'une candidate du scan. */
function groupeDe(candidate = candidateSimulee()) {
  const [groupe] = consolider([candidate]);
  if (groupe === undefined) {
    throw new Error('groupe-absent');
  }
  return groupe;
}

describe('collecterDecouvertes', () => {
  it('une candidate de cause INCONNUE relevée au rejeu est une découverte', () => {
    const origine = groupeDe();
    const injoignable = candidateSimulee({
      description: 'document-injoignable',
      urlOuEtape: URL_ACCUEIL,
      preuves: [reponse({ urlRessource: URL_ACCUEIL, methode: 'GET', statut: 503 })],
    });
    const decouvertes = collecterDecouvertes([injoignable], [origine]);

    expect(decouvertes).toHaveLength(1);
    expect(decouvertes[0]?.representant).toBe(injoignable);
  });

  it('une candidate de la MÊME cause que le groupe rejoué n’est pas une découverte', () => {
    const origine = groupeDe();
    // C'est exactement ce que la re-exécution venait vérifier : reproduite, pas découverte.
    expect(collecterDecouvertes([candidateSimulee()], [origine])).toEqual([]);
  });

  it('la candidate de la CONTRE-ÉPREUVE (autre viewport) n’est pas une découverte', () => {
    // Sans cette règle, une symétrie inattendue — déjà jugée par la
    // contre-épreuve, avec son malus — serait comptée une seconde fois.
    const surMobile = candidateSimulee({
      detecteur: 'd-recouvrement',
      description: 'clic-intercepte',
      element: BOUTON,
      viewport: MOBILE.nom,
      preuves: [interception({ viewport: MOBILE.nom })],
    });
    const surDesktop = { ...surMobile, viewport: 'desktop' };
    const origine = groupeDe(surMobile);

    expect(identitesConnues([origine]).size).toBeGreaterThan(1);
    expect(estDecouverte(surDesktop, identitesConnues([origine]))).toBe(false);
    expect(collecterDecouvertes([surDesktop], [origine])).toEqual([]);
  });

  it('les découvertes sont consolidées ENTRE ELLES : deux rejeux, une seule cause', () => {
    const origine = groupeDe();
    const premier = candidateSimulee({ preuves: [reponse({ urlRessource: URL_ACCUEIL, methode: 'GET', statut: 503 })] });
    const second = candidateSimulee({ preuves: [reponse({ urlRessource: URL_ACCUEIL, methode: 'GET', statut: 503 })], confiance: 0.9 });
    const decouvertes = collecterDecouvertes([premier, second], [origine]);

    expect(decouvertes).toHaveLength(1);
    expect(decouvertes[0]?.membres).toHaveLength(2);
    // La confiance du groupe reste la plus haute des membres (règle commune de consolidation).
    expect(decouvertes[0]?.confiance).toBe(0.9);
  });

  it('l’anomalie découverte garde la confiance de son détecteur, sans calibration', () => {
    const groupe = groupeDe(candidateSimulee({ confiance: 0.8 }));
    const anomalie = anomalieDecouverte(groupe);

    expect(anomalie).toMatchObject({ verdict: 'confirmee', confiance: 0.8 });
    // Son motif DIT dans le rapport que son statut n'est pas celui d'une
    // anomalie re-confirmée, et sa clé la relie à son groupe de découverte.
    expect(anomalie.motif).toBe(MOTIF_CONSTATEE_AU_REJEU);
    expect(anomalie.groupe).toBe(groupe.cle);
    expect(anomalie.localisations).toEqual(groupe.localisations);
    expect(anomalie.observations).toEqual(groupe.observations);
  });
});
