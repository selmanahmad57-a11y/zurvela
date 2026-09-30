/**
 * LES GESTES DE FERMETURE, un par un (cahier P2-3, contrat 1).
 *
 * Page FACTICE, aucun navigateur : ce qui s'éprouve ici est la DÉCISION —
 * quel geste, dans quel ordre, avec quel filtre, avec quelle trace — et non
 * le comportement d'un vrai moteur de rendu, que le banc mesure.
 *
 * Chaque geste prouve qu'il mord INDIVIDUELLEMENT : une liste dont on
 * retire un geste doit faire échouer le cas qui ne cède qu'à lui. Sans
 * cela, la liste serait verte sans qu'on sache lequel de ses gestes porte
 * (METHODE §10, extension sur la redondance).
 */
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import type { LocalisationElement } from '../../types.js';
import {
  EVENEMENT_FERMETURE_BORNEE,
  EVENEMENT_RECOUVREMENT_ECARTE,
  EVENEMENT_TENTATIVE_FERMETURE,
  GESTES_FERMETURE,
  ecarterRecouvrements,
  type ConfigFermeture,
  type GesteFermeture,
} from './ecarter-recouvrement.js';
import type { PrisesFermeture, Recouvrement, ResultatGeometrie } from './en-page.js';
import type { VerdictFiltre } from './filtre-actions.js';

const CONFIG: ConfigFermeture = {
  gestes: [...GESTES_FERMETURE],
  partMaxSurfaceControle: 0.15,
  partCoin: 0.25,
  delaiApresGesteMs: 0,
  recouvrementsMax: 10,
};

function element(selecteur: string): LocalisationElement {
  return { balise: 'div', selecteur, attributs: {} };
}

function recouvrement(cible: string, intercepteur: string | null): Recouvrement {
  return { element: element(cible), intercepteur: intercepteur === null ? null : element(intercepteur), signatureIntercepteur: null };
}

/** Ce que la page factice sait faire, et ce qui la fait céder. */
interface Scenario {
  /** Le geste qui lève le recouvrement ; null : rien ne le lève. */
  cede: GesteFermeture | null;
  prises?: Partial<PrisesFermeture>;
  /** Verdict du filtre pour le contrôle de fermeture. */
  filtre?: VerdictFiltre;
}

interface Faux {
  page: Page;
  journal: { type: string; details: Record<string, unknown> }[];
  gestesExecutes: string[];
  clics: { x: number; y: number }[];
  appelsFiltre: string[];
}

/**
 * Une page factice : chaque geste est observable, et la géométrie ne change
 * qu'au geste déclaré. Playwright n'est pas monté — seuls les cinq points de
 * contact du module sont fournis.
 */
function fauxContexte(scenario: Scenario, constats: Recouvrement[]): Faux & { executer: () => ReturnType<typeof ecarterRecouvrements> } {
  const faux: Faux = { page: {} as Page, journal: [], gestesExecutes: [], clics: [], appelsFiltre: [] };
  let leve = false;
  const prises: PrisesFermeture = {
    dialogOuvert: scenario.cede === 'dialog-natif',
    controle: scenario.prises?.controle === undefined ? (scenario.cede === 'controle-ferme' ? element('#croix') : null) : scenario.prises.controle,
    pointVide: scenario.prises?.pointVide === undefined ? (scenario.cede === 'clic-hors-zone' ? { x: 5, y: 7 } : null) : scenario.prises.pointVide,
  };
  const noter = (geste: GesteFermeture): void => {
    faux.gestesExecutes.push(geste);
    if (scenario.cede === geste) {
      leve = true;
    }
  };
  faux.page = {
    // Le module parle à la page par `evaluate` et une commande typée : la
    // fausse page répond à la commande, ce qui éprouve le vrai câblage.
    evaluate: (_fn: unknown, commande: { commande: string }) => {
      if (commande.commande === 'prises-fermeture') {
        return Promise.resolve(prises);
      }
      if (commande.commande === 'fermer-dialog') {
        const ouvert = prises.dialogOuvert;
        if (ouvert) {
          noter('dialog-natif');
        }
        return Promise.resolve(ouvert);
      }
      throw new Error(`commande inattendue : ${commande.commande}`);
    },
    keyboard: {
      press: (touche: string) => {
        expect(touche).toBe('Escape');
        noter('echap');
        return Promise.resolve();
      },
    },
    mouse: {
      click: (x: number, y: number) => {
        faux.clics.push({ x, y });
        noter('clic-hors-zone');
        return Promise.resolve();
      },
    },
    click: (selecteur: string) => {
      expect(selecteur).toBe('#croix');
      noter('controle-ferme');
      return Promise.resolve();
    },
  } as unknown as Page;

  const geometrie: ResultatGeometrie = { recouvrements: [], tronque: false, examines: 0 };
  return {
    ...faux,
    executer: () =>
      ecarterRecouvrements({
        page: faux.page,
        constats,
        config: CONFIG,
        filtreElement: (selecteur) => {
          faux.appelsFiltre.push(selecteur);
          return Promise.resolve(scenario.filtre ?? { autorisee: true });
        },
        delaiMs: 100,
        geometrie: { max: 10, budgetMs: 100 },
        journaliser: (type, details) => faux.journal.push({ type, details: (details ?? {}) as Record<string, unknown> }),
        attendre: () => Promise.resolve(),
        mesurer: () => Promise.resolve(leve ? { ...geometrie } : { ...geometrie, recouvrements: constats }),
      }),
  };
}

