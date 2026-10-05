/**
 * Témoin du cahier de navigation (`waitUntil`), sur le banc, vrai navigateur.
 * Le défaut : `explorateur`/`reexecuteur` naviguent en `waitUntil: 'load'` —
 * `load` attend TOUTES les ressources, donc une seule ressource qui pend prend
 * le scan en otage (`goto` expire, page perdue). Mesuré sur the-internet :
 * 40 pages → 2, un site parfaitement explorable rendu invisible.
 *
 * Reproduit sans contrefaçon (garde C1) : L05 fait référencer par l'accueil une
 * image qui BLOQUE le `load` (retenue par le serveur au-delà de
 * `chargementPageMs`), le DOM restant complet ; Q06 pose un recouvrement sur ce
 * MÊME accueil. Sous `waitUntil: 'load'`, le `goto` de l'accueil expire → page
 * perdue → le recouvrement de Q06 n'est JAMAIS détecté (otage). Sous
 * `'domcontentloaded'`, l'accueil est exploré et Q06 détecté, l'image qui pend
 * devenant une `requete-en-attente` bornée (jugée par P2-7).
 *
 * C'est un défaut de COUVERTURE, pas de jugement : il ne publie rien de faux,
 * il AMPUTE. La garde cardinale n'est donc pas « équivalent » (l'oracle du
 * corpus l'est déjà, les gabarits locaux n'ayant pas de ressource qui pend)
 * mais : the site repris à l'otage est de nouveau exploré, SANS perte ailleurs.
 *
 * ÉTAT AUJOURD'HUI : ROUGE (accueil perdu, 0 recouvrement). VERT après le
 * passage à `'domcontentloaded'`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { recouvrement } from '../../../banc/gabarits/recouvrement/index.js';
import { PAGE_ACCUEIL, PAGE_PANIER } from '../../../banc/gabarits/recouvrement/structure.js';
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
let serveur: ServeurScenario;
let candidates: AnomalieCandidate[];
let cheminsExplores: string[];

beforeAll(async () => {
  const base = await chargerConfigScanner();
  // `chargementPageMs` court : sous 'load', le `goto` expire vite sur l'image
  // qui pend. Fenêtre d'effet courte : la stabilisation ne s'éternise pas sur
  // la ressource en vol. L05 retient l'image 30 s (> chargementPageMs).
  config = { ...base, exploration: { ...base.exploration, chargementPageMs: 3000, attenteEffetMaxMs: 2000, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  serveur = await demarrerServeur({ id: 'test--waituntil-q06-l05', gabarit: recouvrement.nom, langue: 'fr', bugsActifs: ['Q06', 'L05'], parametres: { L05: { delaiMs: 30_000 } } }, recouvrement, await chargerConfig());
  navigateur = await lancerNavigateur(config);
  const observateur = creerObservateur();
  const det = politiqueDeterministe();
  const explorateur = creerExplorateur({ config, politique: det, secours: det, filtre: creerFiltre(await chargerActionsInterdites()), filtreElement: creerFiltreElement(await chargerActionsInterdites()), navigateur });
  const parcours: Parcours = await explorateur.explorer(
    { urlDepart: serveur.url, echeance: Date.now() + ECHEANCE_MS, compteurObservations: creerCompteurObservations(), journaliser: () => undefined },
    observateur,
  );
  candidates = detecter(observateur.signaux(), { urlDepart: serveur.url, parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
  cheminsExplores = parcours.pages.map((p) => new URL(p.url).pathname);
}, 120_000);

afterAll(async () => {
  await navigateur?.close();
  await serveur?.arreter();
});

describe('waitUntil — une ressource qui pend ne doit pas prendre le scan en otage', () => {
  it('l’exploration ATTEINT la page liée (le scan n’est pas bloqué à l’accueil)', () => {
    // Mesuré : sous 'load', le `goto` de l'accueil expire, ses liens ne sont
    // jamais extraits, l'exploration reste coincée à l'accueil — /panier n'est
    // jamais atteint. ROUGE aujourd'hui ; VERT sous 'domcontentloaded'.
    expect(cheminsExplores, 'accueil chargé').toContain(PAGE_ACCUEIL);
    expect(cheminsExplores, 'la page liée /panier est atteinte').toContain(PAGE_PANIER);
  });

  it('le recouvrement de Q06 est DÉTECTÉ (le scan n’est pas amputé)', () => {
    const interceptions = candidates.filter((c) => c.detecteur === NOM_DETECTEUR_RECOUVREMENT && c.description === DESCRIPTION_CLIC_INTERCEPTE);
    expect(interceptions.length, 'recouvrement détecté sur l’accueil repris à l’otage').toBeGreaterThan(0);
  });
});
