/**
 * Témoin du cahier de la découverte graduée, sur le banc, vrai navigateur,
 * protocole COMPLET (exploration + confirmation + rejeu). Le défaut : une
 * découverte d'un détecteur GRADUÉ (lenteur) est publiée sur une observation
 * UNIQUE, sans re-mesure — la voie découverte (P2-1 contrat 8) court-circuite
 * la re-mesure du protocole. Juste pour un détecteur binaire (image cassée :
 * elle l'est ou ne l'est pas), faux pour un gradué (8 % au-dessus du seuil sur
 * une observation est le transitoire que la re-mesure existe pour filtrer).
 *
 * Reproduit sans contrefaçon (garde C1) la cause réelle (getlumavo) : Q06 pose
 * un recouvrement (candidate de scan → déclenche les rejeux) ; L04 rend le
 * DOCUMENT de l'accueil lent « une fois », au PREMIER rejeu (visite #3 :
 * #1/#2 = exploration, rapide, donc pas candidate de scan ; #3 = premier rejeu,
 * lent → naît en DÉCOUVERTE). « Lent une fois » est invariant au nombre de
 * rejeux que le fix ajoute (tous postérieurs au #3).
 *
 * DEUX FACES :
 *  - TRANSITOIRE (`visiteLente: 3`) : lent au #3 seulement. La re-mesure (un
 *    rejeu ultérieur, rapide) le retrouve sous le seuil → doit être ÉCARTÉ.
 *    Le faux positif getlumavo.
 *  - PERSISTANT (`visiteLente: 'toutes'`) : lent à chaque visite. Re-mesuré,
 *    toujours lent → doit RESTER publié. Le garde-fou contre le faux négatif :
 *    le fix ne doit pas écarter une vraie lenteur « parce qu'elle est une
 *    découverte ».
 *
 * ÉTAT AUJOURD'HUI : ROUGE sur le transitoire (publié en `decouverte`, le faux
 * positif), VERT sur le persistant (publié, correct). Après le fix : le
 * transitoire est re-mesuré sous le seuil et ÉCARTÉ ; le persistant reste publié.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { recouvrement } from '../../../banc/gabarits/recouvrement/index.js';
import { PAGE_ACCUEIL } from '../../../banc/gabarits/recouvrement/structure.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { Anomalie, EntreeJournal, Parcours, ResultatConfirmation } from '../../types.js';
import type { ServeurScenario } from '../../../banc/types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { creerDetecteurs, detecter } from './index.js';
import { DESCRIPTION_LENTE, NOM_DETECTEUR_LENTEUR } from './d-lenteur.js';
import { creerExplorateur } from '../exploration/explorateur.js';
import { creerFiltre, creerFiltreElement } from '../exploration/filtre-actions.js';
import { politiqueDeterministe } from '../exploration/politique.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { creerReexecuteur } from '../reexecuteur.js';
import { autoDiagnosticMecanique } from '../confirmation/auto-diagnostic.js';
import { creerProtocole } from '../confirmation/protocole.js';
import { creerCompteurObservations } from '../observation/observations.js';

const ECHEANCE_MS = 120_000;
const FENETRE_MS = 5000; // > seuil 3000 : la lenteur du document est REÇUE, pas en attente
const DELAI_MS = 3500; // seuil 3000 < 3500 < fenêtre 5000 : lent mais complété ; modeste pour laisser du budget à la re-mesure

let config: ConfigScanner;
let navigateur: Browser;

interface Resultat {
  serveur: ServeurScenario;
  resultat: ResultatConfirmation;
  candidatesLenteurScan: number;
}

/** Document lent sur l'accueil (`PAGE_ACCUEIL`) parmi les anomalies retenues ou écartées. */
function lenteurDocument(liste: readonly Anomalie[]): Anomalie | undefined {
  return liste.find(
    (a) => a.detecteur === NOM_DETECTEUR_LENTEUR && a.description === DESCRIPTION_LENTE && new URL(a.urlOuEtape).pathname === PAGE_ACCUEIL,
  );
}

