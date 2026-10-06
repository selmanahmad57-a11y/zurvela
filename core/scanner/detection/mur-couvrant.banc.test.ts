/**
 * TÉMOIN du cahier P2-11 (le mur couvrant), sur le banc, vrai navigateur.
 *
 * Mesuré au grand tableau du 2026-10-06 : un unique mur de consentement
 * (automationexercise, Google Funding Choices) est publié comme 15
 * `clic-intercepte` « bloquant » parce que `cleCause` ancre sur le nœud
 * interceptant le plus profond (overlay, `li`, bouton), et deux signatures
 * distinctes ne fondent pas. Q14 reproduit la forme exacte : UN overlay
 * couvrant (plein viewport, couverture 1,0), non écartable, dont le
 * sous-arbre porte deux voiles de balises distinctes (`div`, `section`).
 *
 * ATTENDU APRÈS P2-11 : une cause (« un élément recouvre l'interface et masque
 * N éléments interactifs »). ROUGE AUJOURD'HUI : deux — le témoin prouve le
 * défaut sur le code actuel avant qu'une ligne de moteur ne soit écrite
 * (METHODE §10).
 *
 * Mesure de seuil (C1, §13) : la couche couvrante du mur fait 1,0 du viewport ;
 * les recouvrements légitimes mesurés font 0,075 (demoqa pied fixe) et 0,045
 * (quotes pied) — le seuil 0,5 sépare les deux populations avec une marge 6×.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { recouvrement } from '../../../banc/gabarits/recouvrement/index.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ServeurScenario } from '../../../banc/types.js';
import type { AnomalieCandidate, Parcours } from '../../types.js';
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

let config: ConfigScanner;
let navigateur: Browser;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => {
  config = await chargerConfigScanner();
  navigateur = await lancerNavigateur(config);
});

afterAll(async () => {
  await Promise.all(serveurs.map((s) => s.arreter()));
  await navigateur.close();
});

async function interceptions(bugs: string[], id: string): Promise<AnomalieCandidate[]> {
  const configBanc = await chargerConfig();
  const serveur = await demarrerServeur({ id, gabarit: recouvrement.nom, langue: 'fr', bugsActifs: bugs }, recouvrement, configBanc);
  serveurs.push(serveur);
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
  return candidates.filter((c) => c.detecteur === NOM_DETECTEUR_RECOUVREMENT && c.description === DESCRIPTION_CLIC_INTERCEPTE);
}

describe('P2-11 — un mur couvrant est UNE cause, pas N', () => {
  it('sain : aucun recouvrement (contrôle)', async () => {
    const i = await interceptions([], 'test--mur--sain');
    expect(i.length).toBe(0);
  }, ECHEANCE_MS + 10_000);

  it('Q14 : le mur couvrant doit donner UNE cause par viewport (ROUGE aujourd’hui : N)', async () => {
    const i = await interceptions(['Q14'], 'test--mur--q14');
    const desktop = config.viewports[0]?.nom ?? 'desktop';
    const surDesktop = i.filter((c) => c.viewport === desktop);
    // Diagnostic lisible quand c'est rouge : quels intercepteurs distincts.
    const intercepteurs = surDesktop.map((c) => c.element?.selecteur ?? '(sans élément)');
    expect(surDesktop.length, `intercepteurs distincts sur ${desktop} : ${JSON.stringify(intercepteurs)}`).toBe(1);
  }, ECHEANCE_MS + 10_000);

  it('Q15 : un mur masquant une SOUMISSION sort « important », pas « bloquant » (ROUGE aujourd’hui)', async () => {
    const i = await interceptions(['Q15'], 'test--mur--q15');
    const desktop = config.viewports[0]?.nom ?? 'desktop';
    const surDesktop = i.filter((c) => c.viewport === desktop);
    const gravites = surDesktop.map((c) => c.graviteEstimee);
    // Après le fix : UNE cause, gravité « important » (le marqueur court-circuite
    // la gravité-par-ce-qui-est-masqué). Aujourd’hui : deux causes, dont une
    // « bloquant » (la soumission) — le piège du grand tableau.
    expect(surDesktop.length, `causes : ${surDesktop.length}, gravités ${JSON.stringify(gravites)}`).toBe(1);
    expect(surDesktop[0]?.graviteEstimee).toBe('important');
  }, ECHEANCE_MS + 10_000);

  it('Q16 : un pied légitime à deux victimes NE fond PAS (reste deux causes — le seuil de couverture sépare)', async () => {
    const i = await interceptions(['Q16'], 'test--mur--q16');
    const desktop = config.viewports[0]?.nom ?? 'desktop';
    const surDesktop = i.filter((c) => c.viewport === desktop);
    // Ancêtre couvrant ~0,1 < 0,5 : pas un mur. Deux voiles distinctes → deux
    // causes, aujourd’hui ET après le fix. Garde du seuil de couverture.
    expect(surDesktop.length).toBe(2);
  }, ECHEANCE_MS + 10_000);

  it('Q17 : le MÊME mur sur deux pages → UNE cause (fusion inter-pages par signature, absorbe C-11)', async () => {
    const i = await interceptions(['Q17'], 'test--mur--q17');
    const desktop = config.viewports[0]?.nom ?? 'desktop';
    const surDesktop = i.filter((c) => c.viewport === desktop);
    const pages = surDesktop.map((c) => c.urlOuEtape);
    expect(surDesktop.length, `causes : ${surDesktop.length}, pages ${JSON.stringify(pages)}`).toBe(1);
  }, ECHEANCE_MS + 10_000);

  it('Q18 : DEUX murs de constructions distinctes → DEUX causes (on ne fond que sur preuve)', async () => {
    const i = await interceptions(['Q18'], 'test--mur--q18');
    const desktop = config.viewports[0]?.nom ?? 'desktop';
    const surDesktop = i.filter((c) => c.viewport === desktop);
    expect(surDesktop.length).toBe(2);
  }, ECHEANCE_MS + 10_000);
});
