import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie, Rapport, Scanner } from '../../core/types.js';
import { chargerConfig } from '../config.js';
import { obtenirGabarit } from '../gabarits/index.js';
import { formulaireContact } from '../gabarits/formulaire-contact/index.js';
import { PAGE_ACCUEIL, PAGE_CONTACT } from '../gabarits/formulaire-contact/structure.js';
import { depuisRacine } from '../outils/racine.js';
import { compterBalises } from '../outils/transformations.js';
import type { ConfigBanc, Scenario } from '../types.js';
import { executerBanc, noterScenario } from './index.js';

/** Trace structurelle de F01 : un bouton `type="button"` (le sain n’en a aucun). */
const BOUTON_INERTE = { balise: 'button', attribut: 'type', valeur: 'button' };

let config: ConfigBanc;
let dico: Dictionnaire;
const timers: NodeJS.Timeout[] = [];

function scenario(id: string, langue: string, bugsActifs: string[]): Scenario {
  return { id, gabarit: formulaireContact.nom, langue, bugsActifs };
}

const F01_M01_FR = scenario('test--f01-m01--fr', 'fr', ['F01', 'M01']);
const SAIN_EN = scenario('test--sain--en', 'en', []);

function anomalie(categorie: Anomalie['categorie'], urlOuEtape: string): Anomalie {
  return { categorie, description: 'prose du moteur', urlOuEtape, graviteEstimee: 'important', confiance: 0.8 };
}

function rapport(url: string, anomalies: Anomalie[], coutApi = 0): Rapport {
  return { url, anomalies, coutApi, dureeMs: 0, journal: [{ horodatage: new Date().toISOString(), type: 'scan.test' }] };
}

/** Preuve que le serveur tourne pendant le scan : /contact répond 200. */
async function lireContact(url: string): Promise<string> {
  const reponse = await fetch(url + PAGE_CONTACT);
  expect(reponse.status).toBe(200);
  return reponse.text();
}

/** Scanner contrôlé : signale un bug fonctionnel sur /contact (URL absolue) et un faux positif SEO sur l’accueil, quel que soit le scénario. */
const scannerControle: Scanner = async function scannerControle(url) {
  await lireContact(url);
  return rapport(url, [anomalie('fonctionnel', `${url}${PAGE_CONTACT}`), anomalie('seo', PAGE_ACCUEIL)], 0.25);
};

const scannerEnPanne: Scanner = async function scannerEnPanne() {
  throw new Error('panne simulée');
};

function scannerLent(dureeMs: number): Scanner {
  return async function scannerLent(url) {
    await new Promise<void>((resoudre) => {
      timers.push(setTimeout(resoudre, dureeMs));
    });
    return rapport(url, []);
  };
}

async function serveurFerme(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return false;
  } catch {
    return true;
  }
}

beforeAll(async () => {
  config = await chargerConfig();
  dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
});

afterEach(() => {
  for (const timer of timers.splice(0)) {
    clearTimeout(timer);
  }
});

describe('noterScenario', () => {
  it('déploie le scénario, note détecté / raté / faux positif de bout en bout, puis arrête le serveur', async () => {
    let urlServie = '';
    const scanner: Scanner = async function scannerEspion(url, options) {
      urlServie = url;
      // Le site servi porte bien F01 (et lui seul en fonctionnel) : le scan note le vrai scénario.
      expect(compterBalises(await lireContact(url), BOUTON_INERTE)).toBe(1);
      return scannerControle(url, options);
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner, config, dico, obtenirGabarit });

    expect(urlServie).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(resultat).toMatchObject({ scenarioId: F01_M01_FR.id, gabarit: formulaireContact.nom, langue: 'fr', statut: 'ok', coutApi: 0.25 });
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.rapport?.url).toBe(urlServie);
    expect(resultat.attendus.map((attendu) => [attendu.attendu.bugId, attendu.verdict])).toEqual([
      ['F01', 'detecte'],
      ['M01', 'rate'],
    ]);
    expect(resultat.attendus[0]?.anomaliesAppariees).toHaveLength(1);
    expect(resultat.fauxPositifs.map((fp) => fp.categorie)).toEqual(['seo']);
    expect(resultat.dureeMs).toBeGreaterThanOrEqual(0);
    expect(await serveurFerme(urlServie)).toBe(true);
  });

  it('sert la langue du scénario et ne signale rien de faux sur un site sain', async () => {
    const scanner: Scanner = async function scannerLangue(url) {
      const html = await lireContact(url);
      expect(html).toContain(`<html lang="${SAIN_EN.langue}">`);
      expect(compterBalises(html, BOUTON_INERTE)).toBe(0);
      return rapport(url, []);
    };
    const resultat = await noterScenario(SAIN_EN, { scanner, config, dico, obtenirGabarit });
    expect(resultat).toMatchObject({ statut: 'ok', attendus: [], fauxPositifs: [], coutApi: 0 });
  });

  it('marque en erreur un scanner qui lève, avec tous les attendus ratés, et arrête quand même le serveur', async () => {
    let urlServie = '';
    const scanner: Scanner = async function scannerEspionEnPanne(url, options) {
      urlServie = url;
      return scannerEnPanne(url, options);
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner, config, dico, obtenirGabarit });

    expect(resultat).toMatchObject({ statut: 'erreur', erreur: 'panne simulée', coutApi: 0, fauxPositifs: [] });
    expect(resultat.rapport).toBeUndefined();
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(await serveurFerme(urlServie)).toBe(true);
  });

  it('marque en erreur un scanner qui dépasse le timeout de la config, avec le message des locales', async () => {
    const timeoutMs = 100;
    const configCourte: ConfigBanc = { ...config, scan: { timeoutMs } };
    const debut = Date.now();

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerLent(timeoutMs * 50), config: configCourte, dico, obtenirGabarit });

    expect(Date.now() - debut).toBeLessThan(timeoutMs * 20);
    expect(resultat.statut).toBe('erreur');
    expect(resultat.erreur).toBe(traduire(dico, 'banc.timeoutScan', { timeoutMs }));
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(resultat.dureeMs).toBeGreaterThanOrEqual(timeoutMs);
  });

  it('laisse remonter une erreur du banc lui-même (scénario incohérent avec le gabarit)', async () => {
    const inconnu = scenario('test--zz9--fr', 'fr', ['ZZ9']);
    await expect(noterScenario(inconnu, { scanner: scannerControle, config, dico, obtenirGabarit })).rejects.toThrow('ZZ9');
  });

  it('laisse remonter une erreur du banc lui-même (paramètre de bug invalide) au lieu de noter un site mal servi', async () => {
    const invalide: Scenario = { ...F01_M01_FR, parametres: { M01: { largeurMaxMobilePx: 'grand' } } };
    await expect(noterScenario(invalide, { scanner: scannerControle, config, dico, obtenirGabarit })).rejects.toThrow('M01');
  });

  it('marque en erreur (sans lever) un rapport inexploitable par l’appariement, et garde le rapport', async () => {
    const scannerInexploitable: Scanner = async function scannerInexploitable(url) {
      // Rapport structurellement faux (anomalies absentes) : le contrat est violé par le sujet, pas par le banc.
      return { ...rapport(url, []), anomalies: undefined as unknown as Anomalie[] };
    };
    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerInexploitable, config, dico, obtenirGabarit });
    expect(resultat.statut).toBe('erreur');
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(resultat).toMatchObject({ fauxPositifs: [], coutApi: 0 });
    expect(resultat.rapport).toBeDefined();
  });

  it('compte en faux positif une anomalie à la localisation mal formée sans interrompre l’exécution', async () => {
    const scannerMalForme: Scanner = async function scannerMalForme(url) {
      return rapport(url, [anomalie('fonctionnel', 'http://')]);
    };
    const scorecard = await executerBanc({ scenarios: [F01_M01_FR, SAIN_EN], scanner: scannerMalForme, config, dico, obtenirGabarit });
    expect(scorecard.scenarios).toHaveLength(2);
    expect(scorecard.global).toMatchObject({ nbErreurs: 0, nbFauxPositifs: 2, nbDetectes: 0 });
  });
});