async function scannerEtConfirmer(unique: boolean, id: string): Promise<Resultat> {
  const serveur = await demarrerServeur(
    { id, gabarit: recouvrement.nom, langue: 'fr', bugsActifs: ['Q06', 'L04'], parametres: { L04: { delaiMs: DELAI_MS, aPartirDe: 3, unique } } },
    recouvrement,
    await chargerConfig(),
  );
  const observateur = creerObservateur();
  const det = politiqueDeterministe();
  const explorateur = creerExplorateur({
    config,
    politique: det,
    secours: det,
    filtre: creerFiltre(await chargerActionsInterdites()),
    filtreElement: creerFiltreElement(await chargerActionsInterdites()),
    navigateur,
  });
  const journal: EntreeJournal[] = [];
  const parcours: Parcours = await explorateur.explorer(
    { urlDepart: serveur.url, echeance: Date.now() + ECHEANCE_MS, compteurObservations: creerCompteurObservations(), journaliser: () => undefined },
    observateur,
  );
  const candidates = detecter(observateur.signaux(), { urlDepart: serveur.url, parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
  const proto = creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique });
  const resultat = await proto.confirmer(candidates, {
    urlDepart: serveur.url,
    options: { timeoutMs: ECHEANCE_MS },
    echeance: Date.now() + ECHEANCE_MS,
    journaliser: (t, d) => journal.push({ horodatage: '', type: t, details: d }),
    reexecuteur: creerReexecuteur({ filtreElement: creerFiltreElement(await chargerActionsInterdites()), navigateur, config, journaliser: () => undefined, compteurObservations: creerCompteurObservations() }),
    detecteurs: creerDetecteurs(config.detecteurs),
    viewports: config.viewports,
  });
  return { serveur, resultat, candidatesLenteurScan: candidates.filter((c) => c.detecteur === NOM_DETECTEUR_LENTEUR).length };
}

let transitoire: Resultat;
let persistant: Resultat;

beforeAll(async () => {
  const base = await chargerConfigScanner();
  config = { ...base, exploration: { ...base.exploration, attenteEffetMaxMs: FENETRE_MS, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  navigateur = await lancerNavigateur(config);
  transitoire = await scannerEtConfirmer(true, 'test--decouverte-transitoire');
  persistant = await scannerEtConfirmer(false, 'test--decouverte-persistante');
}, 240_000);

afterAll(async () => {
  await navigateur?.close();
  await transitoire?.serveur.arreter();
  await persistant?.serveur.arreter();
});

describe('découverte d’un détecteur gradué — re-mesurée avant publication', () => {
  it('témoin fidèle : la lenteur du document est une DÉCOUVERTE (pas une candidate de scan), les deux faces', () => {
    // Document rapide à l'exploration → aucune candidate de lenteur au scan.
    expect(transitoire.candidatesLenteurScan, 'transitoire : pas de candidate lenteur au scan').toBe(0);
    expect(persistant.candidatesLenteurScan, 'persistant : pas de candidate lenteur au scan').toBe(0);
    // Elle naît au rejeu, comme découverte : le persistant (toujours lent) est
    // bien retenu, preuve qu'une lenteur de document EST née au rejeu.
    expect(lenteurDocument(persistant.resultat.retenues), 'persistant : lenteur de document née au rejeu').toBeDefined();
  });

  it('TRANSITOIRE : re-mesuré sous le seuil → ÉCARTÉ (pas publié)', () => {
    // ROUGE aujourd'hui : publié en `decouverte` sur une observation unique.
    // VERT après le fix : re-mesuré rapide → non-reproduite → écarté.
    expect(lenteurDocument(transitoire.resultat.retenues), 'le transitoire ne doit PAS être retenu').toBeUndefined();
  });

  it('PERSISTANT : re-mesuré toujours lent → RESTE publié (pas de faux négatif)', () => {
    // Doit rester vrai avant ET après le fix : une vraie lenteur découverte
    // au rejeu n'est pas écartée parce qu'elle est « seulement une découverte ».
    expect(lenteurDocument(persistant.resultat.retenues), 'le persistant doit rester retenu').toBeDefined();
  });
});
