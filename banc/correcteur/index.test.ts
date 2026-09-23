import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie, AnomalieCandidate, Rapport, ResultatGroupe, Scanner, VerdictConfirmation } from '../../core/types.js';
import { chargerConfig } from '../config.js';
import { obtenirGabarit } from '../gabarits/index.js';
import { formulaireContact } from '../gabarits/formulaire-contact/index.js';
import { PAGE_ACCUEIL, PAGE_CONTACT } from '../gabarits/formulaire-contact/structure.js';
import { depuisRacine } from '../outils/racine.js';
import { compterBalises } from '../outils/transformations.js';
import type { ConfigBanc, Scenario } from '../types.js';
import { RAISON_ECARTEES_SANS_GROUPES, RAISON_PERTES_PROTOCOLE, comptesProtocoleZero } from './appariement.js';
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

const VIEWPORT = { nom: 'bureau', largeur: 1280, hauteur: 800, mobile: false };

function candidate(categorie: Anomalie['categorie'], urlOuEtape: string): AnomalieCandidate {
  return {
    ...anomalie(categorie, urlOuEtape),
    detecteur: 'd-test',
    reproduction: { url: urlOuEtape, viewport: VIEWPORT, actionsPrealables: [], action: null },
    preuves: [],
  };
}

/** Résultat de groupe minimal : le banc n'en lit que le verdict et les membres. */
function resultatGroupe(verdict: VerdictConfirmation, membre: AnomalieCandidate): ResultatGroupe {
  return {
    groupe: {
      cle: `${membre.detecteur}|${membre.urlOuEtape}`,
      representant: membre,
      membres: [membre],
      localisations: [{ urlOuEtape: membre.urlOuEtape }],
      observations: [{ viewport: VIEWPORT.nom }],
      confiance: membre.confiance,
      descriptions: [membre.description],
    },
    verdict,
    motif: 'motif-de-test',
    tentatives: [],
    tauxReproduction: null,
    confianceInitiale: membre.confiance,
    confianceFinale: membre.confiance,
    coutApi: 0,
  };
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
  // Plage de ports RÉSERVÉE à ce fichier. Il affirme qu'un port redevient
  // libre après l'arrêt d'un serveur de scénario ; dans la plage commune, le
  // serveur d'un autre fichier de test (exécutés en parallèle) peut le
  // reprendre entre l'arrêt et la vérification et faire mentir l'assertion.
  const chargee = await chargerConfig();
  config = { ...chargee, serveur: { portDeBase: 4880, nombrePortsEssayes: 10 } };
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

    const resultat = await noterScenario(F01_M01_FR, { scanner, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

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
    const resultat = await noterScenario(SAIN_EN, { scanner, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(resultat).toMatchObject({ statut: 'ok', attendus: [], fauxPositifs: [], coutApi: 0 });
  });

  it('marque en erreur un scanner qui lève, avec tous les attendus ratés, et arrête quand même le serveur', async () => {
    let urlServie = '';
    const scanner: Scanner = async function scannerEspionEnPanne(url, options) {
      urlServie = url;
      return scannerEnPanne(url, options);
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(resultat).toMatchObject({ statut: 'erreur', erreur: 'panne simulée', coutApi: 0, fauxPositifs: [] });
    expect(resultat.rapport).toBeUndefined();
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(await serveurFerme(urlServie)).toBe(true);
  });

  it('marque en erreur un scanner qui dépasse le timeout de la config, avec le message des locales', async () => {
    const timeoutMs = 100;
    const configCourte: ConfigBanc = { ...config, scan: { ...config.scan, timeoutMs } };
    const debut = Date.now();

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerLent(timeoutMs * 50), config: configCourte, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(Date.now() - debut).toBeLessThan(timeoutMs * 20);
    expect(resultat.statut).toBe('erreur');
    expect(resultat.erreur).toBe(traduire(dico, 'banc.timeoutScan', { timeoutMs }));
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(resultat.dureeMs).toBeGreaterThanOrEqual(timeoutMs);
  });

  it('laisse remonter une erreur du banc lui-même (scénario incohérent avec le gabarit)', async () => {
    const inconnu = scenario('test--zz9--fr', 'fr', ['ZZ9']);
    await expect(noterScenario(inconnu, { scanner: scannerControle, config, dico, obtenirGabarit, iaDeclareeAbsente: true })).rejects.toThrow('ZZ9');
  });

  it('laisse remonter une erreur du banc lui-même (paramètre de bug invalide) au lieu de noter un site mal servi', async () => {
    const invalide: Scenario = { ...F01_M01_FR, parametres: { M01: { largeurMaxMobilePx: 'grand' } } };
    await expect(noterScenario(invalide, { scanner: scannerControle, config, dico, obtenirGabarit, iaDeclareeAbsente: true })).rejects.toThrow('M01');
  });

  it('marque en erreur (sans lever) un rapport inexploitable par l’appariement, et garde le rapport', async () => {
    const scannerInexploitable: Scanner = async function scannerInexploitable(url) {
      // Rapport structurellement faux (anomalies absentes) : le contrat est violé par le sujet, pas par le banc.
      return { ...rapport(url, []), anomalies: undefined as unknown as Anomalie[] };
    };
    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerInexploitable, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(resultat.statut).toBe('erreur');
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(resultat).toMatchObject({ fauxPositifs: [], coutApi: 0 });
    expect(resultat.rapport).toBeDefined();
  });

  /**
   * Un rapport jugé inexploitable transporte tout de même le coût RÉELLEMENT
   * dépensé — le profilage a lieu avant la confirmation, et c'est justement le
   * chemin « le protocole tombe » (APPRENTISSAGES n°4) qui produit ce cas. Les
   * comptes du protocole sont remis à zéro parce que rien n'a pu être apparié ;
   * le coût, lui, n'est pas un compte d'appariement, et un coût dépensé qui ne
   * se voit pas est un coût qui ment (APPRENTISSAGES n°3).
   */
  it('conserve le coût dépensé d’un rapport inexploitable, et neutralise un coût non numérique', async () => {
    const inexploitableAvecCout = (coutApi: number): Scanner =>
      async function scannerInexploitablePayant(url) {
        return { ...rapport(url, [], coutApi), anomalies: undefined as unknown as Anomalie[] };
      };

    const paye = await noterScenario(F01_M01_FR, { scanner: inexploitableAvecCout(0.0042), config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(paye.statut).toBe('erreur');
    expect(paye.coutApi).toBe(0.0042);

    // Le garde-fou : l'hypothèse de cette branche est un rapport structurellement
    // suspect, et un NaN propagé dans tous les agrégats serait pire que zéro.
    const absurde = await noterScenario(F01_M01_FR, { scanner: inexploitableAvecCout(Number.NaN), config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(absurde.coutApi).toBe(0);
  });

  it('calcule les comptes du protocole du rapport, en distinguant évitée, perdue et non appariée', async () => {
    // Trois groupes : l'un n'apparie aucun attendu (le banc ne tranche pas),
    // l'autre apparie F01 qui devait être RETENU (perte), le dernier est retenu.
    const scannerProtocole: Scanner = async function scannerProtocole(url) {
      return {
        ...rapport(url, []),
        candidates: [candidate('seo', PAGE_ACCUEIL), candidate('fonctionnel', `${url}${PAGE_CONTACT}`), candidate('mobile', `${url}${PAGE_CONTACT}`)],
        groupes: [
          resultatGroupe('non-reproduite', candidate('seo', PAGE_ACCUEIL)),
          resultatGroupe('non-reproduite', candidate('fonctionnel', `${url}${PAGE_CONTACT}`)),
          resultatGroupe('confirmee', candidate('mobile', `${url}${PAGE_CONTACT}`)),
        ],
      };
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerProtocole, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(resultat.protocole).toEqual({
      nbCandidates: 3,
      nbGroupes: 3,
      nbGroupesRetenus: 1,
      nbGroupesEcartes: 2,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 1,
    });
  });

  it('INVARIANT — un scénario où le protocole a perdu une anomalie réelle ne peut PAS être ok', async () => {
    // Même rapport que ci-dessus : F01 devait être RETENU, son groupe est
    // écarté, aucune anomalie retenue ne le couvre — une anomalie réelle
    // détruite. Le statut est la lecture de PREMIER niveau du banc : c'est
    // lui qui doit refuser de dire « tout va bien », pas une colonne que
    // personne n'est obligé de lire (arbitrage de clôture de la brique 3).
    const scannerPerte: Scanner = async function scannerPerte(url) {
      return {
        ...rapport(url, []),
        candidates: [candidate('fonctionnel', `${url}${PAGE_CONTACT}`)],
        groupes: [resultatGroupe('non-reproduite', candidate('fonctionnel', `${url}${PAGE_CONTACT}`))],
      };
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerPerte, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(resultat.protocole?.nbPertesProtocole).toBe(1);
    expect(resultat.statut).not.toBe('ok');
    expect(resultat.erreur).toBe(RAISON_PERTES_PROTOCOLE);
    // Le rapport et l'appariement restent DISPONIBLES : le scénario est
    // disqualifié, pas effacé — on doit pouvoir instruire ce qui s'est passé.
    expect(resultat.rapport).toBeDefined();
    expect(resultat.attendus.map((attendu) => attendu.attendu.bugId)).toEqual(['F01', 'M01']);
  });

  it('INVARIANT — le même rapport SANS perte reste ok : la garde ne disqualifie pas tout', async () => {
    // Le groupe est retenu au lieu d'être écarté : rien n'est détruit. Sans
    // ce second cas, la garde pourrait mettre tous les scénarios en erreur et
    // le test précédent serait encore vert.
    const scannerSansPerte: Scanner = async function scannerSansPerte(url) {
      return {
        ...rapport(url, [anomalie('fonctionnel', `${url}${PAGE_CONTACT}`)]),
        candidates: [candidate('fonctionnel', `${url}${PAGE_CONTACT}`)],
        groupes: [resultatGroupe('confirmee', candidate('fonctionnel', `${url}${PAGE_CONTACT}`))],
      };
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerSansPerte, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(resultat.protocole?.nbPertesProtocole).toBe(0);
    expect(resultat.statut).toBe('ok');
    expect(resultat.erreur).toBeUndefined();
  });

  it('D1 — met en ERREUR un rapport qui porte des écartées sans groupes : jamais 100 % de détection quand le protocole est tombé', async () => {
    // Exactement ce que produit le pipeline quand la confirmation lève : toutes
    // les candidates écartées avec leur raison, et AUCUN groupe.
    const scannerProtocoleTombe: Scanner = async function scannerProtocoleTombe(url) {
      const candidates = [candidate('fonctionnel', `${url}${PAGE_CONTACT}`), candidate('mobile', `${url}${PAGE_CONTACT}`)];
      return {
        ...rapport(url, []),
        candidates,
        ecartees: candidates.map((candidate) => ({ candidate, raison: 'confirmation-en-erreur' })),
      };
    };

    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerProtocoleTombe, config, dico, obtenirGabarit, iaDeclareeAbsente: true });

    expect(resultat.statut).toBe('erreur');
    expect(resultat.erreur).toBe(RAISON_ECARTEES_SANS_GROUPES);
    // Sans l'invariant, les deux attendus étaient « détectés » (appariés parmi
    // les écartées) : 100 % de détection sur un scan qui n'a rien retenu.
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['rate', 'rate']);
    expect(resultat.protocole).toEqual(comptesProtocoleZero());
    expect(resultat.fauxPositifs).toEqual([]);
    // Le rapport est conservé comme pièce à conviction.
    expect(resultat.rapport?.ecartees).toHaveLength(2);
  });

  it('D1 — n’alarme pas un protocole qui écarte zéro candidate (passe-plat) ni un scanner sans protocole', async () => {
    const scannerPassePlat: Scanner = async function scannerPassePlat(url) {
      return { ...rapport(url, [anomalie('fonctionnel', `${url}${PAGE_CONTACT}`)]), candidates: [candidate('fonctionnel', `${url}${PAGE_CONTACT}`)], ecartees: [] };
    };
    const resultat = await noterScenario(F01_M01_FR, { scanner: scannerPassePlat, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(resultat.statut).toBe('ok');
    expect(resultat.protocole).toMatchObject({ nbCandidates: 1, nbGroupes: 0, nbGroupesEcartes: 0 });
    expect(resultat.attendus.map((attendu) => attendu.verdict)).toEqual(['detecte', 'rate']);
  });

  it('rend des comptes de protocole à zéro pour un sujet qui n’en a pas, et pour un scénario en erreur', async () => {
    const zero = comptesProtocoleZero();
    const sansProtocole = await noterScenario(F01_M01_FR, { scanner: scannerControle, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(sansProtocole.protocole).toEqual(zero);
    const enErreur = await noterScenario(F01_M01_FR, { scanner: scannerEnPanne, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(enErreur.protocole).toEqual(zero);
  });

  it('compte en faux positif une anomalie à la localisation mal formée sans interrompre l’exécution', async () => {
    const scannerMalForme: Scanner = async function scannerMalForme(url) {
      return rapport(url, [anomalie('fonctionnel', 'http://')]);
    };
    const scorecard = await executerBanc({ scenarios: [F01_M01_FR, SAIN_EN], scanner: scannerMalForme, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(scorecard.scenarios).toHaveLength(2);
    expect(scorecard.global).toMatchObject({ nbErreurs: 0, nbFauxPositifs: 2, nbDetectes: 0 });
  });
});

describe('executerBanc', () => {
  it('note chaque scénario dans l’ordre, journalise la progression et produit la scorecard agrégée', async () => {
    const lignes: string[] = [];
    const scenarios = [F01_M01_FR, SAIN_EN];

    const scorecard = await executerBanc({ scenarios, scanner: scannerControle, config, dico, obtenirGabarit, iaDeclareeAbsente: true, journal: (ligne) => lignes.push(ligne) });

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
    const scorecard = await executerBanc({ scenarios: [F01_M01_FR], scanner: scannerEnPanne, config, dico, obtenirGabarit, iaDeclareeAbsente: true, journal: (ligne) => lignes.push(ligne) });
    expect(scorecard.global).toMatchObject({ nbScenarios: 1, nbErreurs: 1, nbAttendus: 2, nbDetectes: 0, nbSignalements: 0, tauxDetection: 0, tauxFauxPositifs: null });
    expect(lignes[2]).toBe(traduire(dico, 'banc.scenarioErreur', { id: F01_M01_FR.id, erreur: 'panne simulée' }));
  });

  it('reste silencieux sans journal et accepte une liste vide', async () => {
    const scorecard = await executerBanc({ scenarios: [], scanner: scannerControle, config, dico, obtenirGabarit, iaDeclareeAbsente: true });
    expect(scorecard.global.nbScenarios).toBe(0);
    expect(scorecard.scenarios).toEqual([]);
  });
});
