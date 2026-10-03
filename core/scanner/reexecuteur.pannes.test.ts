/**
 * À QUI LA FAUTE, quand un rejeu ne charge pas la page ? Ce fichier éprouve
 * la classification de `causeEchec` sur des pannes RÉELLES, servies par des
 * serveurs HTTP jetables et rejouées par un vrai Chromium — le seul endroit
 * où l'on peut vérifier ce que le navigateur émet vraiment.
 *
 * Les quatre cas, et pourquoi ils ne se ressemblent pas :
 * 1. serveur MORT (connexion refusée) → `reseau-site`, et le site injoignable
 *    remonte en constat : se taire pendant une panne serait le pire faux
 *    négatif ;
 * 2. serveur FIGÉ (la connexion est acceptée, aucune réponse ne vient) → la
 *    même panne pour un visiteur, mais AUCUNE requête n'échoue : sans
 *    constat émis, le moteur se tairait. L'absence de réponse est donc
 *    constatée (`requete-en-attente`) et l'échec reste `reseau-site` ;
 * 3. une ressource TIERCE en échec pendant un chargement qui n'aboutit pas
 *    → `indetermine` : un iframe de publicité mort ne dit rien du site ;
 * 4. budget d'échéance épuisé → `outil` : une fenêtre d'observation refermée
 *    par le chronomètre du scan n'a rien constaté du tout.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContexteReproduction, ResultatRejeu, Signal, Viewport } from '../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from './config.js';
import { DESCRIPTION_DOCUMENT_INJOIGNABLE } from './detection/d-http.js';
import { creerDetecteurs, detecter } from './detection/index.js';
import { lancerNavigateur } from './navigateur.js';
import { creerReexecuteur, ERREUR_BUDGET_INSUFFISANT, ERREUR_PAGE_INCHARGEABLE, ERREUR_RECETTE_INCOHERENTE } from './reexecuteur.js';
import { creerFiltreElement } from './exploration/filtre-actions.js';
import { creerCompteurObservations } from './observation/observations.js';

/** Chargement raccourci : seules les ATTENTES sont resserrées, jamais la classification. */
const CHARGEMENT_MS = 4000;

interface ServeurTest {
  url: string;
  arreter(): Promise<void>;
}