describe('ecarterRecouvrements — chaque geste mord, individuellement', () => {
  for (const geste of GESTES_FERMETURE) {
    it(`« ${geste} » écarte le recouvrement qui ne cède qu'à lui, et le journal le dit`, async () => {
      const constats = [recouvrement('#cible', '#bandeau')];
      const faux = fauxContexte({ cede: geste }, constats);
      const issue = await faux.executer();
      expect(issue.restants).toEqual([]);
      expect(issue.nbEcartes).toBe(1);
      expect(faux.gestesExecutes).toContain(geste);
      expect(faux.journal.some((e) => e.type === EVENEMENT_RECOUVREMENT_ECARTE && e.details['geste'] === geste)).toBe(true);
    });

    it(`sans « ${geste} » dans la liste, ce même recouvrement n'est PLUS écarté`, async () => {
      // LA MUTATION, une par geste : retirer un geste doit faire échouer son
      // cas et lui seul. C'est ce qui interdit à la liste d'être verte sans
      // qu'on sache lequel de ses gestes porte.
      const constats = [recouvrement('#cible', '#bandeau')];
      const faux = fauxContexte({ cede: geste }, constats);
      const sansCeGeste: ConfigFermeture = { ...CONFIG, gestes: GESTES_FERMETURE.filter((autre) => autre !== geste) };
      const issue = await ecarterRecouvrements({
        page: faux.page,
        constats,
        config: sansCeGeste,
        filtreElement: () => Promise.resolve({ autorisee: true }),
        delaiMs: 100,
        geometrie: { max: 10, budgetMs: 100 },
        journaliser: () => undefined,
        attendre: () => Promise.resolve(),
        mesurer: () => Promise.resolve({ recouvrements: constats, tronque: false, examines: 0 }),
      });
      expect(issue.nbEcartes).toBe(0);
      expect(issue.restants).toEqual(constats);
    });
  }
});

