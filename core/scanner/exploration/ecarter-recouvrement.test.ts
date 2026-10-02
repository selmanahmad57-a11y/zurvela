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
import { creerMemoireFermeture, EVENEMENT_MEMOIRE_FERMETURE, type MemoireLiee } from './memoire-fermeture.js';
import type { VerdictFiltre } from './filtre-actions.js';

const CONFIG: ConfigFermeture = {
  gestes: [...GESTES_FERMETURE],
  partMaxSurfaceControle: 0.15,
  partCoin: 0.25,
  delaiApresGesteMs: 0,
  recouvrementsMax: 10,
  descendantsEssayesMax: 12,
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
  /** Le délai accordé à chaque clic : un ESSAI n'est pas une attente. */
  delaisClic: number[];
  appelsFiltre: string[];
}

/**
 * Une page factice : chaque geste est observable, et la géométrie ne change
 * qu'au geste déclaré. Playwright n'est pas monté — seuls les cinq points de
 * contact du module sont fournis.
 */
function fauxContexte(
  scenario: Scenario,
  constats: Recouvrement[],
  memoire?: MemoireLiee,
): Faux & { executer: () => ReturnType<typeof ecarterRecouvrements> } {
  const faux: Faux = { page: {} as Page, journal: [], gestesExecutes: [], clics: [], delaisClic: [], appelsFiltre: [] };
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
      if (commande.commande === 'descendants-activables') {
        // La voie C : la page offre un descendant, et c'est son ACTIVATION
        // qui décidera — rien dans ce descendant ne le désigne.
        return Promise.resolve(scenario.cede === 'descendant-essaye' ? [element('#ferme')] : []);
      }
      if (commande.commande === 'empreinte-page') {
        return Promise.resolve({ url: 'http://exemple.invalid/', present: !leve, nbFormulaires: 1 });
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
    click: (selecteur: string, options?: { timeout?: number }) => {
      faux.delaisClic.push(options?.timeout ?? Number.NaN);
      if (selecteur === '#ferme') {
        noter('descendant-essaye');
        return Promise.resolve();
      }
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
        clicMs: 30,
        ...(memoire === undefined ? {} : { memoire }),
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
        clicMs: 30,
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
      clicMs: 30,
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
      clicMs: 30,
      geometrie: { max: 10, budgetMs: 100 },
      journaliser: (type, details) => faux.journal.push({ type, details: (details ?? {}) as Record<string, unknown> }),
      attendre: () => Promise.resolve(),
      mesurer: () => Promise.resolve({ recouvrements: constats, tronque: false, examines: 0 }),
    });
    expect(faux.gestesExecutes).toEqual([]);
    expect(issue.nbEcartes).toBe(0);
  });
});

