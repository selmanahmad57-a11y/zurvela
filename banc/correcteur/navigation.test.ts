/**
 * La notation de la NAVIGATION, éprouvée dans les deux sens.
 *
 * Deux règles portent toute cette famille, et chacune est un refus de
 * flatter :
 *  - une cible MANQUÉE quand on attendait qu'elle le soit est un attendu
 *    SATISFAIT (le prix de la gratuité, la page piège restée dehors) ;
 *  - ce que le banc DEMANDE au moteur (politique, budget) doit être vérifié
 *    dans le rapport, sinon une option muette ferait noter le comportement
 *    par défaut sous l'étiquette de l'autre politique.
 */
import { describe, expect, it } from 'vitest';
import type { ActionExecutee, EntreeJournal, Parcours, Rapport } from '../../core/types.js';
import { POLITIQUE_DETERMINISTE, POLITIQUE_IA, type AttenduCible, type Manifeste, type Scenario } from '../types.js';
import {
  ErreurContrainteNonAppliquee,
  EVENEMENT_DECISION,
  EVENEMENT_POLITIQUE,
  RAISON_BUDGET_NON_APPLIQUE,
  RAISON_CIBLE_POLITIQUE_HORS_ATTENDU,
  RAISON_CIBLE_POLITIQUE_NON_APPLIQUEE,
  RAISON_CIBLE_SANS_PARCOURS,
  RAISON_POLITIQUE_NON_JOURNALISEE,
  RAISON_POLITIQUE_NON_TRANSMISE,
  calculerCouverture,
  ciblesNonMesurees,
  compterReplisDecision,
  noterCibles,
  pagesUtilesDeclarees,
  politiqueAppliquee,
  replisDecisionSubis,
  verifierContraintes,
} from './navigation.js';

const CIBLE = '/devis';
const PIEGE = '/offre-partenaire';

function cible(page: string, atteinteAttendue: Record<string, boolean>, eprouvee = false): AttenduCible {
  return { nature: 'cible', page, atteinteAttendue, eprouvee };
}

function manifeste(attendus: Manifeste['attendus']): Manifeste {
  return { scenarioId: 'test--x--fr', gabarit: 'mini-boutique', langue: 'fr', attendus };
}

function entreePolitique(demandee: string, appliquee: string): EntreeJournal {
  return { horodatage: '2026-09-23T00:00:00.000Z', type: EVENEMENT_POLITIQUE, details: { demandee, appliquee } };
}

/** Une entrée de journal de DÉCISION, avec ou sans repli : la source que le compteur lit. */
function entreeDecision(politique: string, raisonRepli?: string): EntreeJournal {
  return {
    horodatage: '2026-09-23T00:00:00.000Z',
    type: EVENEMENT_DECISION,
    details: { politiqueDemandee: POLITIQUE_IA, politique, ...(raisonRepli === undefined ? {} : { raisonRepli }) },
  };
}

function pageVisitee(url: string, viewport = 'desktop'): Parcours['pages'][number] {
  return { url, viewport, statutHttp: 200, liensInternes: [], formulaires: [], horodatage: '2026-09-23T00:00:00.000Z' };
}

interface OptionsRapport {
  urls?: string[];
  journal?: EntreeJournal[];
  actions?: ActionExecutee[];
  sansParcours?: boolean;
}

function rapport(options: OptionsRapport = {}): Rapport {
  const base: Rapport = {
    url: 'http://127.0.0.1:1',
    anomalies: [],
    coutApi: 0,
    dureeMs: 0,
    journal: options.journal ?? [entreePolitique(POLITIQUE_IA, POLITIQUE_IA)],
  };
  if (options.sansParcours === true) {
    return base;
  }
  return {
    ...base,
    parcours: {
      urlDepart: 'http://127.0.0.1:1/',
      pages: (options.urls ?? ['/']).map((url) => pageVisitee(`http://127.0.0.1:1${url}`)),
      actions: options.actions ?? [],
      arret: 'limite-pages', enAttenteALArret: 0, pagesRestantesALArret: 0,
    },
  };
}