describe('les gardes de sécurité du geste', () => {
  it('le filtre d’actions destructives REFUSE le contrôle de fermeture : aucun clic, et le motif au journal', async () => {
    // Un geste choisi par le CODE n'échappe pas au filtre parce qu'aucun
    // modèle ne l'a demandé (constitution §3, clause du 2026-09-30). Le
    // contrôle qui peut échouer : sauter le filtre pour un geste « interne ».
    const constats = [recouvrement('#cible', '#bandeau')];
    const faux = fauxContexte(
      { cede: 'controle-ferme', filtre: { autorisee: false, canal: 'texte', categorie: 'engagement', langue: 'fr', motif: 'abonn' } },
      constats,
    );
    const issue = await faux.executer();
    expect(faux.appelsFiltre).toEqual(['#croix']);
    // Le clic n'a PAS eu lieu, et le recouvrement reste donc à juger.
    expect(faux.gestesExecutes).not.toContain('controle-ferme');
    expect(issue.restants).toEqual(constats);
    const refus = faux.journal.find((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['issue'] === 'interdite');
    expect(refus?.details).toMatchObject({ geste: 'controle-ferme', cible: '#croix', motif: 'abonn' });
  });

  it('aucun point vide sûr : le clic hors zone est INDISPONIBLE — jamais un clic au hasard (D3)', async () => {
    const constats = [recouvrement('#cible', '#bandeau')];
    const faux = fauxContexte({ cede: null, prises: { pointVide: null } }, constats);
    await faux.executer();
    expect(faux.clics).toEqual([]);
    expect(
      faux.journal.some((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['geste'] === 'clic-hors-zone' && e.details['issue'] === 'indisponible'),
    ).toBe(true);
  });

  it('le clic hors zone JOURNALISE son point : une relecture doit pouvoir vérifier qu’il n’a rien activé', async () => {
    const faux = fauxContexte({ cede: 'clic-hors-zone' }, [recouvrement('#cible', '#bandeau')]);
    await faux.executer();
    expect(faux.clics).toEqual([{ x: 5, y: 7 }]);
    const trace = faux.journal.find((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['geste'] === 'clic-hors-zone');
    expect(trace?.details['point']).toEqual({ x: 5, y: 7 });
  });

  it('un geste exécuté qui ne lève RIEN est « sans-effet », pas « écarté » : c’est la page qui tranche, pas le geste', async () => {
    const constats = [recouvrement('#cible', '#bandeau')];
    const faux = fauxContexte({ cede: null }, constats);
    const issue = await faux.executer();
    // Échap s'exécute toujours ; la re-mesure dit que rien n'a bougé.
    expect(faux.gestesExecutes).toContain('echap');
    expect(issue.nbEcartes).toBe(0);
    expect(issue.restants).toEqual(constats);
    expect(faux.journal.some((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['issue'] === 'sans-effet')).toBe(true);
    expect(faux.journal.some((e) => e.type === EVENEMENT_RECOUVREMENT_ECARTE)).toBe(false);
  });

  it('la borne de dépense est DÉCLARÉE : au-delà, les restants sont jugés sans avoir été tentés', async () => {
    // Une borne silencieuse serait un angle mort : le rapport publierait des
    // recouvrements « non écartables » qu'on n'a jamais tenté d'écarter.
    const constats = [recouvrement('#a', '#b1'), recouvrement('#c', '#b2'), recouvrement('#d', '#b3')];
    const faux = fauxContexte({ cede: null }, constats);
    const issue = await ecarterRecouvrements({
      page: faux.page,
      constats,
      config: { ...CONFIG, recouvrementsMax: 2 },
      filtreElement: () => Promise.resolve({ autorisee: true }),
      delaiMs: 100,
      geometrie: { max: 10, budgetMs: 100 },
      journaliser: (type, details) => faux.journal.push({ type, details: (details ?? {}) as Record<string, unknown> }),
      attendre: () => Promise.resolve(),
      mesurer: () => Promise.resolve({ recouvrements: constats, tronque: false, examines: 0 }),
    });
    expect(issue.restants).toEqual(constats);
    expect(faux.journal.find((e) => e.type === EVENEMENT_FERMETURE_BORNEE)?.details).toMatchObject({ intercepteurs: 3, tentes: 2 });
  });

  it('un geste que la config nomme mais que le code ne connaît pas n’est JAMAIS tenté', async () => {
    // L'ensemble des gestes est un invariant de sécurité : il vit en code.
    // Le contrôle qui peut échouer : un module qui exécuterait ce que la
    // config lui dicte.
    const constats = [recouvrement('#cible', '#bandeau')];
    const faux = fauxContexte({ cede: 'echap' }, constats);
    const issue = await ecarterRecouvrements({
      page: faux.page,
      constats,
      config: { ...CONFIG, gestes: ['ouvrir-le-coffre' as unknown as GesteFermeture] },
      filtreElement: () => Promise.resolve({ autorisee: true }),
      delaiMs: 100,
      geometrie: { max: 10, budgetMs: 100 },
      journaliser: (type, details) => faux.journal.push({ type, details: (details ?? {}) as Record<string, unknown> }),
      attendre: () => Promise.resolve(),
      mesurer: () => Promise.resolve({ recouvrements: constats, tronque: false, examines: 0 }),
    });
    expect(faux.gestesExecutes).toEqual([]);
    expect(issue.nbEcartes).toBe(0);
  });
});
