import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie, Categorie } from '../../core/types.js';
import { depuisRacine } from '../outils/racine.js';
import { configFactice } from '../scenarios/factices.js';
import {
  POLITIQUE_DETERMINISTE,
  type AttenduBug,
  type AttenduProfil,
  type ComptesProtocole,
  type ResultatAttendu,
  type ResultatProfil,
  type AttenduRapport,
  type ResultatRapport,
  type ResultatScenario,
} from '../types.js';
import { calculerScorecard, ecrireScorecard, purgerResultats, rendreScorecardConsole } from './scorecard.js';

const HORODATAGE = '2026-09-22T10:20:30.000Z';
const config = configFactice();

function anomalie(categorie: Categorie, urlOuEtape: string): Anomalie {
  return { categorie, description: '', urlOuEtape, graviteEstimee: 'important', confiance: 0.9 };
}

function attendu(
  bugId: string,
  categorie: Categorie,
  verdict: 'detecte' | 'rate',
  doublons = 1,
  bienJuge = verdict === 'detecte',
): ResultatAttendu {
  const declaration: AttenduBug = { nature: 'bug', bugId, nom: bugId.toLowerCase(), categorie, pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' };
  const anomaliesAppariees = verdict === 'detecte' ? Array.from({ length: doublons }, () => anomalie(categorie, '/contact')) : [];
  return { attendu: declaration, verdict, anomaliesAppariees, verdictRendu: bienJuge ? 'confirmee' : null, bienJuge };
}

function resultat(surcharges: Partial<ResultatScenario> & { scenarioId: string; langue: string }): ResultatScenario {
  const coutApi = surcharges.coutApi ?? 0;
  return {
    gabarit: 'formulaire-contact',
    politique: POLITIQUE_DETERMINISTE,
    statut: 'ok',
    attendus: [],
    profils: [],
    cibles: [],
    rapports: [],
    nbReplisDecision: 0,
    fauxPositifs: [],
    coutApi,
    // Par défaut, tout le coût est du PROFILAGE : c'est l'état d'avant la
    // navigation IA, et il garde les agrégats historiques lisibles. Les tests
    // qui éprouvent la ventilation le surchargent explicitement.
    coutApiParFamille: { exploration: 0, profilage: coutApi, confirmation: 0, redaction: 0 },
    dureeMs: 0,
    ...surcharges,
  };
}

/**
 * Résultat d'un attendu de PROFIL. `inertieEprouvee` choisit la famille :
 * « profils corrects » au repos, « inerties tenues » sous charge d'injection.
 */
function profil(satisfait: boolean, inertieEprouvee = false, nonMesure = false): ResultatProfil {
  const attenduProfil: AttenduProfil = { nature: 'profil', typeSite: 'vitrine-contact', langue: null, inertieEprouvee };
  const rapporte = { typeSite: 'vitrine-contact', natureLibre: null, langue: 'fr', confiance: 0.9, versionPrompt: 'v1', modeleDemande: 'modele-de-test', modeleServi: 'modele-de-test-20260101', apresRelance: false };
  return {
    attendu: attenduProfil,
    langueAttendue: 'fr',
    ...(nonMesure ? {} : { profil: satisfait ? rapporte : { ...rapporte, typeSite: 'boutique' } }),
    nonMesure,
    satisfait: satisfait && !nonMesure,
  };
}

/**
 * Comptes du protocole d'un scénario, dans l'ordre des colonnes affichées :
 * candidates → groupes → retenus → écartés → évitées → perdues → non appariés.
 * `nbGroupes` est passé EXPLICITEMENT (et non déduit) pour que l'assertion de
 * cohérence `nbGroupes === nbGroupesRetenus + nbGroupesEcartes` porte sur une
 * valeur qu'un jeu d'essai pourrait démentir.
 */
function protocole(
  nbCandidates: number,
  nbGroupes: number,
  nbGroupesRetenus: number,
  nbGroupesEcartes: number,
  nbFaussesAlertesEvitees: number,
  nbPertesProtocole: number,
  nbEcartesNonApparies: number,
): ComptesProtocole {
  return {
    nbCandidates,
    nbGroupes,
    nbGroupesRetenus,
    nbGroupesEcartes,
    nbFaussesAlertesEvitees,
    nbPertesProtocole,
    nbEcartesNonApparies,
  };
}

/**
 * Jeu de résultats de référence :
 * - fr : sain (1 faux positif seo), f01 (détecté, 2 doublons), v01 (raté) → détection 50 %
 * - en : f01 (détecté, bien jugé), v01 (détecté mais MAL jugé) ; r01 en erreur (raté, rien signalé)
 *
 * Côté protocole : `f01--en` n'a AUCUN compte (sujet sans protocole), `r01--en`
 * en erreur en a d'explicitement nuls, `sain--fr` a un groupe écarté NON
 * APPARIÉ (ni crédité, ni imputé) et `v01--fr` a une anomalie réelle PERDUE —
 * de quoi vérifier que le chiffre commercial ne se lit pas seul.
 */
const resultats: ResultatScenario[] = [
  resultat({ scenarioId: 'sain--fr', langue: 'fr', fauxPositifs: [anomalie('seo', '/')], coutApi: 1, dureeMs: 10, protocole: protocole(3, 3, 1, 2, 1, 0, 1) }),
  resultat({ scenarioId: 'f01--fr', langue: 'fr', attendus: [attendu('F01', 'fonctionnel', 'detecte', 2)], coutApi: 2, dureeMs: 20, protocole: protocole(4, 3, 2, 1, 1, 0, 0) }),
  resultat({ scenarioId: 'v01--fr', langue: 'fr', attendus: [attendu('V01', 'visuel', 'rate')], coutApi: 3, dureeMs: 30, protocole: protocole(2, 1, 0, 1, 0, 1, 0) }),
  resultat({ scenarioId: 'f01--en', langue: 'en', attendus: [attendu('F01', 'fonctionnel', 'detecte')], coutApi: 4, dureeMs: 40 }),
  resultat({ scenarioId: 'v01--en', langue: 'en', attendus: [attendu('V01', 'visuel', 'detecte', 1, false)], coutApi: 5, dureeMs: 50, protocole: protocole(1, 1, 1, 0, 0, 0, 0) }),
  resultat({
    scenarioId: 'r01--en',
    langue: 'en',
    statut: 'erreur',
    erreur: 'panne',
    attendus: [attendu('R01', 'performance', 'rate')],
    dureeMs: 60,
    protocole: protocole(0, 0, 0, 0, 0, 0, 0),
  }),
];

let dico: Dictionnaire;

beforeAll(async () => {
  dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
});

describe('calculerScorecard', () => {
  const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);

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
      nbVerdictsCorrects: 2,
      // Les doublures de ce test ne portent aucune anomalie appariée, donc
      // aucune gravité n'y est PUBLIÉE : le dénominateur est nul, et le taux
      // est `null` — « aucune gravité à juger » n'est pas « 0 % de gravités
      // justes ».
      nbGravitesConformes: 0,
      nbGravitesMesurees: 0,
      nbCandidates: 10,
      nbGroupes: 8,
      nbGroupesRetenus: 4,
      nbGroupesEcartes: 4,
      nbFaussesAlertesEvitees: 2,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 1,
      nbProfilsMesures: 0,
      nbProfilsCorrects: 0,
      nbInertiesMesurees: 0,
      nbInertiesTenues: 0,
      nbProfilsNonMesures: 0,
      tauxDetection: 60,
      tauxVerdictsCorrects: 40,
      tauxGravitesConformes: null,
      tauxFauxPositifs: 20,
      tauxProfilsCorrects: null,
      tauxInertiesTenues: null,
      nbCiblesMesurees: 0,
      nbCiblesConformes: 0,
      nbCiblesNonMesurees: 0,
      tauxCiblesConformes: null,
      nbInertiesParcoursMesurees: 0,
      nbInertiesParcoursTenues: 0,
      tauxInertiesParcoursTenues: null,
      nbRapportsMesures: 0,
      nbRapportsConformes: 0,
      nbRapportsNonMesures: 0,
      tauxRapportsConformes: null,
      nbInertiesRapportMesurees: 0,
      nbInertiesRapportTenues: 0,
      tauxInertiesRapportTenues: null,
      nbSectionsRapport: 0,
      nbSectionsRedigees: 0,
      tauxCouvertureRedaction: null,
      nbCandidatesRejouables: 0,
      nbCandidatesRejouees: 0,
      nbGroupesRejouables: 0,
      nbGroupesRejoues: 0,
      tauxRejouabiliteCandidates: null,
      tauxRejouabiliteGroupes: null,
      nbAttendusCauseUnique: 0,
      nbConstatsEnDouble: 0,
      nbRapportsSansProse: 0,
      nbRapportsSansSection: 0,
      nbPagesVisitees: 0,
      nbPagesUtiles: 0,
      nbScenariosSansPageUtile: 0,
      tauxEfficacite: null,
      coutParScan: 2.5,
      coutApi: 15,
      coutApiExploration: 0,
      coutApiProfilage: 15,
      coutApiConfirmation: 0,
      coutApiRedaction: 0,
      nbReplisDecision: 0,
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
      nbVerdictsCorrects: 1,
      tauxDetection: 50,
      tauxVerdictsCorrects: 50,
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
      nbVerdictsCorrects: 1,
      tauxDetection: 66.7,
      tauxVerdictsCorrects: 33.3,
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
      nbVerdictsCorrects: 2,
      tauxDetection: 100,
      tauxVerdictsCorrects: 100,
      tauxFauxPositifs: 0,
      coutApi: 6,
      dureeMs: 60,
    });
    // Visuel : un attendu détecté mais mal jugé → détection 50 %, verdicts corrects 0 %.
    expect(scorecard.parCategorie['visuel']).toMatchObject({
      nbScenarios: 2,
      nbAttendus: 2,
      nbDetectes: 1,
      nbVerdictsCorrects: 0,
      tauxDetection: 50,
      tauxVerdictsCorrects: 0,
      dureeMs: 80,
    });
    expect(scorecard.parCategorie['performance']).toMatchObject({ nbScenarios: 1, nbErreurs: 1, nbAttendus: 1, nbDetectes: 0, tauxDetection: 0 });
    // Catégorie sans attendu : seulement des faux positifs, aucun scénario compté.
    expect(scorecard.parCategorie['seo']).toMatchObject({
      nbScenarios: 0,
      nbAttendus: 0,
      nbSignalements: 1,
      nbFauxPositifs: 1,
      nbVerdictsCorrects: 0,
      tauxDetection: null,
      tauxVerdictsCorrects: null,
      tauxFauxPositifs: 100,
      coutApi: 0,
      dureeMs: 0,
    });
  });

  it('rend null les taux sans dénominateur', () => {
    const vide = calculerScorecard([], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(vide.global.tauxDetection).toBeNull();
    expect(vide.global.tauxVerdictsCorrects).toBeNull();
    expect(vide.global.tauxFauxPositifs).toBeNull();
    expect(vide.parCategorie).toEqual({});
    expect(vide.ecartLangues).toEqual({ points: null, seuil: config.scorecard.seuilAlarmeEcartLanguesPoints, alarme: false });

    const sansSignalement = calculerScorecard([resultat({ scenarioId: 'v01--fr', langue: 'fr', attendus: [attendu('V01', 'visuel', 'rate')] })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(sansSignalement.global.tauxDetection).toBe(0);
    expect(sansSignalement.global.tauxVerdictsCorrects).toBe(0);
    expect(sansSignalement.global.tauxFauxPositifs).toBeNull();
  });

  it('calcule l’écart inter-langues et lève l’alarme au-delà du seuil de config', () => {
    const seuil = config.scorecard.seuilAlarmeEcartLanguesPoints;
    expect(scorecard.ecartLangues).toEqual({ points: 16.7, seuil, alarme: true });

    const tolerant = calculerScorecard(resultats, configFactice({ scorecard: { ...config.scorecard, seuilAlarmeEcartLanguesPoints: 16.7 } }), HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(tolerant.ecartLangues.alarme).toBe(false);

    const uneSeuleLangue = calculerScorecard(
      resultats.filter((r) => r.langue === 'fr'),
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(uneSeuleLangue.parLangue['en']?.tauxDetection).toBeNull();
    expect(uneSeuleLangue.ecartLangues).toEqual({ points: null, seuil, alarme: false });
  });
});

describe('rendreScorecardConsole', () => {
  it('contient le titre, les sections, les colonnes, les langues, les catégories et la ligne d’alarme', () => {
    const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    for (const cle of ['titre', 'global', 'parLangue', 'parCategorie', 'alarme']) {
      expect(rendu).toContain(traduire(dico, `scorecard.${cle}`));
    }
    for (const colonne of ['perimetre', 'scenarios', 'detection', 'verdictsCorrects', 'detectes', 'fauxPositifs', 'rates', 'erreurs', 'coutApi', 'duree']) {
      expect(rendu).toContain(traduire(dico, `scorecard.colonnes.${colonne}`));
    }
    // Le périmètre est en tête de ligne, suivi d'un nombre (une sous-chaîne
    // d'en-tête ne suffit pas). Une langue apparaît TROIS fois (tableaux de
    // détection, du protocole et du couple coût/efficacité), une catégorie de
    // bug UNE seule : ni le protocole ni le coût ne se ventilent par
    // catégorie.
    const lignes = rendu.split('\n');
    const nonApplicable = traduire(dico, 'scorecard.nonApplicable');
    for (const langue of config.langues) {
      // Quatre tableaux partitionnants par langue depuis P2-1 : global, protocole, rejouabilité, coût.
      expect(lignes.filter((ligne) => new RegExp(`^${langue}\\s{2,}\\d`).test(ligne))).toHaveLength(4);
    }
    // Une catégorie de bug NE partitionne pas les scénarios : sa ligne existe,
    // mais la colonne « Scénarios » — comme erreurs, coût et durée — y est sans
    // objet. Afficher un nombre ferait une somme qui contredit le total
    // (APPRENTISSAGES n°4).
    for (const categorie of Object.keys(scorecard.parCategorie)) {
      expect(lignes.filter((ligne) => new RegExp(`^${categorie}\\s{2,}\\d`).test(ligne))).toHaveLength(0);
      const ligneCategorie = lignes.filter((ligne) => new RegExp(`^${categorie}\\s{2,}${nonApplicable}\\s`).test(ligne));
      expect(ligneCategorie).toHaveLength(1);
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
      POLITIQUE_DETERMINISTE,
    );
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    expect(rendu).toContain(traduire(dico, 'scorecard.ecartLanguesNonCalculable'));
    expect(rendu).not.toContain(traduire(dico, 'scorecard.alarme'));
  });

  it('place « Verdicts corrects » juste après « Détection » et rend le taux de chaque périmètre', () => {
    const rendu = rendreScorecardConsole(calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE), dico, config.langueConsole);
    const lignes = rendu.split('\n');
    const entete = lignes.find((ligne) => ligne.includes(traduire(dico, 'scorecard.colonnes.perimetre'))) ?? '';
    const positions = ['detection', 'verdictsCorrects', 'detectes'].map((colonne) => entete.indexOf(traduire(dico, `scorecard.colonnes.${colonne}`)));
    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const pourcentage = new Intl.NumberFormat(config.langueConsole, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const ligneGlobale = lignes.find((ligne) => new RegExp(`^${traduire(dico, 'scorecard.global')}\\s{2,}\\d`).test(ligne)) ?? '';
    // Détection 60 % puis verdicts corrects 40 % : deux colonnes distinctes, dans cet ordre.
    expect(ligneGlobale.indexOf(pourcentage.format(0.4))).toBeGreaterThan(ligneGlobale.indexOf(pourcentage.format(0.6)));
    expect(ligneGlobale.indexOf(pourcentage.format(0.6))).toBeGreaterThan(0);
  });

  it('aligne les colonnes : toutes les lignes d’un tableau ont la même largeur', () => {
    const rendu = rendreScorecardConsole(calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE), dico, config.langueConsole);
    const blocs = rendu.split('\n\n');
    // Blocs 1 à 4 = les quatre tableaux (titre avant, synthèse et écart après).
    for (const bloc of blocs.slice(1, 5)) {
      const lignes = bloc.split('\n').slice(1);
      const largeurs = new Set(lignes.map((ligne) => ligne.length));
      expect(largeurs.size).toBe(1);
    }
  });
});

describe('agrégats du protocole anti-faux-positifs', () => {
  const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);

  it('somme les sept compteurs par langue', () => {
    // fr : sain (3,3,1,2,1,0,1) + f01 (4,3,2,1,1,0,0) + v01 (2,1,0,1,0,1,0).
    expect(scorecard.parLangue['fr']).toMatchObject({
      nbCandidates: 9,
      nbGroupes: 7,
      nbGroupesRetenus: 3,
      nbGroupesEcartes: 4,
      nbFaussesAlertesEvitees: 2,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 1,
    });
    // en : f01 SANS comptes (sujet sans protocole) + v01 (1,1,1,0,0,0,0) + r01 en erreur (tout à zéro).
    expect(scorecard.parLangue['en']).toMatchObject({
      nbCandidates: 1,
      nbGroupes: 1,
      nbGroupesRetenus: 1,
      nbGroupesEcartes: 0,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 0,
      nbEcartesNonApparies: 0,
    });
  });

  it('D4/D5 — assertion de cohérence : sur un périmètre qui PARTITIONNE, nbGroupes === nbGroupesRetenus + nbGroupesEcartes', () => {
    for (const agregat of [scorecard.global, ...Object.values(scorecard.parLangue)]) {
      expect(agregat.nbGroupes).toBe(agregat.nbGroupesRetenus + agregat.nbGroupesEcartes);
    }
    // La somme des langues égale le global : c'est ce qui définit un périmètre
    // qui partitionne, et ce qui rend le tableau affiché lisible verticalement.
    const langues = Object.values(scorecard.parLangue);
    for (const cle of ['nbCandidates', 'nbGroupes', 'nbGroupesRetenus', 'nbGroupesEcartes', 'nbFaussesAlertesEvitees', 'nbPertesProtocole', 'nbEcartesNonApparies'] as const) {
      expect(langues.reduce((total, agregat) => total + agregat[cle], 0)).toBe(scorecard.global[cle]);
    }
  });

  it('garde les compteurs par catégorie dans le JSON, en sachant qu’ils ne partitionnent PAS', () => {
    expect(scorecard.parCategorie['fonctionnel']).toMatchObject({
      nbCandidates: 4,
      nbGroupes: 3,
      nbGroupesRetenus: 2,
      nbGroupesEcartes: 1,
      nbFaussesAlertesEvitees: 1,
      nbPertesProtocole: 0,
      nbEcartesNonApparies: 0,
    });
    expect(scorecard.parCategorie['visuel']).toMatchObject({
      nbCandidates: 3,
      nbGroupes: 2,
      nbGroupesRetenus: 1,
      nbGroupesEcartes: 1,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 0,
    });
    // La catégorie du scénario en ERREUR ne compte rien : son résultat porte des comptes nuls.
    expect(scorecard.parCategorie['performance']).toMatchObject({ nbCandidates: 0, nbGroupes: 0, nbGroupesEcartes: 0 });
    // seo n'a aucun attendu : aucun scénario compté, donc aucune candidate —
    // alors même que le scénario sain qui l'a produite en a trois au global.
    expect(scorecard.parCategorie['seo']).toMatchObject({ nbCandidates: 0, nbGroupes: 0, nbFaussesAlertesEvitees: 0 });
  });

  it('D4/D5 — un scénario multi-catégories est compté ENTIER dans chaque catégorie : la somme dépasse le global', () => {
    const multi = calculerScorecard(
      [
        resultat({
          scenarioId: 'f01-v01--fr',
          langue: 'fr',
          attendus: [attendu('F01', 'fonctionnel', 'detecte'), attendu('V01', 'visuel', 'detecte')],
          protocole: protocole(5, 3, 2, 1, 1, 0, 0),
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(multi.global.nbCandidates).toBe(5);
    expect(multi.parCategorie['fonctionnel']?.nbCandidates).toBe(5);
    expect(multi.parCategorie['visuel']?.nbCandidates).toBe(5);
    // 5 + 5 = 10 candidates pour un global de 5 : additionner ces lignes n'a
    // aucun sens, c'est pourquoi le rendu console ne les affiche pas.
    const sommeCategories = Object.values(multi.parCategorie).reduce((total, agregat) => total + agregat.nbCandidates, 0);
    expect(sommeCategories).toBeGreaterThan(multi.global.nbCandidates);
  });

  it('rend zéro et jamais undefined quand aucun scénario ne porte de comptes', () => {
    const sansProtocole = calculerScorecard([resultat({ scenarioId: 'f01--fr', langue: 'fr', attendus: [attendu('F01', 'fonctionnel', 'detecte')] })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    for (const agregat of [sansProtocole.global, sansProtocole.parLangue['fr'], sansProtocole.parCategorie['fonctionnel']]) {
      expect(agregat).toMatchObject({
        nbCandidates: 0,
        nbGroupes: 0,
        nbGroupesRetenus: 0,
        nbGroupesEcartes: 0,
        nbFaussesAlertesEvitees: 0,
        nbPertesProtocole: 0,
        nbEcartesNonApparies: 0,
      });
    }
    expect(calculerScorecard([], config, HORODATAGE, POLITIQUE_DETERMINISTE).global).toMatchObject({ nbCandidates: 0, nbPertesProtocole: 0, nbEcartesNonApparies: 0 });
  });
});

describe('rendreScorecardConsole — tableau du protocole', () => {
  /** Lignes du bloc « Protocole anti-faux-positifs » (titre, en-têtes, trait, puis une ligne par périmètre). */
  function blocProtocole(rendu: string): string[] {
    const titre = traduire(dico, 'scorecard.protocole');
    return (rendu.split('\n\n').find((bloc) => bloc.startsWith(titre)) ?? '').split('\n');
  }

  /** Le dictionnaire n'est chargé qu'au `beforeAll` : le rendu se calcule dans le test, pas à la collecte. */
  const rendre = (): string => rendreScorecardConsole(calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE), dico, config.langueConsole);

  it('affiche les huit colonnes du protocole, dans l’ordre du périmètre vers les non appariés', () => {
    const entete = blocProtocole(rendre())[1] ?? '';
    const positions = ['perimetre', 'candidates', 'groupes', 'retenues', 'ecartees', 'faussesAlertesEvitees', 'anomaliesPerdues', 'ecartesNonApparies'].map(
      (colonne) => entete.indexOf(traduire(dico, `scorecard.colonnes.${colonne}`)),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('D4/D5 — n’affiche QUE les périmètres qui partitionnent (global, langues), aux valeurs exactes', () => {
    const lignes = blocProtocole(rendre())
      .slice(3)
      .map((ligne) => ligne.trim().split(/\s+/));
    expect(lignes).toEqual([
      [traduire(dico, 'scorecard.global'), '10', '8', '4', '4', '2', '1', '1'],
      ['fr', '9', '7', '3', '4', '2', '1', '1'],
      ['en', '1', '1', '1', '0', '0', '0', '0'],
    ]);
  });

  it('D4/D5 — aucune ligne de catégorie de bug dans le tableau du protocole (un groupe de cause racine ne s’y ventile pas)', () => {
    const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);
    const lignes = blocProtocole(rendre()).slice(3);
    for (const categorie of Object.keys(scorecard.parCategorie)) {
      expect(lignes.some((ligne) => ligne.startsWith(categorie))).toBe(false);
    }
    // Les catégories restent affichées dans le tableau de détection, lui.
    expect(rendre()).toContain(traduire(dico, 'scorecard.parCategorie'));
  });

  it('D4/D5 — chaque ligne affichée est arithmétiquement juste : groupes = retenus + écartés', () => {
    for (const ligne of blocProtocole(rendre()).slice(3)) {
      const cellules = ligne.trim().split(/\s+/);
      const [groupes, retenus, ecartes] = [cellules[2], cellules[3], cellules[4]].map((valeur) => Number(valeur));
      expect(groupes).toBe((retenus ?? 0) + (ecartes ?? 0));
    }
  });

  it('D8 — la synthèse cite les TROIS nombres : évitées, perdues et non appariées', () => {
    const rendu = rendre();
    expect(rendu).toContain(
      traduire(dico, 'scorecard.syntheseProtocole', {
        candidates: '10',
        groupes: '8',
        retenues: '4',
        ecartees: '4',
        evitees: '2',
        perdues: '1',
        nonApparies: '1',
        scenarios: '6',
      }),
    );

    // Même sans perte ni non-apparié, les trois nombres restent cités : le
    // chiffre commercial ne s'imprime jamais seul.
    const sansPerte = resultats.map((resultat) =>
      resultat.protocole === undefined
        ? resultat
        : { ...resultat, protocole: { ...resultat.protocole, nbPertesProtocole: 0, nbEcartesNonApparies: 0 } },
    );
    const renduSansPerte = rendreScorecardConsole(calculerScorecard(sansPerte, config, HORODATAGE, POLITIQUE_DETERMINISTE), dico, config.langueConsole);
    expect(renduSansPerte).toContain(
      traduire(dico, 'scorecard.syntheseProtocole', {
        candidates: '10',
        groupes: '8',
        retenues: '4',
        ecartees: '4',
        evitees: '2',
        perdues: '0',
        nonApparies: '0',
        scenarios: '6',
      }),
    );
  });

  it('lève l’alarme des pertes dès qu’une anomalie réelle a été écartée, et se tait sinon', () => {
    expect(rendre()).toContain(traduire(dico, 'scorecard.alarmePertes', { perdues: '1' }));

    const sansPerte = resultats.map((resultat) =>
      resultat.protocole === undefined ? resultat : { ...resultat, protocole: { ...resultat.protocole, nbPertesProtocole: 0 } },
    );
    const renduSansPerte = rendreScorecardConsole(calculerScorecard(sansPerte, config, HORODATAGE, POLITIQUE_DETERMINISTE), dico, config.langueConsole);
    expect(renduSansPerte).not.toContain(traduire(dico, 'scorecard.alarmePertes', { perdues: '0' }));
    expect(renduSansPerte).toContain(traduire(dico, 'scorecard.protocole'));
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
    const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);

    const fichier = await ecrireScorecard(scorecard, dossier);

    expect(fichier).toBe(path.join(dossier, '2026-09-22T10-20-30.000Z.json'));
    const contenu = await readFile(fichier, 'utf8');
    expect(contenu.endsWith('\n')).toBe(true);
    expect(JSON.parse(contenu)).toEqual(JSON.parse(JSON.stringify(scorecard)));
  });
});

describe('purgerResultats', () => {
  const dossiers: string[] = [];

  afterEach(async () => {
    await Promise.all(dossiers.splice(0).map((dossier) => rm(dossier, { recursive: true, force: true })));
  });

  /** Un dossier temporaire peuplé de scorecards nommées par horodatage, écrites dans le DÉSORDRE, plus des intrus. */
  async function dossierPeuple(horodatages: string[]): Promise<string> {
    const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-purge-'));
    dossiers.push(dossier);
    for (const horodatage of [...horodatages].reverse()) {
      await writeFile(path.join(dossier, `${horodatage}.json`), '{}\n', 'utf8');
    }
    await writeFile(path.join(dossier, '.gitkeep'), '', 'utf8');
    await writeFile(path.join(dossier, 'notes.txt'), 'pas une scorecard', 'utf8');
    await mkdir(path.join(dossier, 'archive.json'));
    return dossier;
  }

  const HORODATAGES = [
    '2026-09-20T10-00-00.000Z',
    '2026-09-21T09-00-00.000Z',
    '2026-09-21T23-59-59.999Z',
    '2026-09-22T00-00-00.000Z',
    '2026-09-22T10-20-30.000Z',
  ];

  it('garde les N scorecards les plus récentes (ordre des noms), supprime les autres et retourne leurs chemins', async () => {
    const dossier = await dossierPeuple(HORODATAGES);

    const purges = await purgerResultats(dossier, 2);

    expect(purges).toEqual(HORODATAGES.slice(0, 3).map((horodatage) => path.join(dossier, `${horodatage}.json`)));
    const restants = (await readdir(dossier)).sort();
    expect(restants).toEqual(['.gitkeep', '2026-09-22T00-00-00.000Z.json', '2026-09-22T10-20-30.000Z.json', 'archive.json', 'notes.txt']);
  });

  it('ne supprime rien quand le dossier contient au plus N scorecards, et laisse .gitkeep et les non-.json en paix', async () => {
    const dossier = await dossierPeuple(HORODATAGES);
    const avant = (await readdir(dossier)).sort();

    expect(await purgerResultats(dossier, HORODATAGES.length)).toEqual([]);
    expect(await purgerResultats(dossier, 100)).toEqual([]);
    expect((await readdir(dossier)).sort()).toEqual(avant);
  });

  it('s’enchaîne avec ecrireScorecard : la scorecard qui vient d’être écrite est la plus récente et survit', async () => {
    const dossier = await dossierPeuple(HORODATAGES.slice(0, 2));
    const fichier = await ecrireScorecard(calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE), dossier);

    const purges = await purgerResultats(dossier, 1);

    expect(purges).toHaveLength(2);
    expect(purges).not.toContain(fichier);
    const scorecards = (await readdir(dossier, { withFileTypes: true })).filter((entree) => entree.isFile() && entree.name.endsWith('.json'));
    expect(scorecards.map((entree) => entree.name)).toEqual([path.basename(fichier)]);
  });
});


describe('scorecard — les deux familles de profil, comptées séparément de la détection', () => {
  /**
   * Un jeu conçu pour que les deux familles ne puissent pas se confondre :
   * - fr : deux profils au repos, l'un correct, l'autre faux ; une inertie tenue ;
   * - en : une inertie NON tenue et un attendu NON MESURÉ (mode dégradé).
   * La détection est volontairement parfaite partout : si un échec de profil
   * la touchait, on le verrait immédiatement.
   */
  const avecProfils: ResultatScenario[] = [
    resultat({ scenarioId: 'sain--fr', langue: 'fr', profils: [profil(true)], coutApi: 1 }),
    resultat({ scenarioId: 'f01--fr', langue: 'fr', attendus: [attendu('F01', 'fonctionnel', 'detecte')], profils: [profil(false)], coutApi: 2 }),
    resultat({ scenarioId: 's01--fr', langue: 'fr', profils: [profil(true, true)], coutApi: 3 }),
    resultat({ scenarioId: 's01--en', langue: 'en', profils: [profil(false, true)], coutApi: 4 }),
    resultat({ scenarioId: 'sain--en', langue: 'en', profils: [profil(false, false, true)], coutApi: 5 }),
  ];
  const scorecard = calculerScorecard(avecProfils, config, HORODATAGE, POLITIQUE_DETERMINISTE);

  it('range chaque attendu dans SA famille selon inertieEprouvee', () => {
    expect(scorecard.global).toMatchObject({
      nbProfilsMesures: 2,
      nbProfilsCorrects: 1,
      nbInertiesMesurees: 2,
      nbInertiesTenues: 1,
      nbProfilsNonMesures: 1,
      tauxProfilsCorrects: 50,
      tauxInertiesTenues: 50,
    });
  });

  it('ne touche NI à la détection NI aux faux positifs : ce sont des familles distinctes', () => {
    // Trois profils faux ou non mesurés, et pourtant la détection reste
    // parfaite et aucun faux positif n'apparaît.
    expect(scorecard.global).toMatchObject({
      nbAttendus: 1,
      nbDetectes: 1,
      nbRates: 0,
      tauxDetection: 100,
      nbFauxPositifs: 0,
    });
  });

  it('sort les NON MESURÉS des deux dénominateurs, et les compte dans leur propre colonne', () => {
    // `sain--en` porte le seul attendu non mesuré : la langue `en` compte donc
    // une inertie mesurée (non tenue) et un non-mesuré, pas deux échecs.
    expect(scorecard.parLangue['en']).toMatchObject({
      nbProfilsMesures: 0,
      nbInertiesMesurees: 1,
      nbInertiesTenues: 0,
      nbProfilsNonMesures: 1,
      tauxProfilsCorrects: null,
      tauxInertiesTenues: 0,
    });
    // Un run entièrement dégradé (--sans-ia) : aucun taux inventé, tout en
    // colonne « non mesurés ». Ni 0 % (qui accuserait le moteur), ni 100 %.
    const degrade = calculerScorecard(
      [resultat({ scenarioId: 'sain--fr', langue: 'fr', profils: [profil(false, false, true), profil(false, true, true)] })],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(degrade.global).toMatchObject({
      nbProfilsMesures: 0,
      nbInertiesMesurees: 0,
      nbProfilsNonMesures: 2,
      tauxProfilsCorrects: null,
      tauxInertiesTenues: null,
    });
  });

  it('les langues PARTITIONNENT les attendus de profil : leur somme égale le global', () => {
    const langues = Object.values(scorecard.parLangue);
    const somme = (lire: (agregat: (typeof langues)[number]) => number): number => langues.reduce((total, agregat) => total + lire(agregat), 0);
    expect(somme((agregat) => agregat.nbProfilsMesures)).toBe(scorecard.global.nbProfilsMesures);
    expect(somme((agregat) => agregat.nbInertiesMesurees)).toBe(scorecard.global.nbInertiesMesurees);
    expect(somme((agregat) => agregat.nbProfilsNonMesures)).toBe(scorecard.global.nbProfilsNonMesures);
  });

  it('ne verse AUCUN attendu de profil dans le périmètre « catégorie de bug », qui ne partitionne pas', () => {
    // Un scénario multi-catégories y serait compté plusieurs fois : la somme
    // des lignes dépasserait le global (APPRENTISSAGES n°4).
    for (const agregat of Object.values(scorecard.parCategorie)) {
      expect(agregat).toMatchObject({ nbProfilsMesures: 0, nbInertiesMesurees: 0, nbProfilsNonMesures: 0 });
    }
  });

  it('affiche les deux familles, leur détail et le coût dans le rendu console', () => {
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    expect(rendu).toContain(traduire(dico, 'scorecard.profils'));
    expect(rendu).toContain(traduire(dico, 'scorecard.colonnes.profilsCorrects'));
    expect(rendu).toContain(traduire(dico, 'scorecard.colonnes.inertiesTenues'));
    expect(rendu).toContain(traduire(dico, 'scorecard.colonnes.profilsNonMesures'));
    // La synthèse cite les deux familles ET le coût : jamais un chiffre seul.
    expect(rendu).toContain(
      traduire(dico, 'scorecard.syntheseProfils', {
        profilsCorrects: 1,
        profilsMesures: 2,
        inertiesTenues: 1,
        inertiesMesurees: 2,
        nonMesures: 1,
        cout: '15,00',
      }),
    );
    // Les non-mesurés parlent : une mesure absente n'est jamais un zéro tu.
    expect(rendu).toContain(traduire(dico, 'scorecard.profilsNonMesures', { nonMesures: 1 }));
  });

  /**
   * LE COÛT AFFICHÉ DANS CETTE FAMILLE EST CELUI DU PROFILAGE, jamais le total
   * du scan. C'est la garde permanente du défaut que la revue de la brique 4b
   * a trouvé : tant que l'exploration ne coûtait rien, les deux se
   * confondaient ; depuis, deux runs aux mêmes cassettes de profil et aux
   * mêmes profils corrects affichaient des coûts d'un ordre de grandeur
   * différent sous l'étiquette « Profilage ».
   */
  it('n’impute PAS le coût des décisions de navigation à la famille des profils', () => {
    const coutParFamille = { exploration: 90, profilage: 3, confirmation: 5, redaction: 2 };
    const avecNavigation = calculerScorecard(
      [resultat({ scenarioId: 'sain--fr', langue: 'fr', profils: [profil(true)], coutApi: 100, coutApiParFamille: coutParFamille })],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(avecNavigation.global).toMatchObject({
      coutApi: 100,
      coutApiExploration: 90,
      coutApiProfilage: 3,
      coutApiConfirmation: 5,
      // La QUATRIÈME famille : la rédaction a sa part, et elle ne se range
      // dans aucune des trois autres. Les quatre partitionnent — leur somme
      // vaut le total.
      coutApiRedaction: 2,
    });

    const rendu = rendreScorecardConsole(avecNavigation, dico, config.langueConsole);
    expect(rendu).toContain(
      traduire(dico, 'scorecard.syntheseProfils', {
        profilsCorrects: 1,
        profilsMesures: 1,
        inertiesTenues: 0,
        inertiesMesurees: 0,
        nonMesures: 0,
        cout: '3,00',
      }),
    );
    // Et le coût des DÉCISIONS est publié, lui, avec sa vraie jumelle.
    expect(rendu).toContain(traduire(dico, 'scorecard.colonnes.coutDecisions'));
  });

  it('tait la ligne des non-mesurés quand il n’y en a aucun', () => {
    const complet = calculerScorecard([resultat({ scenarioId: 'sain--fr', langue: 'fr', profils: [profil(true)] })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    const rendu = rendreScorecardConsole(complet, dico, config.langueConsole);
    expect(rendu).toContain(traduire(dico, 'scorecard.profils'));
    expect(rendu).not.toContain(traduire(dico, 'scorecard.profilsNonMesures', { nonMesures: 0 }));
  });
});

/**
 * LES SIX COMPTEURS DE LA FAMILLE « RAPPORTS ».
 *
 * La revue a relevé qu'aucun test ne les allumait : trois jumelles posées,
 * zéro éprouvée. Un compteur que rien n'exerce est un compteur dont on ne sait
 * pas s'il compte — et c'est exactement ce que la brique 3 a appris à ses
 * dépens (APPRENTISSAGES n°3 et n°4).
 */
describe('scorecard — la famille « rapports », comptée à part de tout le reste', () => {
  function attenduRapport(eprouvee: boolean): AttenduRapport {
    return { nature: 'rapport', langue: '', eprouvee };
  }

  function resultatRapport(surcharges: Partial<ResultatRapport> & { eprouvee: boolean }): ResultatRapport {
    const { eprouvee, ...reste } = surcharges;
    return {
      attendu: attenduRapport(eprouvee),
      nonMesure: false,
      controles: { bijection: true, statuts: true, langue: true, langueProse: true, ligneMethode: true },
      satisfait: true,
      nbSections: 2,
      nbSectionsRedigees: 2,
      sansProse: false,
      ...reste,
    };
  }

  it('sépare les rapports AU REPOS des inerties SOUS CHARGE : deux exploits, deux taux', () => {
    // Les noyer dans un taux unique ferait disparaître la seule mesure de
    // désobéissance derrière une majorité d'attendus que rien n'éprouve —
    // l'erreur exacte corrigée en 4b sur les cibles.
    const scorecard = calculerScorecard(
      [
        resultat({
          scenarioId: 'a--fr',
          langue: 'fr',
          rapports: [
            resultatRapport({ eprouvee: false }),
            resultatRapport({ eprouvee: false, satisfait: false }),
            resultatRapport({ eprouvee: true }),
          ],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(scorecard.global).toMatchObject({
      nbRapportsMesures: 2,
      nbRapportsConformes: 1,
      tauxRapportsConformes: 50,
      nbInertiesRapportMesurees: 1,
      nbInertiesRapportTenues: 1,
      tauxInertiesRapportTenues: 100,
    });
  });

  it('sort les NON MESURÉS des dénominateurs : un taux sur une mesure absente serait inventé', () => {
    const scorecard = calculerScorecard(
      [
        resultat({
          scenarioId: 'a--fr',
          langue: 'fr',
          rapports: [resultatRapport({ eprouvee: false }), resultatRapport({ eprouvee: true, nonMesure: true, satisfait: false })],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(scorecard.global).toMatchObject({
      nbRapportsMesures: 1,
      nbRapportsNonMesures: 1,
      // L'épreuve non mesurée ne compte NI dans le numérateur, NI dans le
      // dénominateur : le taux d'inerties devient incalculable, pas 0 %.
      nbInertiesRapportMesurees: 0,
      tauxInertiesRapportTenues: null,
    });
  });

  it('la COUVERTURE de rédaction est la jumelle du coût, et elle voit les rapports sans prose', () => {
    // Un run entièrement structurel afficherait « 100 % de rapports
    // conformes » en toute sincérité, en ayant mesuré zéro rédaction
    // (APPRENTISSAGES n°4 : une mesure devenue aveugle doit le DIRE).
    const scorecard = calculerScorecard(
      [
        resultat({
          scenarioId: 'a--fr',
          langue: 'fr',
          coutApiParFamille: { exploration: 0, profilage: 0, confirmation: 0, redaction: 0.05 },
          rapports: [
            resultatRapport({ eprouvee: false, nbSections: 3, nbSectionsRedigees: 3 }),
            resultatRapport({ eprouvee: false, nbSections: 1, nbSectionsRedigees: 0, sansProse: true }),
          ],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(scorecard.global).toMatchObject({
      nbSectionsRapport: 4,
      nbSectionsRedigees: 3,
      tauxCouvertureRedaction: 75,
      nbRapportsSansProse: 1,
      nbRapportsSansSection: 0,
      coutApiRedaction: 0.05,
    });
  });

  it('dit l’absence de prose DEMANDÉE autrement que l’absence SUBIE', () => {
    // `--sans-ia` rend TOUS les rapports structurels : c'est le comportement
    // voulu, pas une panne. Notre premier différenciateur est le zéro faux
    // positif ; un instrument qui crie à l'échec quand tout va bien en est un.
    // Le partage est déjà fait pour les profils — il vaut ici pour la même raison.
    const scorecard = calculerScorecard(
      [
        resultat({
          scenarioId: 'a--fr',
          langue: 'fr',
          rapports: [resultatRapport({ eprouvee: false, nbSections: 2, nbSectionsRedigees: 0, sansProse: true })],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    const subie = traduire(dico, 'scorecard.rapportsSansProse', { sansProse: 1, mesures: 1 });
    const declaree = traduire(dico, 'scorecard.rapportsSansProseDeclares', { sansProse: 1, mesures: 1 });
    expect(subie).not.toBe(declaree);

    const renduSubi = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    expect(renduSubi).toContain(subie);
    expect(renduSubi).not.toContain(declaree);

    const renduDeclare = rendreScorecardConsole(scorecard, dico, config.langueConsole, { iaDeclareeAbsente: true });
    expect(renduDeclare).toContain(declaree);
    expect(renduDeclare).not.toContain(subie);
  });

  it('le périmètre « catégorie » ne reçoit AUCUN rapport : il ne partitionne pas', () => {
    // Un attendu de rapport n'a pas de catégorie d'anomalie ; l'y verser le
    // compterait dans chaque catégorie du scénario.
    const scorecard = calculerScorecard(
      [resultat({ scenarioId: 'a--fr', langue: 'fr', attendus: [attendu('F01', 'fonctionnel', 'detecte')], rapports: [resultatRapport({ eprouvee: false })] })],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(scorecard.parCategorie['fonctionnel']).toMatchObject({ nbRapportsMesures: 0, tauxRapportsConformes: null });
    expect(scorecard.global.nbRapportsMesures).toBe(1);
  });
});

describe('scorecard — une cause, un constat : la ligne de base de C-16 (clôture de P2-1, dette n°20)', () => {
  const causeUnique = (doublons: number): ResultatAttendu => {
    const base = attendu('D02', 'fonctionnel', 'detecte', doublons);
    return { ...base, attendu: { ...base.attendu, causeUnique: true } };
  };

  it('compte les constats publiés au-delà du premier, sur les seuls attendus DÉCLARÉS de cause unique', () => {
    // Le contrôle qui peut échouer : un attendu ordinaire à deux constats
    // (desktop et mobile d'un même bug, par exemple) n'est PAS compté — deux
    // constats y peuvent être deux défauts, le banc n'en sait rien.
    const scorecard = calculerScorecard(
      [resultat({ scenarioId: 'a--fr', langue: 'fr', attendus: [causeUnique(3), attendu('V01', 'visuel', 'detecte', 2)] })],
      config,
      HORODATAGE,
      POLITIQUE_DETERMINISTE,
    );
    expect(scorecard.global).toMatchObject({ nbAttendusCauseUnique: 1, nbConstatsEnDouble: 2 });
  });

  it('la ligne se dit quand une cause unique est déclarée, et se tait sinon', () => {
    const avec = calculerScorecard([resultat({ scenarioId: 'a--fr', langue: 'fr', attendus: [causeUnique(3)] })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(rendreScorecardConsole(avec, dico, config.langueConsole)).toContain(traduire(dico, 'scorecard.syntheseCauseUnique', { doubles: 2, causes: 1 }));
    const sans = calculerScorecard([resultat({ scenarioId: 'a--fr', langue: 'fr', attendus: [attendu('V01', 'visuel', 'detecte', 3)] })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(rendreScorecardConsole(sans, dico, config.langueConsole)).not.toContain('Une cause, un constat');
  });
});

describe('scorecard — la famille « rejouabilité », comptée à part de tout le reste (cahier P2-1, contrat 5)', () => {
  const rejoue = (candidates: number, candidatesRejouees: number, groupes: number, groupesRejoues: number): ResultatScenario['rejouabilite'] => ({
    candidates,
    candidatesRejouees,
    groupes,
    groupesRejoues,
  });

  it('somme les deux comptes et publie les deux taux — celui par groupes est celui qui dit vrai', () => {
    // demoqa en miniature : 20 candidates rejouées sur 62, mais 1 groupe sur 22.
    const resultats = [
      resultat({ scenarioId: 'a--fr', langue: 'fr', rejouabilite: rejoue(62, 20, 22, 1) }),
      resultat({ scenarioId: 'b--fr', langue: 'fr', rejouabilite: rejoue(8, 0, 5, 0) }),
      resultat({ scenarioId: 'c--en', langue: 'en', rejouabilite: rejoue(24, 24, 5, 5) }),
    ];
    const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(scorecard.global).toMatchObject({
      nbCandidatesRejouables: 94,
      nbCandidatesRejouees: 44,
      nbGroupesRejouables: 32,
      nbGroupesRejoues: 6,
      tauxRejouabiliteCandidates: 46.8,
      tauxRejouabiliteGroupes: 18.8,
    });
    expect(scorecard.parLangue['en']).toMatchObject({ tauxRejouabiliteGroupes: 100 });
    expect(scorecard.parLangue['fr']).toMatchObject({ nbGroupesRejouables: 27, nbGroupesRejoues: 1 });
  });

  it('sans candidate, le taux est null — jamais 0 : un site sain n’a rien à rejouer', () => {
    const scorecard = calculerScorecard([resultat({ scenarioId: 'sain--fr', langue: 'fr', rejouabilite: rejoue(0, 0, 0, 0) })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(scorecard.global.tauxRejouabiliteGroupes).toBeNull();
    expect(scorecard.global.tauxRejouabiliteCandidates).toBeNull();
  });

  it('un scénario sans rejouabilité (sujet sans protocole, erreur) vaut zéro partout, jamais undefined', () => {
    const scorecard = calculerScorecard([resultat({ scenarioId: 'x--fr', langue: 'fr' })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(scorecard.global.nbGroupesRejouables).toBe(0);
    expect(scorecard.global.tauxRejouabiliteGroupes).toBeNull();
  });

  it('par gabarit : les gabarits partitionnent le global, et c’est là que se voit le gabarit qui cesse de rejouer', () => {
    // Le contrôle qui peut échouer : un global dilué (9/14 groupes) cache un
    // gabarit à 0 % ; la ligne du gabarit le désigne (C-09 sur
    // « formulaire-puis-navigation » avant le contrat 1).
    const resultats = [
      resultat({ scenarioId: 'a--fr', langue: 'fr', gabarit: 'formulaire-contact', rejouabilite: rejoue(10, 10, 4, 4) }),
      resultat({ scenarioId: 'b--en', langue: 'en', gabarit: 'formulaire-contact', rejouabilite: rejoue(8, 8, 5, 5) }),
      resultat({ scenarioId: 'c--fr', langue: 'fr', gabarit: 'formulaire-puis-navigation', rejouabilite: rejoue(6, 0, 5, 0) }),
    ];
    const scorecard = calculerScorecard(resultats, config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(Object.keys(scorecard.parGabarit)).toEqual(['formulaire-contact', 'formulaire-puis-navigation']);
    expect(scorecard.parGabarit['formulaire-puis-navigation']).toMatchObject({ nbGroupesRejouables: 5, nbGroupesRejoues: 0, tauxRejouabiliteGroupes: 0 });
    expect(scorecard.parGabarit['formulaire-contact']).toMatchObject({ tauxRejouabiliteGroupes: 100 });
    const somme = Object.values(scorecard.parGabarit).reduce((total, agregat) => total + agregat.nbGroupesRejouables, 0);
    expect(somme).toBe(scorecard.global.nbGroupesRejouables);
    const rendu = rendreScorecardConsole(scorecard, dico, config.langueConsole);
    const lignes = rendu.split('\n');
    const titre = lignes.indexOf(traduire(dico, 'scorecard.rejouabiliteParGabarit'));
    expect(titre).toBeGreaterThan(-1);
    const ligneGabarit = lignes.slice(titre).find((ligne) => ligne.startsWith('formulaire-puis-navigation'));
    expect(ligneGabarit).toMatch(/0,0\s%$/);
  });

  it('le rendu console porte le tableau, la synthèse, et une ALARME sous le seuil — muette au-dessus, muette sans dénominateur', () => {
    const sousSeuil = calculerScorecard([resultat({ scenarioId: 'a--fr', langue: 'fr', rejouabilite: rejoue(8, 0, 5, 0) })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    const rendu = rendreScorecardConsole(sousSeuil, dico, config.langueConsole, { rejouabiliteMinPourcent: 100 });
    expect(rendu).toContain(traduire(dico, 'scorecard.colonnes.tauxRejouabiliteGroupes'));
    expect(rendu).toContain('ALARME REJOUABILITÉ');
    // Le contrôle qui peut échouer : le même run au-dessus du seuil ne crie pas…
    const auDessus = calculerScorecard([resultat({ scenarioId: 'a--fr', langue: 'fr', rejouabilite: rejoue(8, 8, 5, 5) })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(rendreScorecardConsole(auDessus, dico, config.langueConsole, { rejouabiliteMinPourcent: 100 })).not.toContain('ALARME REJOUABILITÉ');
    // …ni un run sans candidate, ni un rendu sans seuil fourni.
    const vide = calculerScorecard([resultat({ scenarioId: 'a--fr', langue: 'fr', rejouabilite: rejoue(0, 0, 0, 0) })], config, HORODATAGE, POLITIQUE_DETERMINISTE);
    expect(rendreScorecardConsole(vide, dico, config.langueConsole, { rejouabiliteMinPourcent: 100 })).not.toContain('ALARME REJOUABILITÉ');
    expect(rendreScorecardConsole(sousSeuil, dico, config.langueConsole)).not.toContain('ALARME REJOUABILITÉ');
  });
});
