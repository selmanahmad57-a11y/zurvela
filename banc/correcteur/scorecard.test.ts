import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie, Categorie } from '../../core/types.js';
import { depuisRacine } from '../outils/racine.js';
import { configFactice } from '../scenarios/factices.js';
import type { AttenduManifeste, ResultatAttendu, ResultatScenario } from '../types.js';
import { calculerScorecard, ecrireScorecard, rendreScorecardConsole } from './scorecard.js';

const HORODATAGE = '2026-09-22T10:20:30.000Z';
const config = configFactice();

function anomalie(categorie: Categorie, urlOuEtape: string): Anomalie {
  return { categorie, description: '', urlOuEtape, graviteEstimee: 'important', confiance: 0.9 };
}

function attendu(bugId: string, categorie: Categorie, verdict: 'detecte' | 'rate', doublons = 1): ResultatAttendu {
  const declaration: AttenduManifeste = { bugId, nom: bugId.toLowerCase(), categorie, pages: ['/contact'], gravite: 'bloquant' };
  const anomaliesAppariees = verdict === 'detecte' ? Array.from({ length: doublons }, () => anomalie(categorie, '/contact')) : [];
  return { attendu: declaration, verdict, anomaliesAppariees };
}

function resultat(surcharges: Partial<ResultatScenario> & { scenarioId: string; langue: string }): ResultatScenario {
  return { gabarit: 'formulaire-contact', statut: 'ok', attendus: [], fauxPositifs: [], coutApi: 0, dureeMs: 0, ...surcharges };
}

/**
 * Jeu de résultats de référence :
 * - fr : sain (1 faux positif seo), f01 (détecté, 2 doublons), v01 (raté) → détection 50 %
 * - en : f01 (détecté), v01 (détecté) → détection 100 % ; r01 en erreur (raté, rien signalé)
 */
const resultats: ResultatScenario[] = [
  resultat({ scenarioId: 'sain--fr', langue: 'fr', fauxPositifs: [anomalie('seo', '/')], coutApi: 1, dureeMs: 10 }),
  resultat({ scenarioId: 'f01--fr', langue: 'fr', attendus: [attendu('F01', 'fonctionnel', 'detecte', 2)], coutApi: 2, dureeMs: 20 }),
  resultat({ scenarioId: 'v01--fr', langue: 'fr', attendus: [attendu('V01', 'visuel', 'rate')], coutApi: 3, dureeMs: 30 }),
  resultat({ scenarioId: 'f01--en', langue: 'en', attendus: [attendu('F01', 'fonctionnel', 'detecte')], coutApi: 4, dureeMs: 40 }),
  resultat({ scenarioId: 'v01--en', langue: 'en', attendus: [attendu('V01', 'visuel', 'detecte')], coutApi: 5, dureeMs: 50 }),
  resultat({
    scenarioId: 'r01--en',
    langue: 'en',
    statut: 'erreur',
    erreur: 'panne',
    attendus: [attendu('R01', 'performance', 'rate')],
    dureeMs: 60,
  }),
];

let dico: Dictionnaire;

beforeAll(async () => {
  dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
});

describe('calculerScorecard', () => {
  const scorecard = calculerScorecard(resultats, config, HORODATAGE);

  it('agrège le global : comptages, taux arrondis, coût et durée sommés', () => {
    expect(scorecard.horodatage).toBe(HORODATAGE);
    expect(scorecard.scenarios).toBe(resultats);
    expect(scorecard.global).toEqual({
      nbScenarios: 6,
      nbErreurs: 1,
      nbAttendus: 5,
      nbDetectes: 3,
      nbRates: 2,
      nbSignalements: 5,
      nbFauxPositifs: 1,
      tauxDetection: 60,
      tauxFauxPositifs: 20,
      coutApi: 15,
      dureeMs: 210,
    });
  });

  it('agrège par langue, dans l’ordre des langues de la config', () => {
    expect(Object.keys(scorecard.parLangue)).toEqual(config.langues);
    expect(scorecard.parLangue['fr']).toMatchObject({
      nbScenarios: 3,
      nbErreurs: 0,
      nbAttendus: 2,
      nbDetectes: 1,
      nbRates: 1,
      nbSignalements: 3,
      nbFauxPositifs: 1,
      tauxDetection: 50,
      tauxFauxPositifs: 33.3,
      coutApi: 6,
      dureeMs: 60,
    });
    expect(scorecard.parLangue['en']).toMatchObject({
      nbScenarios: 3,
      nbErreurs: 1,
      nbAttendus: 3,
      nbDetectes: 2,
      nbRates: 1,
      nbSignalements: 2,
      nbFauxPositifs: 0,
      tauxDetection: 66.7,
      tauxFauxPositifs: 0,
      dureeMs: 150,
    });
  });

  it('agrège par catégorie : attendus et faux positifs de la catégorie, scénarios ayant au moins un attendu', () => {
    expect(Object.keys(scorecard.parCategorie)).toEqual(['seo', 'fonctionnel', 'visuel', 'performance']);
    expect(scorecard.parCategorie['fonctionnel']).toMatchObject({
      nbScenarios: 2,
      nbAttendus: 2,
      nbDetectes: 2,
      nbSignalements: 3,
      nbFauxPositifs: 0,
      tauxDetection: 100,
      tauxFauxPositifs: 0,
      coutApi: 6,
      dureeMs: 60,
    });
    expect(scorecard.parCategorie['visuel']).toMatchObject({ nbScenarios: 2, nbAttendus: 2, nbDetectes: 1, tauxDetection: 50, dureeMs: 80 });
    expect(scorecard.parCategorie['performance']).toMatchObject({ nbScenarios: 1, nbErreurs: 1, nbAttendus: 1, nbDetectes: 0, tauxDetection: 0 });
    // Catégorie sans attendu : seulement des faux positifs, aucun scénario compté.
    expect(scorecard.parCategorie['seo']).toMatchObject({
      nbScenarios: 0,
      nbAttendus: 0,
      nbSignalements: 1,
      nbFauxPositifs: 1,
      tauxDetection: null,
      tauxFauxPositifs: 100,
      coutApi: 0,
      dureeMs: 0,
    });
  });

  it('rend null les taux sans dénominateur', () => {
    const vide = calculerScorecard([], config, HORODATAGE);
    expect(vide.global.tauxDetection).toBeNull();
    expect(vide.global.tauxFauxPositifs).toBeNull();
    expect(vide.parCategorie).toEqual({});
    expect(vide.ecartLangues).toEqual({ points: null, seuil: config.scorecard.seuilAlarmeEcartLanguesPoints, alarme: false });

    const sansSignalement = calculerScorecard([resultat({ scenarioId: 'v01--fr', langue: 'fr', attendus: [attendu('V01', 'visuel', 'rate')] })], config, HORODATAGE);
    expect(sansSignalement.global.tauxDetection).toBe(0);
    expect(sansSignalement.global.tauxFauxPositifs).toBeNull();
  });

  it('calcule l’écart inter-langues et lève l’alarme au-delà du seuil de config', () => {
    const seuil = config.scorecard.seuilAlarmeEcartLanguesPoints;
    expect(scorecard.ecartLangues).toEqual({ points: 16.7, seuil, alarme: true });

    const tolerant = calculerScorecard(resultats, configFactice({ scorecard: { ...config.scorecard, seuilAlarmeEcartLanguesPoints: 16.7 } }), HORODATAGE);
    expect(tolerant.ecartLangues.alarme).toBe(false);

    const uneSeuleLangue = calculerScorecard(
      resultats.filter((r) => r.langue === 'fr'),
      config,
      HORODATAGE,
    );
    expect(uneSeuleLangue.parLangue['en']?.tauxDetection).toBeNull();
    expect(uneSeuleLangue.ecartLangues).toEqual({ points: null, seuil, alarme: false });
  });
});

