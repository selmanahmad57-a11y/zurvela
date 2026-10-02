/**
 * LE PLAFOND DE DÉPENSE, ET SA BORNE EXACTE.
 *
 * Ce que ces contrôles tiennent : aucun scan ne dépense au-delà du plafond
 * plus le coût d'UN appel en vol — la borne annoncée, et pas une borne plus
 * flatteuse. Et un dépassement ne tue jamais le scan : il le dégrade, en le
 * disant.
 */
import { describe, expect, it } from 'vitest';
import type { ClientIa, ResultatIa } from './index.js';
import { EVENEMENT_BUDGET_DEPASSE, RAISON_BUDGET_DEPASSE, creerBudgetScan } from './plafond.js';

/** Client dont chaque appel coûte `cout`, quelle que soit la surface. */
function clientQuiFacture(cout: number): ClientIa & { appels: string[] } {
  const appels: string[] = [];
  const reponse = <T>(surface: string, valeur: T): Promise<ResultatIa<T>> => {
    appels.push(surface);
    return Promise.resolve({ disponible: true, valeur, coutApi: cout });
  };
  return {
    appels,
    mode: 'actif',
    raisonDegrade: null,
    profiler: () => reponse('profilage', {} as never),
    cleDecision: () => null,
    decider: () => reponse('navigation', {} as never),
    diagnostiquer: () => reponse('diagnostic', {} as never),
    rediger: () => reponse('redaction', {} as never),
  } as ClientIa & { appels: string[] };
}

function journalDe(): { journaliser: (type: string, details?: unknown) => void; entrees: { type: string; details?: unknown }[] } {
  const entrees: { type: string; details?: unknown }[] = [];
  return { entrees, journaliser: (type, details) => entrees.push({ type, details }) };
}

/** Ouvre la portée d'un scan et rend le client plafonné, prêt à l'emploi. */
function ouvrir(portee: ReturnType<typeof creerBudgetScan>, journaliser: (type: string, details?: unknown) => void): ClientIa {
  portee.ouvrirScan(journaliser);
  return portee.client;
}

describe('creerClientPlafonne', () => {
  it('SANS plafond, le client passe tel quel : aucun compteur, aucune indirection', () => {
    // C'est l'état du banc, dont le coût est MESURÉ et non borné : un plafond
    // y fausserait la mesure.
    const client = clientQuiFacture(1);
    expect(creerBudgetScan(client, null).client).toBe(client);
  });

  it('laisse passer tant que le cumul est sous le plafond', async () => {
    const client = clientQuiFacture(0.01);
    const plafonne = ouvrir(creerBudgetScan(client, 0.05), () => undefined);
    for (let appel = 0; appel < 4; appel += 1) {
      expect((await plafonne.profiler({} as never)).disponible).toBe(true);
    }
    expect(client.appels).toHaveLength(4);
  });

  it('INVARIANT : la dépense ne dépasse jamais le plafond plus le coût d’UN appel', async () => {
    // La borne annoncée, et pas une plus flatteuse : un appel ne déclare son
    // coût qu'une fois terminé, donc on ne peut pas savoir avant de le lancer
    // s'il fera franchir la ligne.
    const COUT = 0.03;
    const PLAFOND = 0.1;
    const client = clientQuiFacture(COUT);
    const plafonne = ouvrir(creerBudgetScan(client, PLAFOND), () => undefined);
    for (let appel = 0; appel < 50; appel += 1) {
      await plafonne.decider({} as never);
    }
    const depense = client.appels.length * COUT;
    expect(depense).toBeLessThanOrEqual(PLAFOND + COUT);
    // Et il a bien dépensé : un plafond qui bloque tout n'est pas un plafond.
    expect(depense).toBeGreaterThan(0);
  });

  it('au dépassement, il DÉGRADE et n’arrête rien : les appels suivants répondent, indisponibles', async () => {
    const client = clientQuiFacture(0.2);
    const journal = journalDe();
    const plafonne = ouvrir(creerBudgetScan(client, 0.1), journal.journaliser);

    const premier = await plafonne.profiler({} as never);
    expect(premier.disponible).toBe(true);

    const suivant = await plafonne.rediger({} as never);
    expect(suivant).toMatchObject({ disponible: false, raison: RAISON_BUDGET_DEPASSE, coutApi: 0 });
    // Tuer le scan transformerait une limite de coût en perte totale du
    // travail déjà payé.
    expect(client.appels).toEqual(['profilage']);
  });

  it('chaque refus est JOURNALISÉ avec son cumul et son plafond : une absence subie, jamais silencieuse', async () => {
    const journal = journalDe();
    const plafonne = ouvrir(creerBudgetScan(clientQuiFacture(0.2), 0.1), journal.journaliser);
    await plafonne.profiler({} as never);
    await plafonne.diagnostiquer({} as never);
    const refus = journal.entrees.filter((entree) => entree.type === EVENEMENT_BUDGET_DEPASSE);
    expect(refus).toHaveLength(1);
    expect(refus[0]?.details).toMatchObject({ surface: 'diagnostic', depense: 0.2, plafond: 0.1 });
  });

  it('compte le coût d’un appel qui a ÉCHOUÉ après avoir dépensé', async () => {
    // Une relance dont la seconde réponse est encore hors contrat a coûté deux
    // appels et n'a rien produit. Un coût invisible ment (APPRENTISSAGES n°3).
    const cher: ClientIa = {
      mode: 'actif',
      raisonDegrade: null,
      profiler: async () => ({ disponible: false, raison: 'hors-contrat', coutApi: 0.5 }),
      cleDecision: () => null,
      decider: async () => ({ disponible: true, valeur: {} as never, coutApi: 0 }),
      diagnostiquer: async () => ({ disponible: false, raison: 'hors-sujet' }),
      rediger: async () => ({ disponible: false, raison: 'hors-sujet' }),
    };
    const journal = journalDe();
    const plafonne = ouvrir(creerBudgetScan(cher, 0.1), journal.journaliser);
    await plafonne.profiler({} as never);
    expect((await plafonne.decider({} as never)).disponible).toBe(false);
  });

  it('le plafond porte sur TOUTES les surfaces ensemble, pas sur chacune', async () => {
    // Quatre surfaces avec chacune son plafond feraient quatre fois le budget.
    const client = clientQuiFacture(0.06);
    const plafonne = ouvrir(creerBudgetScan(client, 0.1), () => undefined);
    await plafonne.profiler({} as never);
    await plafonne.decider({} as never);
    expect((await plafonne.diagnostiquer({} as never)).disponible).toBe(false);
    expect((await plafonne.rediger({} as never)).disponible).toBe(false);
    expect(client.appels).toEqual(['profilage', 'navigation']);
  });
});