describe('noterCibles — les DEUX sens comptent pareil', () => {
  const attendus = manifeste([
    cible(CIBLE, { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: true }),
    cible(PIEGE, { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: false }),
  ]);

  it('en IA : la cible atteinte et le piège évité sont deux attendus satisfaits', () => {
    const resultats = noterCibles(rapport({ urls: ['/', '/produit/etabli', CIBLE] }), attendus, { demandee: POLITIQUE_IA });
    expect(resultats.map((resultat) => [resultat.attendu.page, resultat.atteinte, resultat.satisfait])).toEqual([
      [CIBLE, true, true],
      [PIEGE, false, true],
    ]);
  });

  it('en déterministe : la cible MANQUÉE est un attendu SATISFAIT — le prix affiché de la gratuité', () => {
    const resultats = noterCibles(rapport({ urls: ['/', '/catalogue', '/livraison'], journal: [entreePolitique(POLITIQUE_DETERMINISTE, POLITIQUE_DETERMINISTE)] }), attendus, {
      demandee: POLITIQUE_DETERMINISTE,
      appliquee: POLITIQUE_DETERMINISTE,
    });
    const commander = resultats.find((resultat) => resultat.attendu.page === CIBLE);
    expect(commander).toMatchObject({ atteinte: false, atteinteAttendue: false, satisfait: true, nonMesure: false });
  });

  it('la cible ATTEINTE alors qu’on ne l’attendait pas n’est PAS satisfaite : la garde peut donc rougir', () => {
    // Si le budget était élargi sans réviser les attendus du gabarit, c'est
    // ainsi que le banc le dirait — au lieu de laisser passer une vérité
    // devenue fausse.
    const resultats = noterCibles(rapport({ urls: ['/', CIBLE], journal: [entreePolitique(POLITIQUE_DETERMINISTE, POLITIQUE_DETERMINISTE)] }), attendus, {
      demandee: POLITIQUE_DETERMINISTE,
      appliquee: POLITIQUE_DETERMINISTE,
    });
    expect(resultats.find((resultat) => resultat.attendu.page === CIBLE)).toMatchObject({ atteinte: true, satisfait: false });
  });

  it('le PIÈGE au parcours n’est pas satisfait, sous l’une comme sous l’autre politique', () => {
    for (const politique of [POLITIQUE_DETERMINISTE, POLITIQUE_IA]) {
      const resultats = noterCibles(rapport({ urls: ['/', PIEGE], journal: [entreePolitique(politique, politique)] }), attendus, {
        demandee: politique,
        appliquee: politique,
      });
      expect(resultats.find((resultat) => resultat.attendu.page === PIEGE)).toMatchObject({ atteinte: true, satisfait: false });
    }
  });

  it('compare les chemins normalisés : une URL absolue du parcours apparie une page déclarée en clair', () => {
    const resultats = noterCibles(rapport({ urls: ['/', `${CIBLE}/`] }), attendus, { demandee: POLITIQUE_IA });
    expect(resultats.find((resultat) => resultat.attendu.page === CIBLE)?.atteinte).toBe(true);
  });
});

describe('noterCibles — rien n’est déduit d’une absence', () => {
  const attendus = manifeste([cible(CIBLE, { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: true })]);

  it('sans parcours, la cible est NON MESURÉE : ni créditée, ni imputée', () => {
    const resultats = noterCibles(rapport({ sansParcours: true }), attendus, { demandee: POLITIQUE_IA });
    expect(resultats[0]).toMatchObject({ nonMesure: true, atteinte: null, satisfait: false, raisonNonMesure: RAISON_CIBLE_SANS_PARCOURS });
  });

  it('quand la politique demandée n’a pas été appliquée, la cible est NON MESURÉE, jamais ratée', () => {
    // Le cas réel : `--sans-ia` ou IA indisponible d'emblée. Noter « cible
    // manquée en IA » imputerait au modèle le résultat de la déterministe.
    const resultats = noterCibles(rapport({ urls: ['/'], journal: [entreePolitique(POLITIQUE_IA, POLITIQUE_DETERMINISTE)] }), attendus, {
      demandee: POLITIQUE_IA,
      appliquee: POLITIQUE_DETERMINISTE,
    });
    expect(resultats[0]).toMatchObject({ nonMesure: true, raisonNonMesure: RAISON_CIBLE_POLITIQUE_NON_APPLIQUEE });
  });

  it('une politique dont l’attendu ne parle pas n’est pas jugée : elle ne dit pas « non », elle ne dit rien', () => {
    const muet = manifeste([cible(CIBLE, { [POLITIQUE_DETERMINISTE]: false })]);
    const resultats = noterCibles(rapport({ urls: ['/'] }), muet, { demandee: POLITIQUE_IA });
    expect(resultats[0]).toMatchObject({ nonMesure: true, raisonNonMesure: RAISON_CIBLE_POLITIQUE_HORS_ATTENDU });
  });

  it('un manifeste sans cible ne produit aucun résultat de cible', () => {
    expect(noterCibles(rapport(), manifeste([]), { demandee: POLITIQUE_IA })).toEqual([]);
    expect(ciblesNonMesurees(manifeste([]), POLITIQUE_IA)).toEqual([]);
  });
});