describe('rendreScorecardConsole', () => {
  it('contient le titre, les sections, les colonnes, les langues, les catégories et la ligne d’alarme', () => {
    const scorecard = calculerScorecard(resultats, config, HORODATAGE);
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    for (const cle of ['titre', 'global', 'parLangue', 'parCategorie', 'alarme']) {
      expect(rendu).toContain(traduire(dico, `scorecard.${cle}`));
    }
    for (const colonne of ['perimetre', 'scenarios', 'detection', 'detectes', 'fauxPositifs', 'rates', 'erreurs', 'coutApi', 'duree']) {
      expect(rendu).toContain(traduire(dico, `scorecard.colonnes.${colonne}`));
    }
    // Une ligne de données par périmètre : le périmètre en tête de ligne, puis le nombre de scénarios (une sous-chaîne d'en-tête ne suffit pas).
    const lignes = rendu.split('\n');
    for (const perimetre of [...config.langues, ...Object.keys(scorecard.parCategorie)]) {
      expect(lignes.filter((ligne) => new RegExp(`^${perimetre}\\s{2,}\\d`).test(ligne))).toHaveLength(1);
    }
    const pourcentage = new Intl.NumberFormat(config.langueConsole, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    expect(rendu).toContain(pourcentage.format(0.6));
    expect(rendu).toContain(pourcentage.format(0.333));
    expect(rendu).toContain(traduire(dico, 'scorecard.ecartLangues', { points: new Intl.NumberFormat(config.langueConsole).format(16.7), seuil: '5' }));
    expect(rendu).toContain(traduire(dico, 'scorecard.nonApplicable'));
  });

  it('affiche l’écart non calculable et aucune alarme quand une seule langue est notable', () => {
    const scorecard = calculerScorecard(
      resultats.filter((r) => r.langue === 'fr'),
      config,
      HORODATAGE,
    );
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    expect(rendu).toContain(traduire(dico, 'scorecard.ecartLanguesNonCalculable'));
    expect(rendu).not.toContain(traduire(dico, 'scorecard.alarme'));
  });

  it('aligne les colonnes : toutes les lignes d’un tableau ont la même largeur', () => {
    const rendu = rendreScorecardConsole(calculerScorecard(resultats, config, HORODATAGE), dico, config.langueConsole);
    const blocs = rendu.split('\n\n');
    // Blocs 1 à 3 = les trois tableaux (titre avant, écart après).
    for (const bloc of blocs.slice(1, 4)) {
      const lignes = bloc.split('\n').slice(1);
      const largeurs = new Set(lignes.map((ligne) => ligne.length));
      expect(largeurs.size).toBe(1);
    }
  });
});

describe('ecrireScorecard', () => {
  const dossiers: string[] = [];

  afterEach(async () => {
    await Promise.all(dossiers.splice(0).map((dossier) => rm(dossier, { recursive: true, force: true })));
  });

  it('écrit la scorecard complète dans <dossier>/<horodatage sans ":">.json, en créant le dossier', async () => {
    const racine = await mkdtemp(path.join(tmpdir(), 'zurvela-scorecard-'));
    dossiers.push(racine);
    const dossier = path.join(racine, 'resultats');
    const scorecard = calculerScorecard(resultats, config, HORODATAGE);

    const fichier = await ecrireScorecard(scorecard, dossier);

    expect(fichier).toBe(path.join(dossier, '2026-09-22T10-20-30.000Z.json'));
    const contenu = await readFile(fichier, 'utf8');
    expect(contenu.endsWith('\n')).toBe(true);
    expect(JSON.parse(contenu)).toEqual(JSON.parse(JSON.stringify(scorecard)));
  });
});
