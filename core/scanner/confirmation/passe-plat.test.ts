import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate, ContexteConfirmation, EntreeJournal } from '../../types.js';
import { NOM_PROTOCOLE_PASSE_PLAT, protocolePassePlat } from './passe-plat.js';

const PAGE = 'http://127.0.0.1:4800/contact';
const VIEWPORT = { nom: 'desktop', largeur: 1280, hauteur: 800, mobile: false };

function candidate(confiance: number, description: string): AnomalieCandidate {
  return {
    categorie: 'fonctionnel',
    description,
    urlOuEtape: PAGE,
    graviteEstimee: 'bloquant',
    confiance,
    detecteur: 'd-test',
    reproduction: { url: PAGE, viewport: VIEWPORT, action: null, actionsPrealables: [] },
    preuves: [],
  };
}

function contexte(journal: EntreeJournal[]): ContexteConfirmation {
  return {
    urlDepart: 'http://127.0.0.1:4800',
    options: { timeoutMs: 1000 },
    echeance: Date.now() + 1000,
    journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
  };
}

describe('protocolePassePlat', () => {
  it('retient toutes les candidates telles quelles, n’en écarte aucune et ne coûte rien', async () => {
    const candidates = [candidate(0.4, 'element-sans-effet'), candidate(0.95, 'reponse-5xx')];
    const journal: EntreeJournal[] = [];

    const resultat = await protocolePassePlat.confirmer(candidates, contexte(journal));

    expect(protocolePassePlat.nom).toBe(NOM_PROTOCOLE_PASSE_PLAT);
    expect(resultat.retenues).toEqual(candidates);
    expect(resultat.retenues.map((anomalie) => anomalie.confiance)).toEqual([0.4, 0.95]);
    expect(resultat.ecartees).toEqual([]);
    expect(resultat.coutApi).toBe(0);
    // La liste rendue est distincte de celle reçue : le protocole ne partage pas son tableau avec l'appelant.
    expect(resultat.retenues).not.toBe(candidates);
  });

  it('journalise confirmation.passe-plat avec le nombre de candidates, même sans candidate', async () => {
    const journal: EntreeJournal[] = [];
    const resultat = await protocolePassePlat.confirmer([], contexte(journal));
    expect(resultat).toEqual({ retenues: [], ecartees: [], coutApi: 0 });
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ type: 'confirmation.passe-plat', details: { nbCandidates: 0, nbRetenues: 0 } });
  });
});