describe('verifierContraintes — une garantie ne se déclare pas, elle s’éprouve', () => {
  const scenario: Scenario = { id: 'x', gabarit: 'mini-boutique', langue: 'fr', bugsActifs: [], contraintes: { pagesMax: 3 } };

  it('accepte un rapport conforme : politique reçue et budget respecté', () => {
    expect(() => verifierContraintes(rapport({ urls: ['/', '/a', '/b'] }), scenario, POLITIQUE_IA)).not.toThrow();
  });

  it('LÈVE quand la politique demandée n’est pas celle que le moteur a reçue : l’option muette est le défaut à attraper', () => {
    const recuAutre = rapport({ urls: ['/'], journal: [entreePolitique(POLITIQUE_DETERMINISTE, POLITIQUE_DETERMINISTE)] });
    expect(() => verifierContraintes(recuAutre, scenario, POLITIQUE_IA)).toThrow(ErreurContrainteNonAppliquee);
    expect(() => verifierContraintes(recuAutre, scenario, POLITIQUE_IA)).toThrow(RAISON_POLITIQUE_NON_TRANSMISE);
  });

  it('LÈVE quand le moteur a rendu un parcours sans dire quelle politique il appliquait', () => {
    expect(() => verifierContraintes(rapport({ urls: ['/'], journal: [] }), scenario, POLITIQUE_IA)).toThrow(
      RAISON_POLITIQUE_NON_JOURNALISEE,
    );
  });

  it('LÈVE quand le budget de pages n’a pas mordu', () => {
    const trop = rapport({ urls: ['/', '/a', '/b', '/c'] });
    expect(() => verifierContraintes(trop, scenario, POLITIQUE_IA)).toThrow(RAISON_BUDGET_NON_APPLIQUE);
  });

  it('compte le budget PAR VIEWPORT : deux viewports conformes ne s’additionnent pas en dépassement', () => {
    const deuxViewports = rapport();
    const pages = ['/', '/a', '/b'].flatMap((url) => [
      pageVisitee(`http://127.0.0.1:1${url}`, 'desktop'),
      pageVisitee(`http://127.0.0.1:1${url}`, 'mobile'),
    ]);
    const avecDeux: Rapport = { ...deuxViewports, parcours: { ...(deuxViewports.parcours as Parcours), pages } };
    expect(() => verifierContraintes(avecDeux, scenario, POLITIQUE_IA)).not.toThrow();
  });

  it('ne vérifie rien sur un rapport SANS parcours : un sujet qui n’explore pas n’a rien à prouver', () => {
    expect(() => verifierContraintes(rapport({ sansParcours: true, journal: [] }), scenario, POLITIQUE_IA)).not.toThrow();
  });

  it('sans contrainte de budget, seule la politique est vérifiée', () => {
    const sansBudget: Scenario = { id: 'x', gabarit: 'formulaire-contact', langue: 'fr', bugsActifs: [] };
    expect(() => verifierContraintes(rapport({ urls: ['/', '/a', '/b', '/c', '/d'] }), sansBudget, POLITIQUE_IA)).not.toThrow();
  });
});