describe('la voie C — essayer, pas reconnaître : ses trois gardes', () => {
  /** Une page qui offre plusieurs descendants, dont un seul ferme. */
  function pageVoieC(options: {
    candidats: string[];
    quiFerme: string | null;
    refuses?: string[];
    effetDeBord?: boolean;
  }): { page: Page; clics: string[]; journal: { type: string; details: Record<string, unknown> }[]; executer: () => ReturnType<typeof ecarterRecouvrements> } {
    const clics: string[] = [];
    const journal: { type: string; details: Record<string, unknown> }[] = [];
    let present = true;
    let url = 'http://exemple.invalid/';
    const page = {
      evaluate: (_fn: unknown, commande: { commande: string }) => {
        if (commande.commande === 'descendants-activables') {
          return Promise.resolve(options.candidats.map((selecteur) => element(selecteur)));
        }
        if (commande.commande === 'empreinte-page') {
          return Promise.resolve({ url, present, nbFormulaires: 1 });
        }
        return Promise.resolve(commande.commande === 'fermer-dialog' ? false : { dialogOuvert: false, controle: null, pointVide: null });
      },
      keyboard: { press: () => Promise.resolve() },
      mouse: { click: () => Promise.resolve() },
      click: (selecteur: string) => {
        clics.push(selecteur);
        if (selecteur === options.quiFerme) {
          present = false;
          if (options.effetDeBord === true) {
            url = 'http://exemple.invalid/ailleurs';
          }
        }
        return Promise.resolve();
      },
    } as unknown as Page;
    const constats = [recouvrement('#cible', '#bandeau')];
    return {
      page,
      clics,
      journal,
      executer: () =>
        ecarterRecouvrements({
          page,
          constats,
          config: { ...CONFIG, gestes: ['descendant-essaye'] },
          filtreElement: (selecteur) =>
            Promise.resolve(
              (options.refuses ?? []).includes(selecteur)
                ? { autorisee: false, canal: 'texte', categorie: 'destruction', langue: 'fr', motif: 'suppr' }
                : { autorisee: true },
            ),
          delaiMs: 100,
          clicMs: 30,
          geometrie: { max: 10, budgetMs: 100 },
          journaliser: (type, details) => journal.push({ type, details: (details ?? {}) as Record<string, unknown> }),
          attendre: () => Promise.resolve(),
          mesurer: () => Promise.resolve({ recouvrements: present ? constats : [], tronque: false, examines: 0 }),
        }),
    };
  }

  it('trouve le contrôle de fermeture SANS le reconnaître : il essaie, et garde celui qui ferme', async () => {
    // Le cas the-internet : un `<p>Close</p>` sans rôle, sans ARIA, pleine
    // largeur. Aucune des quatre premières prises ne le voit. La voie C le
    // trouve en l'activant — et elle traiterait de même un « Später », un
    // « 关闭 » ou une icône muette : aucune langue n'est lue.
    const faux = pageVoieC({ candidats: ['#titre', '#texte', '#p-close'], quiFerme: '#p-close' });
    const issue = await faux.executer();
    expect(issue.nbEcartes).toBe(1);
    expect(faux.clics).toEqual(['#titre', '#texte', '#p-close']);
    expect(faux.journal.some((e) => e.type === EVENEMENT_RECOUVREMENT_ECARTE && e.details['geste'] === 'descendant-essaye')).toBe(true);
  });

  it('GARDE 1 — le filtre destructif passe sur CHAQUE candidat : un « supprimer » n’est jamais essayé', async () => {
    // Le contrôle qui peut échouer : n'appliquer le filtre qu'au geste
    // final. Ici le candidat refusé est AVANT celui qui ferme, donc un
    // code qui ne filtrerait pas le cliquerait.
    const faux = pageVoieC({ candidats: ['#supprimer', '#p-close'], quiFerme: '#p-close', refuses: ['#supprimer'] });
    const issue = await faux.executer();
    expect(faux.clics).toEqual(['#p-close']);
    expect(issue.nbEcartes).toBe(1);
  });

  it('GARDE 2 — un essai qui ferme MAIS navigue n’est pas un écartement : on ne le revendique pas', async () => {
    // « Écarté » = le recouvrement a disparu ET rien d'autre n'a changé.
    // Un clic qui ferme en naviguant est une action aux conséquences.
    const faux = pageVoieC({ candidats: ['#lien'], quiFerme: '#lien', effetDeBord: true });
    const issue = await faux.executer();
    expect(issue.nbEcartes).toBe(0);
    const trace = faux.journal.find((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['geste'] === 'descendant-essaye');
    expect(trace?.details).toMatchObject({ issue: 'sans-effet', motif: 'effet-de-bord' });
  });

  it('GARDE 3 — aucun candidat ne ferme : le recouvrement reste, et rien n’est revendiqué', async () => {
    const faux = pageVoieC({ candidats: ['#a', '#b'], quiFerme: null });
    const issue = await faux.executer();
    expect(faux.clics).toEqual(['#a', '#b']);
    expect(issue.nbEcartes).toBe(0);
    expect(issue.restants).toHaveLength(1);
  });

  it('journalise combien de candidats ont été proposés, refusés, activés', async () => {
    // LE DÉFAUT QUE LE RÉEL A MONTRÉ : sur the-internet, le journal disait
    // `indisponible` sans dire si c'était « aucun candidat » ou « douze
    // essayés, aucun n'a fermé ». Les deux appellent des corrections
    // opposées, et rien ne permettait de trancher. Un moteur qui agit sans
    // laisser trace de ce qu'il a fait n'est pas relisible
    // (constitution §3).
    const faux = pageVoieC({ candidats: ['#a', '#supprimer', '#b'], quiFerme: null, refuses: ['#supprimer'] });
    await faux.executer();
    const trace = faux.journal.find((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['geste'] === 'descendant-essaye');
    expect(trace?.details['issue']).toBe('indisponible');
    expect(trace?.details['essais']).toEqual({ candidats: 3, refuses: 1, actives: 2 });
  });

  it('distingue « aucun candidat » de « des candidats, mais aucun ne ferme »', async () => {
    const vide = pageVoieC({ candidats: [], quiFerme: null });
    await vide.executer();
    const trace = vide.journal.find((e) => e.type === EVENEMENT_TENTATIVE_FERMETURE && e.details['geste'] === 'descendant-essaye');
    expect(trace?.details['essais']).toEqual({ candidats: 0, refuses: 0, actives: 0 });
  });
});

describe('le délai d’un essai (correction du coût de fermeture au rejeu, cahier P2-4)', () => {
  // Le défaut mesuré : les clics d'essai étaient bornés par le budget
  // d'ÉVALUATION (15 s en production). Trois descendants qui ne deviennent
  // jamais actionnables faisaient 45 s, le rejeu tombait en budget
  // insuffisant, et une anomalie RÉELLE était perdue — `calque-au-rejeu`
  // sortait en `limite-automatisation` au lieu de confirmer.
  //
  // Le contrôle qui peut échouer : quelqu'un repasse `delaiMs` au clic.
  it('borne le clic par `clicMs`, jamais par le budget d’évaluation', async () => {
    const contexte = fauxContexte({ cede: 'controle-ferme' }, [recouvrement('#cible', '#voile')]);
    await contexte.executer();
    expect(contexte.delaisClic.length).toBeGreaterThan(0);
    for (const delai of contexte.delaisClic) {
      expect(delai).toBe(30);
    }
  });

  it('borne aussi le clic de la voie C, celle qui a coûté les 45 secondes', async () => {
    const contexte = fauxContexte({ cede: 'descendant-essaye', prises: { controle: null } }, [recouvrement('#cible', '#voile')]);
    await contexte.executer();
    expect(contexte.gestesExecutes).toContain('descendant-essaye');
    for (const delai of contexte.delaisClic) {
      expect(delai).toBe(30);
    }
  });
});

describe('la MÉMOIRE de fermeture — le scan apprend, le rejeu se souvient (cahier P2-4)', () => {
  /** Le recouvrement du cas : un intercepteur avec sa signature stable. */
  function constat(): Recouvrement {
    return { element: element('#cible'), intercepteur: element('#voile'), signatureIntercepteur: 'div|voile|' };
  }

  it('un recouvrement CONNU SANS PRISE ne coûte plus un seul geste — c’est le cas qui paie', () => {
    // Mesuré : 4 006 ms par rejeu concerné, dont 6 034 ms pour la seule
    // voie C et ses trois candidats morts sur `recouvrement--q10`.
    const memoire = creerMemoireFermeture().pour('http://x.invalid/', 'desktop');
    memoire.retenir('div|voile|', { aucunGeste: true });
    const contexte = fauxContexte({ cede: null }, [constat()], memoire);
    return contexte.executer().then((issue) => {
      expect(contexte.gestesExecutes).toEqual([]);
      expect(issue.nbEcartes).toBe(0);
      expect(issue.restants).toHaveLength(1);
      expect(contexte.journal.some((e) => e.type === EVENEMENT_MEMOIRE_FERMETURE && e.details.issue === 'connu-sans-prise')).toBe(true);
    });
  });

  it('un geste MÉMORISÉ passe en tête : un seul geste au lieu de la séquence', async () => {
    const memoire = creerMemoireFermeture().pour('http://x.invalid/', 'desktop');
    memoire.retenir('div|voile|', { geste: 'clic-hors-zone' });
    const contexte = fauxContexte({ cede: 'clic-hors-zone' }, [constat()], memoire);
    await contexte.executer();
    expect(contexte.gestesExecutes).toEqual(['clic-hors-zone']);
  });

  it('UNE ABSENCE DE SOUVENIR N’EST PAS UN SOUVENIR D’ABSENCE — la garde cardinale (F3)', async () => {
    // LE CONTRÔLE QUI PEUT ÉCHOUER, et le plus grave : traiter une
    // signature inconnue comme « rien ne ferme ». Un calque qui n'apparaît
    // QU'AU rejeu — `calque-au-rejeu`, les iframes publicitaires chargées
    // tard — serait alors publié « non écartable » sans qu'on ait essayé.
    const memoire = creerMemoireFermeture().pour('http://x.invalid/', 'desktop');
    memoire.retenir('UNE-AUTRE-SIGNATURE', { aucunGeste: true });
    const contexte = fauxContexte({ cede: 'echap' }, [constat()], memoire);
    const issue = await contexte.executer();
    expect(contexte.gestesExecutes).toContain('echap');
    expect(issue.nbEcartes).toBe(1);
  });

  it('UN SOUVENIR EST UN RACCOURCI, JAMAIS UNE AUTORITÉ (F4) : le geste mémorisé échoue, la séquence reprend', async () => {
    const memoire = creerMemoireFermeture().pour('http://x.invalid/', 'desktop');
    memoire.retenir('div|voile|', { geste: 'clic-hors-zone' });
    // La page ne cède en réalité qu'à Échap : le souvenir est périmé.
    const contexte = fauxContexte({ cede: 'echap', prises: { pointVide: { x: 5, y: 7 } } }, [constat()], memoire);
    const issue = await contexte.executer();
    expect(contexte.gestesExecutes[0]).toBe('clic-hors-zone');
    expect(contexte.gestesExecutes).toContain('echap');
    expect(issue.nbEcartes).toBe(1);
  });

  it('le scan RETIENT ce qu’il a appris, dans les deux sens', async () => {
    const pleine = creerMemoireFermeture();
    const liee = pleine.pour('http://x.invalid/', 'desktop');
    await fauxContexte({ cede: 'echap' }, [constat()], liee).executer();
    expect(liee.consulter('div|voile|')).toEqual({ geste: 'echap' });

    const vide = creerMemoireFermeture();
    const lieeVide = vide.pour('http://x.invalid/', 'desktop');
    await fauxContexte({ cede: null }, [constat()], lieeVide).executer();
    expect(lieeVide.consulter('div|voile|')).toEqual({ aucunGeste: true });
  });
});