describe('executerBanc', () => {
  it('note chaque scénario dans l’ordre, journalise la progression et produit la scorecard agrégée', async () => {
    const lignes: string[] = [];
    const scenarios = [F01_M01_FR, SAIN_EN];

    const scorecard = await executerBanc({ scenarios, scanner: scannerControle, config, dico, obtenirGabarit, journal: (ligne) => lignes.push(ligne) });

    expect(scorecard.scenarios.map((resultat) => resultat.scenarioId)).toEqual(scenarios.map((s) => s.id));
    expect(scorecard.horodatage).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(scorecard.global).toMatchObject({ nbScenarios: 2, nbErreurs: 0, nbAttendus: 2, nbDetectes: 1, nbRates: 1, nbSignalements: 4, nbFauxPositifs: 3, tauxDetection: 50, tauxFauxPositifs: 75, coutApi: 0.5 });
    expect(scorecard.parLangue['fr']).toMatchObject({ nbScenarios: 1, nbAttendus: 2, nbDetectes: 1 });
    expect(scorecard.parLangue['en']).toMatchObject({ nbScenarios: 1, nbAttendus: 0, tauxDetection: null, nbFauxPositifs: 2 });
    expect(Object.keys(scorecard.parCategorie).sort()).toEqual(['fonctionnel', 'mobile', 'seo']);
    expect(scorecard.ecartLangues).toEqual({ points: null, seuil: config.scorecard.seuilAlarmeEcartLanguesPoints, alarme: false });

    expect(lignes[0]).toBe(traduire(dico, 'banc.demarrage', { nombre: 2, scanner: 'scannerControle' }));
    expect(lignes[1]).toBe(traduire(dico, 'banc.scenarioEnCours', { id: F01_M01_FR.id }));
    const premier = scorecard.scenarios[0];
    expect(lignes[2]).toBe(
      traduire(dico, 'banc.scenarioTermine', { id: F01_M01_FR.id, detectes: 1, attendus: 2, fauxPositifs: 1, dureeMs: premier?.dureeMs ?? -1 }),
    );
    expect(lignes).toHaveLength(5);
  });

  it('journalise banc.scenarioErreur pour un scanner en panne et compte l’erreur dans la scorecard', async () => {
    const lignes: string[] = [];
    const scorecard = await executerBanc({ scenarios: [F01_M01_FR], scanner: scannerEnPanne, config, dico, obtenirGabarit, journal: (ligne) => lignes.push(ligne) });
    expect(scorecard.global).toMatchObject({ nbScenarios: 1, nbErreurs: 1, nbAttendus: 2, nbDetectes: 0, nbSignalements: 0, tauxDetection: 0, tauxFauxPositifs: null });
    expect(lignes[2]).toBe(traduire(dico, 'banc.scenarioErreur', { id: F01_M01_FR.id, erreur: 'panne simulée' }));
  });

  it('reste silencieux sans journal et accepte une liste vide', async () => {
    const scorecard = await executerBanc({ scenarios: [], scanner: scannerControle, config, dico, obtenirGabarit });
    expect(scorecard.global.nbScenarios).toBe(0);
    expect(scorecard.scenarios).toEqual([]);
  });
});
