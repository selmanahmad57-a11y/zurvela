import { describe, expect, it } from 'vitest';
import type { ResultatGroupe, TentativeReexecution } from '../../types.js';
import { MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, NOM_AUTO_DIAGNOSTIC_MECANIQUE, autoDiagnosticMecanique } from './auto-diagnostic.js';
import { CONFIG_CONFIRMATION_TEST, candidateSimulee, contexteConfirmation, reexecuteurFactice } from './fabriques-test.js';
import { consolider } from './consolidation.js';

const contexte = contexteConfirmation({ journal: [], reexecuteur: reexecuteurFactice([]), detecteurs: [] });

function tentative(surcharges: Partial<TentativeReexecution>): TentativeReexecution {
  return { numero: 1, viewport: 'desktop', reproduite: false, echecOutillage: false, dureeMs: 10, ...surcharges };
}

function resultat(tentatives: TentativeReexecution[], verdict: ResultatGroupe['verdict']): ResultatGroupe {
  const groupe = consolider([candidateSimulee()])[0];
  if (groupe === undefined) {
    throw new Error('groupe-absent');
  }
  return {
    groupe,
    verdict,
    motif: 'jamais-reproduite',
    tentatives,
    tauxReproduction: 0,
    confianceInitiale: CONFIG_CONFIRMATION_TEST.seuilRetenue,
    confianceFinale: CONFIG_CONFIRMATION_TEST.seuilRetenue,
    coutApi: 0,
  };
}

describe('autoDiagnosticMecanique', () => {
  it('ne coûte rien et porte un nom : c’est le LOGEMENT de l’auto-diagnostic IA', async () => {
    expect(autoDiagnosticMecanique.nom).toBe(NOM_AUTO_DIAGNOSTIC_MECANIQUE);
    const avis = await autoDiagnosticMecanique.diagnostiquer(
      resultat([tentative({ echecOutillage: true, causeEchec: 'outil' })], 'limite-automatisation'),
      contexte,
    );
    expect(avis?.coutApi).toBe(0);
  });

  it('un rejeu PARTIELLEMENT impossible et rien de reproduit : limite-automatisation, pas « non reproduite »', async () => {
    const avis = await autoDiagnosticMecanique.diagnostiquer(
      resultat([tentative({ echecOutillage: true, causeEchec: 'outil', erreur: 'navigateur-perdu' }), tentative({})], 'non-reproduite'),
      contexte,
    );
    expect(avis).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, coutApi: 0 });
  });

  it('n’a PAS d’avis quand une tentative exploitable a reproduit : le constat prime sur l’incident', async () => {
    const avis = await autoDiagnosticMecanique.diagnostiquer(
      resultat([tentative({ echecOutillage: true, causeEchec: 'outil' }), tentative({ reproduite: true })], 'confirmee'),
      contexte,
    );
    expect(avis).toBeNull();
  });

  it('n’a PAS d’avis quand tout s’est bien déroulé : une non-reproduction propre reste une non-reproduction', async () => {
    expect(await autoDiagnosticMecanique.diagnostiquer(resultat([tentative({}), tentative({})], 'non-reproduite'), contexte)).toBeNull();
  });

  it('n’a PAS d’avis quand l’échec vient du SITE : un site muet est un constat, pas une limite d’outil', async () => {
    const avis = await autoDiagnosticMecanique.diagnostiquer(
      resultat([tentative({ echecOutillage: true, causeEchec: 'reseau-site' })], 'non-reproduite'),
      contexte,
    );
    expect(avis).toBeNull();
  });

  it('a un avis quand la cause de l’échec est indéterminée : c’est le client de l’IA de la brique suivante', async () => {
    const avis = await autoDiagnosticMecanique.diagnostiquer(
      resultat([tentative({ echecOutillage: true, causeEchec: 'indetermine' }), tentative({})], 'non-reproduite'),
      contexte,
    );
    expect(avis?.verdict).toBe('limite-automatisation');
  });
});
