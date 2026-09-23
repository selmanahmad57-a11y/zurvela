/**
 * La commande de variance ne doit JAMAIS publier un accord sur du vide.
 *
 * Sans ce garde-fou, cinq appels muets s'affichaient « 5/5, 1 valeur
 * distincte » avec un code de sortie 0 : l'accord parfait sur le silence.
 * C'est l'apprentissage n°4 (un compteur doit pouvoir révéler qu'il n'a rien
 * mesuré) doublé du n°6 (un diagnostic faux est cru).
 */
import { describe, expect, it } from 'vitest';
import type { ActionExecutee, Rapport } from '../core/types.js';
import { MESURES, accord, estMesure, nbMesuresExploitables, premierActionIdElu } from './variance-ia.js';

const ABSENTE = '—';

describe('variance : mesures exploitables', () => {
  it('ne compte que les appels ayant produit une valeur', () => {
    expect(nbMesuresExploitables([ABSENTE, ABSENTE, ABSENTE, ABSENTE, ABSENTE])).toBe(0);
    expect(nbMesuresExploitables(['vitrine-contact', ABSENTE, 'vitrine-contact'])).toBe(2);
    expect(nbMesuresExploitables(['vitrine-contact', 'boutique'])).toBe(2);
  });

  it('un échantillon entièrement muet a un accord NUMÉRIQUEMENT parfait : c\'est bien pourquoi le compte de mesures est indispensable', () => {
    const muet = [ABSENTE, ABSENTE, ABSENTE, ABSENTE, ABSENTE];
    const resultat = accord(muet);
    expect(resultat.occurrences).toBe(5);
    expect(resultat.distinctes).toBe(1);
    // Le seul chiffre qui distingue ce cas d'une vraie unanimité :
    expect(nbMesuresExploitables(muet)).toBe(0);
  });

  it('un appel muet reste un désaccord, jamais une observation retirée de l\'échantillon', () => {
    const partiel = ['vitrine-contact', 'vitrine-contact', ABSENTE];
    expect(accord(partiel)).toMatchObject({ modalite: 'vitrine-contact', occurrences: 2, total: 3 });
    expect(nbMesuresExploitables(partiel)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// La variance étendue aux DÉCISIONS (brique 4b)
// ---------------------------------------------------------------------------

function action(id: string, decision?: ActionExecutee['decision']): ActionExecutee {
  return {
    id,
    action: { type: 'terminer', raison: 'plus-rien-a-faire' },
    page: 'http://127.0.0.1:1/',
    viewport: 'desktop',
    debut: '2026-09-23T00:00:00.000Z',
    fin: '2026-09-23T00:00:00.000Z',
    resultat: 'ok',
    ...(decision === undefined ? {} : { decision }),
  };
}

function rapportAvec(actions: ActionExecutee[]): Rapport {
  return {
    url: 'http://127.0.0.1:1',
    anomalies: [],
    coutApi: 0,
    dureeMs: 0,
    journal: [],
    parcours: { urlDepart: 'http://127.0.0.1:1/', pages: [], actions, arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 },
  };
}

function provenance(actionId: string): NonNullable<ActionExecutee['decision']> {
  return {
    politique: 'ia',
    provenance: { versionPrompt: 'v1', modeleDemande: 'alias', modeleServi: 'alias-20260101', raison: null, apresRelance: false, actionId },
  };
}

describe('variance des décisions : le premier actionId ÉLU', () => {
  it('connaît les deux mesures, et elles seules', () => {
    expect([...MESURES]).toEqual(['profil', 'decision']);
    expect(estMesure('profil')).toBe(true);
    expect(estMesure('decision')).toBe(true);
    expect(estMesure('deciiision')).toBe(false);
  });

  it('rend l’identifiant élu au premier point de décision du parcours', () => {
    expect(premierActionIdElu(rapportAvec([action('a1', provenance('c2')), action('a2', provenance('c1'))]))).toBe('c2');
  });

  it('IGNORE une action tranchée par le repli déterministe : ce n’est pas une mesure du modèle', () => {
    // Sans cette règle, l'accord publierait la stabilité du repli sous le nom
    // de la stabilité du modèle (APPRENTISSAGES n°6).
    const replie = action('a1', { politique: 'deterministe', raisonRepli: 'repli-deterministe' });
    expect(premierActionIdElu(rapportAvec([replie, action('a2', provenance('c3'))]))).toBe('c3');
    expect(premierActionIdElu(rapportAvec([replie]))).toBeUndefined();
  });

  it('rend undefined sans parcours et sans rapport : la garde du silence prend alors le relais', () => {
    expect(premierActionIdElu(undefined)).toBeUndefined();
    expect(premierActionIdElu({ url: '', anomalies: [], coutApi: 0, dureeMs: 0, journal: [] })).toBeUndefined();
  });

  it('un échantillon de décisions entièrement muet a un accord NUMÉRIQUEMENT parfait : la garde commune est indispensable', () => {
    // Exactement le défaut corrigé pour le profil à la clôture de la 4a. La
    // garde est la MÊME fonction pour les deux mesures, précisément pour
    // qu'un second mode ne puisse pas en diverger.
    const muet = [ABSENTE, ABSENTE, ABSENTE];
    expect(accord(muet).occurrences).toBe(3);
    expect(nbMesuresExploitables(muet)).toBe(0);
    expect(nbMesuresExploitables(['c1', ABSENTE, 'c2'])).toBe(2);
  });
});