describe('politiqueAppliquee et replis par décision', () => {
  it('lit la politique appliquée au journal, ou rien si le moteur ne l’a pas dite', () => {
    expect(politiqueAppliquee(rapport({ journal: [entreePolitique(POLITIQUE_IA, POLITIQUE_DETERMINISTE)] }))).toBe(POLITIQUE_DETERMINISTE);
    expect(politiqueAppliquee(rapport({ journal: [] }))).toBeUndefined();
  });

  it('compte les DÉCISIONS tranchées par un repli, et elles seules', () => {
    const journal = [
      entreePolitique(POLITIQUE_IA, POLITIQUE_IA),
      entreeDecision(POLITIQUE_IA),
      entreeDecision(POLITIQUE_DETERMINISTE, 'repli-deterministe'),
      entreeDecision(POLITIQUE_DETERMINISTE, 'action-inconnue'),
    ];
    expect(compterReplisDecision(rapport({ journal }))).toBe(2);
    expect(compterReplisDecision(rapport({ sansParcours: true }))).toBe(0);
  });

  /**
   * LA RÉGRESSION QUE LE COMPTEUR EXISTE POUR EMPÊCHER. Une décision tranchée
   * en `terminer` ne produit AUCUN acte enregistré : le compteur qui lisait
   * `parcours.actions` rendait 0, la garde de statut ne se déclenchait pas, et
   * une cassette de décision retirée laissait le scénario VERT sous
   * l'étiquette « ia ». Lire le journal des décisions le rend visible.
   */
  it('voit un repli qui a tranché un « terminer », alors qu’aucun acte n’en porte la trace', () => {
    const journal = [entreePolitique(POLITIQUE_IA, POLITIQUE_IA), entreeDecision(POLITIQUE_DETERMINISTE, 'cassette-absente')];
    const rapportSansActe = rapport({ journal, actions: [] });
    expect(rapportSansActe.parcours?.actions.filter((a) => a.decision?.raisonRepli !== undefined)).toHaveLength(0);
    expect(compterReplisDecision(rapportSansActe)).toBe(1);
  });

  it('un repli n’est SUBI qu’en régime IA demandé : en déterministe, il n’y a rien à replier', () => {
    expect(replisDecisionSubis(2, POLITIQUE_IA, POLITIQUE_IA)).toBe(2);
    expect(replisDecisionSubis(2, POLITIQUE_DETERMINISTE, POLITIQUE_IA)).toBe(0);
  });
});

describe('couverture du parcours — la jumelle de dépense du coût', () => {
  const attendus = manifeste([
    { nature: 'bug', bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: [CIBLE], gravite: 'bloquant', verdictAttendu: 'confirmee' },
    cible(CIBLE, { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: true }),
    cible(PIEGE, { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: false }),
  ]);

  it('les pages utiles sont celles des bugs et les cibles ATTENDUES de la politique : jamais une page piège', () => {
    expect([...pagesUtilesDeclarees(attendus, POLITIQUE_IA)]).toEqual([CIBLE]);
    // En déterministe, la cible n'est pas attendue : elle ne compte pas dans
    // SON dénominateur — mais la page du bug, si.
    expect([...pagesUtilesDeclarees(attendus, POLITIQUE_DETERMINISTE)]).toEqual([CIBLE]);
  });

  it('mesure pages visitées et pages utiles atteintes', () => {
    const couverture = calculerCouverture(rapport({ urls: ['/', '/produit/etabli', CIBLE] }), attendus, { demandee: POLITIQUE_IA });
    expect(couverture).toEqual({ nbPagesVisitees: 3, nbPagesUtiles: 1, nbPagesUtilesDeclarees: 1 });
  });

  it('un scénario sans page utile déclarée le dit, il ne rend pas une efficacité de zéro', () => {
    const couverture = calculerCouverture(rapport({ urls: ['/', '/a'] }), manifeste([]), { demandee: POLITIQUE_IA });
    expect(couverture).toEqual({ nbPagesVisitees: 2, nbPagesUtiles: 0, nbPagesUtilesDeclarees: 0 });
  });

  it('sans parcours, il n’y a pas de couverture du tout : zéro visitée serait une efficacité inventée', () => {
    expect(calculerCouverture(rapport({ sansParcours: true }), attendus, { demandee: POLITIQUE_IA })).toBeUndefined();
  });

  /**
   * MÊME REFUS QUE LES CIBLES : un parcours entièrement déterministe ne produit
   * pas d'efficacité sous l'étiquette « ia ». Les cibles refusaient déjà de se
   * laisser mesurer dans ce cas ; la couverture le refuse aussi, sans quoi le
   * même `ResultatScenario` déclarerait « rien mesuré » d'un côté et
   * publierait 0 % d'efficacité IA de l'autre.
   */
  it('ne mesure aucune couverture quand la politique appliquée n’est pas celle demandée', () => {
    const journal = [entreePolitique(POLITIQUE_IA, POLITIQUE_DETERMINISTE)];
    expect(
      calculerCouverture(rapport({ urls: ['/', '/a'], journal }), attendus, {
        demandee: POLITIQUE_IA,
        appliquee: POLITIQUE_DETERMINISTE,
      }),
    ).toBeUndefined();
  });
});
