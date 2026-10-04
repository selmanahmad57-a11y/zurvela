/**
 * Témoin du cahier P2-8 (sélecteur publié d'une cause), sur le banc, vrai
 * navigateur. Le moteur publiait le sélecteur INTERNE (positionnel, ou id
 * volatile) comme adresse ; il résout au scan, plus à la vue (DOM régénéré).
 *
 * TROIS FACES, reproduites sans contrefaçon (garde C1) :
 *  (a) Q11 — classe distinctive stable + position volatile → il EXISTE une
 *      ancre ; le fix la publie (`.bandeau-temoin`), elle résout.
 *  (b) Q12 — id volatile, aucune classe → PAS d'ancre ; le fix RENONCE (`null`),
 *      jamais une fausse adresse de repli.
 *  (c) Q13 — id STABLE à suffixe numérique (`#promo-7`, résout vraiment), aucune
 *      classe → RENONCÉ PAR COHÉRENCE : on ne distingue pas un suffixe numérique
 *      stable d'un volatil sur un instantané, donc on les traite pareil.
 *
 * GARDE CARDINALE DOUBLE : l'adresse publiée résout sur un chargement régénéré,
 * OU est explicitement absente (`null`). Jamais une adresse qui ne résout pas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { recouvrement } from '../../../banc/gabarits/recouvrement/index.js';
import { CLASSE_BANDEAU_TEMOIN } from '../../../banc/gabarits/recouvrement/bugs/q11-calque-position-volatile.js';
import { PREFIXE_ID_VOLATILE } from '../../../banc/gabarits/recouvrement/bugs/q12-calque-sans-ancre.js';
import { ID_SUFFIXE_NUMERIQUE } from '../../../banc/gabarits/recouvrement/bugs/q13-id-suffixe-numerique.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ServeurScenario } from '../../../banc/types.js';
import type { AnomalieCandidate, LocalisationElement, Parcours } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { creerDetecteurs, detecter } from './index.js';
import { DESCRIPTION_CLIC_INTERCEPTE, NOM_DETECTEUR_RECOUVREMENT } from './d-recouvrement.js';
import { creerExplorateur } from '../exploration/explorateur.js';
import { creerFiltre, creerFiltreElement } from '../exploration/filtre-actions.js';
import { politiqueDeterministe } from '../exploration/politique.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { creerCompteurObservations } from '../observation/observations.js';

const ECHEANCE_MS = 40_000;

function selecteurPublie(el: LocalisationElement | undefined): string | null | undefined {
  return (el as { selecteurPublie?: string | null } | undefined)?.selecteurPublie;
}

let config: ConfigScanner;
let navigateur: Browser;

interface Exploration {
  serveur: ServeurScenario;
  url: string;
  interceptions: AnomalieCandidate[];
}

async function explorer(bugs: string[], id: string): Promise<Exploration> {
  const configBanc = await chargerConfig();
  const serveur = await demarrerServeur({ id, gabarit: recouvrement.nom, langue: 'fr', bugsActifs: bugs }, recouvrement, configBanc);
  const observateur = creerObservateur();
  const deterministe = politiqueDeterministe();
  const explorateur = creerExplorateur({
    config,
    politique: deterministe,
    secours: deterministe,
    filtre: creerFiltre(await chargerActionsInterdites()),
    filtreElement: creerFiltreElement(await chargerActionsInterdites()),
    navigateur,
  });
  const parcours: Parcours = await explorateur.explorer(
    { urlDepart: serveur.url, echeance: Date.now() + ECHEANCE_MS, compteurObservations: creerCompteurObservations(), journaliser: () => undefined },
    observateur,
  );
  const candidates = detecter(observateur.signaux(), { urlDepart: serveur.url, parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
  return {
    serveur,
    url: serveur.url,
    interceptions: candidates.filter((c) => c.detecteur === NOM_DETECTEUR_RECOUVREMENT && c.description === DESCRIPTION_CLIC_INTERCEPTE),
  };
}

let ab: Exploration;
let c: Exploration;

beforeAll(async () => {
  const base = await chargerConfigScanner();
  config = { ...base, exploration: { ...base.exploration, attenteEffetMaxMs: 3000, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  navigateur = await lancerNavigateur(config);
  ab = await explorer(['Q11', 'Q12'], 'test--selecteur-publie-ab');
  c = await explorer(['Q13'], 'test--selecteur-publie-c');
}, 180_000);

afterAll(async () => {
  await navigateur?.close();
  await ab?.serveur.arreter();
  await c?.serveur.arreter();
});

const faceA = () => ab.interceptions.filter((x) => !(x.element?.selecteur ?? '').includes(`#${PREFIXE_ID_VOLATILE}`));
const faceB = () => ab.interceptions.filter((x) => (x.element?.selecteur ?? '').includes(`#${PREFIXE_ID_VOLATILE}`));

async function resout(url: string, selecteur: string): Promise<boolean> {
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    return (await page.$(selecteur)) !== null;
  } finally {
    await ctx.close();
  }
}

describe('sélecteur publié d’une cause — résout, ou renonce honnêtement', () => {
  it('témoin fidèle : (a) ancrable, (b) sans ancre, (c) id stable à suffixe numérique', () => {
    expect(faceA().length, 'face (a)').toBeGreaterThan(0);
    expect(faceB().length, 'face (b)').toBeGreaterThan(0);
    for (const x of faceA()) expect(x.element?.selecteur).toContain(':nth-of-type');
    for (const x of faceB()) expect(x.element?.selecteur).toContain(`#${PREFIXE_ID_VOLATILE}`);
    expect(c.interceptions.length, 'face (c)').toBeGreaterThan(0);
    for (const x of c.interceptions) expect(x.element?.selecteur).toContain(`#${ID_SUFFIXE_NUMERIQUE}`);
  });

  it('GARDE CARDINALE : toute adresse publiée résout sur un chargement régénéré, OU est absente', async () => {
    for (const x of [...ab.interceptions, ...c.interceptions]) {
      const pub = selecteurPublie(x.element);
      expect(pub, 'le sélecteur de présentation est calculé').not.toBeUndefined();
      if (pub !== null && pub !== undefined) {
        const url = ab.interceptions.includes(x) ? ab.url : c.url;
        expect(await resout(url, pub), `l'adresse publiée « ${pub} » doit résoudre`).toBe(true);
      }
    }
  }, 60_000);

  it('(a) RÉSOLVANT, (b) RENONCÉ — l’asymétrie « ancre ou renoncement »', () => {
    for (const x of faceA()) expect(selecteurPublie(x.element), 'a : adresse résolvante').toBeTruthy();
    for (const x of faceB()) expect(selecteurPublie(x.element), 'b : renoncé (null)').toBeNull();
  });

  it('(c) id STABLE à suffixe numérique RENONCÉ par cohérence — bien que #promo-7 résolve', async () => {
    // L'id interne résout vraiment sur un chargement frais…
    expect(await resout(c.url, `#${ID_SUFFIXE_NUMERIQUE}`), '#promo-7 résout').toBe(true);
    // …et pourtant le sélecteur publié est `null` : on ne distingue pas un
    // suffixe numérique stable d'un volatil sur un instantané (renoncement strict).
    for (const x of c.interceptions) expect(selecteurPublie(x.element), 'c : renoncé (null) par cohérence').toBeNull();
  }, 40_000);
});