/** Serveur jetable : le gestionnaire décide de répondre… ou pas. */
async function servir(gestionnaire: (chemin: string, reponse: ServerResponse) => void): Promise<ServeurTest> {
  const serveur: Server = createServer((requete, reponse) => {
    gestionnaire(new URL(requete.url ?? '/', 'http://local.invalid').pathname, reponse);
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    async arreter() {
      await new Promise<void>((resoudre, rejeter) => {
        serveur.close((erreur) => (erreur === undefined ? resoudre() : rejeter(erreur)));
        serveur.closeAllConnections();
      });
    },
  };
}

function html(reponse: ServerResponse, corps: string): void {
  reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  reponse.end(`<!doctype html><html lang="fr"><body>${corps}</body></html>`);
}

let base: ConfigScanner;
let config: ConfigScanner;
let navigateur: Browser;
let viewport: Viewport;

beforeAll(async () => {
  base = await chargerConfigScanner();
  config = {
    ...base,
    exploration: { ...base.exploration, attenteEffetMaxMs: 1500, stabilisationMs: 120, sondageMs: 20, evaluationMs: 3000 },
    confirmation: { ...base.confirmation, rejeu: { ...base.confirmation.rejeu, chargementPageMs: CHARGEMENT_MS } },
  };
  const premier = config.viewports[0];
  if (premier === undefined) {
    throw new Error('viewport-absent');
  }
  viewport = premier;
  navigateur = await lancerNavigateur(config);
}, 60_000);

afterAll(async () => {
  await navigateur?.close();
});

function reproduction(url: string): ContexteReproduction {
  return { url, pageDepart: url, viewport, action: null, actionsPrealables: [] };
}

async function rejouer(url: string, echeance?: number): Promise<ResultatRejeu> {
  const reexecuteur = creerReexecuteur({
    filtreElement: creerFiltreElement(await chargerActionsInterdites()),
    navigateur,
    config,
    compteurObservations: creerCompteurObservations(),
    ...(echeance === undefined ? {} : { echeance }),
  });
  return reexecuteur.rejouer(reproduction(url), viewport);
}

/** Les candidates que les détecteurs tirent des signaux d'un rejeu (le circuit du protocole). */
function candidatesDe(rejeu: ResultatRejeu, urlDepart: string): { description: string }[] {
  return detecter(rejeu.signaux, { urlDepart, parcours: rejeu.parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
}

function signauxDe(signaux: Signal[], type: Signal['type']): Signal[] {
  return signaux.filter((signal) => signal.type === type);
}

describe('re-exécuteur — la recette est vérifiée avant d’ouvrir quoi que ce soit (cahier P2-1, contrat 1)', () => {
  it('un préalable venu d’une autre page que pageDepart → échec d’OUTILLAGE « recette-incoherente », et aucune page chargée', async () => {
    // C-09 : le rejeu ouvrait la page d'arrivée et y cherchait le formulaire
    // de la page de départ. Le contrôle qui peut échouer : sans la garde, le
    // rejeu CHARGERAIT la page et échouerait plus loin, sur un sélecteur.
    const serveur = await servir((_chemin, reponse) => html(reponse, '<p>vivant</p>'));
    const url = serveur.url;
    const prealable = {
      id: 'a1',
      action: { type: 'naviguer' as const, url: `${url}autre` },
      page: `${url}autre`,
      viewport: viewport.nom,
      debut: new Date().toISOString(),
      fin: new Date().toISOString(),
      resultat: 'ok' as const,
    };
    const rejeu = await creerReexecuteur({
    filtreElement: creerFiltreElement(await chargerActionsInterdites()),
    navigateur, config, compteurObservations: creerCompteurObservations() }).rejouer({ ...reproduction(url), actionsPrealables: [prealable] }, viewport);
    await serveur.arreter();
    expect(rejeu).toMatchObject({ echecOutillage: true, causeEchec: 'outil', erreur: ERREUR_RECETTE_INCOHERENTE });
    expect(rejeu.parcours.pages).toEqual([]);
  }, 60_000);
});

describe('re-exécuteur — classer l’échec d’un chargement', () => {
  it('serveur MORT (connexion refusée) → reseau-site, et le document injoignable est constaté', async () => {
    const serveur = await servir((_chemin, reponse) => html(reponse, '<p>vivant</p>'));
    const url = serveur.url;
    await serveur.arreter();

    const rejeu = await rejouer(url);

    expect(rejeu).toMatchObject({ echecOutillage: true, causeEchec: 'reseau-site', erreur: ERREUR_PAGE_INCHARGEABLE });
    expect(candidatesDe(rejeu, url).map((candidate) => candidate.description)).toContain(DESCRIPTION_DOCUMENT_INJOIGNABLE);
  }, 60_000);

  it('serveur FIGÉ (accepte, ne répond jamais) → reseau-site : l’absence de réponse est CONSTATÉE, pas imputée au robot', async () => {
    // La panne la plus courante en production — un backend saturé — et la
    // plus silencieuse : rien n'échoue, donc rien ne serait observé.
    const serveur = await servir(() => undefined);

    const rejeu = await rejouer(serveur.url);

    expect(rejeu).toMatchObject({ echecOutillage: true, causeEchec: 'reseau-site', erreur: ERREUR_PAGE_INCHARGEABLE });
    const attentes = signauxDe(rejeu.signaux, 'requete-en-attente');
    expect(attentes).toHaveLength(1);
    expect(attentes[0]).toMatchObject({ urlRessource: `${serveur.url}/`, methode: 'GET', typeRessource: 'document', interne: true });
    // Et le circuit observation → détection n'est pas court-circuité : la
    // panne devient une candidate, donc une découverte pour le protocole.
    expect(candidatesDe(rejeu, serveur.url).length).toBeGreaterThan(0);

    await serveur.arreter();
  }, 60_000);

  it('ressource TIERCE en échec pendant un chargement qui n’aboutit pas → indetermine, jamais un constat sur le site', async () => {
    // Le site répond parfaitement ; c'est un iframe d'une origine morte qui
    // échoue, et une image qui ne revient jamais qui retient le `load`.
    const serveur = await servir((chemin, reponse) => {
      if (chemin === '/') {
        html(reponse, '<iframe src="http://127.0.0.1:1/absent"></iframe><img src="/image-sans-fin.png" alt="">');
        return;
      }
      // L'image n'est jamais servie : le chargement n'aboutit pas.
    });

    const rejeu = await rejouer(serveur.url);

    expect(rejeu).toMatchObject({ echecOutillage: true, causeEchec: 'indetermine', erreur: ERREUR_PAGE_INCHARGEABLE });
    const echecs = signauxDe(rejeu.signaux, 'requete-echouee');
    expect(echecs.length).toBeGreaterThan(0);
    expect(echecs.every((signal) => signal.type === 'requete-echouee' && !signal.cadrePrincipal)).toBe(true);
    expect(candidatesDe(rejeu, serveur.url).map((candidate) => candidate.description)).not.toContain(DESCRIPTION_DOCUMENT_INJOIGNABLE);

    await serveur.arreter();
  }, 60_000);

  it('budget d’échéance épuisé → échec d’OUTILLAGE : une fenêtre refermée par le chronomètre n’a rien constaté', async () => {
    // Page saine, mais une requête que le serveur ne termine jamais tient la
    // fenêtre d'effet ouverte : elle se referme sur le budget, pas sur la page.
    const serveur = await servir((chemin, reponse) => {
      if (chemin === '/') {
        html(reponse, '<p>saine</p><script>fetch("/sans-fin");</script>');
      }
    });
    const budgetMs = 2500;

    const rejeu = await rejouer(serveur.url, Date.now() + config.confirmation.rejeu.margeEcheanceMs + budgetMs);

    expect(rejeu).toMatchObject({ echecOutillage: true, causeEchec: 'outil', erreur: ERREUR_BUDGET_INSUFFISANT });

    await serveur.arreter();
  }, 60_000);
});
