/**
 * TÉMOIN du cahier P2-11 (C) — le calque de composant, sur le banc, vrai
 * navigateur.
 *
 * Mesuré au grand tableau du 2026-10-06 : sur expandtesting/xpath-css-tester,
 * un `<textarea>` PROXY (opacity 0, ~2×1) que l'éditeur de code recouvre de sa
 * couche d'affichage est publié comme `clic-intercepte` — un faux positif. Le
 * visiteur ne voit ni ne vise ce champ : son recouvrement est le
 * fonctionnement NORMAL du composant, pas un blocage.
 *
 * Le critère, mesuré (scratchpad/mesure-populations) : un champ INVISIBLE
 * (opacité effective nulle — cumul des ancêtres — ou visibility:hidden) ET
 * MINUSCULE (dimension min sous le seuil) n'est pas une victime. Les deux
 * conditions ENSEMBLE : invisible seul resterait un vrai défaut d'invisibilité
 * (Q21) ; minuscule seul tairait un petit bouton VISIBLE (Q23). Deux
 * populations séparées à la mesure : proxy (effInvisible, dimMin 1) vs vrais
 * positifs existants (visibles, dimMin ≥ 11).
 *
 * ATTENDU APRÈS le fix : le proxy (Q19) et le sliver (Q22) ÉCARTÉS ; les trois
 * gardes (Q20 visible-réel, Q21 invisible-taille-réelle, Q23 visible-minuscule)
 * PUBLIÉES. ROUGE AUJOURD'HUI : Q19 et Q22 publiés (le témoin prouve le défaut
 * sur le code actuel avant qu'une ligne de moteur ne soit écrite — METHODE §10).
 *
 * Mesure de seuil (C, §13) : le plus petit VRAI positif du grand tableau fait
 * dimension min 11 (lien de tag de quotes) ; le proxy fait 1. Le seuil 4
 * sépare les deux avec marge, et sous le plus petit vrai positif. Q21 (dimMin
 * 11, invisible) garde ce calage : un seuil élargi à ≥ 12 l'écarterait à tort.
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

async function interceptionsDesktop(bugs: string[], id: string): Promise<AnomalieCandidate[]> {
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
  const desktop = config.viewports[0]?.nom ?? 'desktop';
  return candidates.filter(
    (c) => c.detecteur === NOM_DETECTEUR_RECOUVREMENT && c.description === DESCRIPTION_CLIC_INTERCEPTE && c.viewport === desktop,
  );
}

describe('P2-11 (C) — un proxy invisible et minuscule n’est pas une victime', () => {
  it('sain : aucun recouvrement (contrôle)', async () => {
    const i = await interceptionsDesktop([], 'test--proxy--sain');
    expect(i.length).toBe(0);
  }, ECHEANCE_MS + 10_000);

  it('Q19 : un champ INVISIBLE et MINUSCULE recouvert est ÉCARTÉ (ROUGE aujourd’hui : publié)', async () => {
    const i = await interceptionsDesktop(['Q19'], 'test--proxy--q19');
    expect(i.length, `clic-intercepte sur le proxy : ${i.length} (attendu 0)`).toBe(0);
  }, ECHEANCE_MS + 10_000);

  it('Q20 : un champ VISIBLE de taille réelle recouvert reste PUBLIÉ (garde)', async () => {
    const i = await interceptionsDesktop(['Q20'], 'test--proxy--q20');
    expect(i.length, `clic-intercepte sur le champ visible : ${i.length} (attendu 1)`).toBe(1);
  }, ECHEANCE_MS + 10_000);

  it('Q21 : un champ INVISIBLE mais de TAILLE RÉELLE recouvert reste PUBLIÉ (le fix exige invisible ET minuscule)', async () => {
    const i = await interceptionsDesktop(['Q21'], 'test--proxy--q21');
    expect(i.length, `clic-intercepte sur l’invisible-réel : ${i.length} (attendu 1)`).toBe(1);
  }, ECHEANCE_MS + 10_000);

  it('Q22 : un champ sliver INVISIBLE (fin et long) est ÉCARTÉ par la dimension min (ROUGE aujourd’hui : publié)', async () => {
    const i = await interceptionsDesktop(['Q22'], 'test--proxy--q22');
    expect(i.length, `clic-intercepte sur le sliver : ${i.length} (attendu 0)`).toBe(0);
  }, ECHEANCE_MS + 10_000);

  it('Q23 : un petit bouton VISIBLE recouvert reste PUBLIÉ (le fix exige invisible ET minuscule)', async () => {
    const i = await interceptionsDesktop(['Q23'], 'test--proxy--q23');
    expect(i.length, `clic-intercepte sur le visible-minuscule : ${i.length} (attendu 1)`).toBe(1);
  }, ECHEANCE_MS + 10_000);
});
