/**
 * Correcteur (cahier des charges §6) : pour chaque scénario, déploie le
 * mini-site, lance le sujet à noter (`scanner`, contrat de core/), compare
 * son rapport au manifeste de vérité terrain, puis produit la scorecard.
 *
 * Mode CLI : `pnpm banc --scenario <id> | --tous`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Rapport, Scanner } from '../../core/types.js';
import { chargerConfig } from '../config.js';
import { depuisRacine } from '../outils/racine.js';
import { deriverManifeste } from '../scenarios/manifeste.js';
import { demarrerServeur } from '../serveur.js';
import type { ConfigBanc, Gabarit, ResultatAttendu, ResultatScenario, Scenario, Scorecard } from '../types.js';
import { apparier } from './appariement.js';
import { calculerScorecard, ecrireScorecard, rendreScorecardConsole } from './scorecard.js';

export interface ParametresNotation {
  scanner: Scanner;
  config: ConfigBanc;
  dico: Dictionnaire;
  obtenirGabarit: (nom: string) => Gabarit;
}

export interface ParametresBanc extends ParametresNotation {
  scenarios: Scenario[];
  /** Sortie de progression (une ligne par appel) ; silencieux si absent. */
  journal?: (ligne: string) => void;
}

/**
 * Course entre le scanner et un timer. Le timer est toujours nettoyé et ne
 * retient jamais le processus ; un rejet tardif du scanner (après le
 * timeout) est absorbé pour ne pas devenir un rejet non géré.
 */
function scannerSousTimeout(scanner: Scanner, url: string, timeoutMs: number, messageTimeout: string): Promise<Rapport> {
  let timer: NodeJS.Timeout | undefined;
  const echeance = new Promise<never>((_resoudre, rejeter) => {
    timer = setTimeout(() => rejeter(new Error(messageTimeout)), timeoutMs);
    timer.unref();
  });
  const scan = (async () => scanner(url, { timeoutMs }))();
  scan.catch(() => undefined);
  return Promise.race([scan, echeance]).finally(() => clearTimeout(timer));
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Séquence complète d'un scénario : déploie → scanne (sous timeout) → arrête
 * le serveur → dérive le manifeste → apparie.
 *
 * Une faute du BANC (scénario incohérent, site mal servi) lève et interrompt
 * l'exécution ; une faute du SUJET (scanner qui lève, dépasse le timeout ou
 * rend un rapport inexploitable) donne un résultat en statut 'erreur'.
 */
export async function noterScenario(scenario: Scenario, params: ParametresNotation): Promise<ResultatScenario> {
  const { scanner, config, dico, obtenirGabarit } = params;
  const gabarit = obtenirGabarit(scenario.gabarit);
  const timeoutMs = config.scan.timeoutMs;

  const serveur = await demarrerServeur(scenario, gabarit, config);
  let rapport: Rapport | undefined;
  let erreur: string | undefined;
  // Durée mesurée par le banc (pas auto-déclarée par le scanner) : disponible même en cas d'erreur ou de timeout.
  const debut = Date.now();
  try {
    rapport = await scannerSousTimeout(scanner, serveur.url, timeoutMs, traduire(dico, 'banc.timeoutScan', { timeoutMs }));
  } catch (cause: unknown) {
    erreur = messageErreur(cause);
  } finally {
    await serveur.arreter();
  }
  const dureeMs = Date.now() - debut;

  const manifeste = deriverManifeste(scenario, gabarit);
  const base = { scenarioId: scenario.id, gabarit: gabarit.nom, langue: scenario.langue, dureeMs };

  const toutRate = (): ResultatAttendu[] =>
    manifeste.attendus.map((attendu): ResultatAttendu => ({ attendu, verdict: 'rate', anomaliesAppariees: [] }));

  if (rapport === undefined) {
    // Scanner en échec : rien n'est détecté, rien n'est signalé.
    return { ...base, statut: 'erreur', erreur, attendus: toutRate(), fauxPositifs: [], coutApi: 0 };
  }
  try {
    const { attendus, fauxPositifs } = apparier(rapport, manifeste);
    return { ...base, statut: 'ok', attendus, fauxPositifs, coutApi: rapport.coutApi, rapport };
  } catch (cause: unknown) {
    // Rapport inexploitable (structure inattendue) : faute du sujet noté, pas du
    // banc — le scénario est en erreur, l'exécution continue. Le rapport est
    // conservé comme pièce à conviction.
    return { ...base, statut: 'erreur', erreur: messageErreur(cause), attendus: toutRate(), fauxPositifs: [], coutApi: 0, rapport };
  }
}

export async function executerBanc(params: ParametresBanc): Promise<Scorecard> {
  const { scenarios, scanner, config, dico, obtenirGabarit } = params;
  const journal = params.journal ?? ((): void => undefined);
  const horodatage = new Date().toISOString();

  journal(traduire(dico, 'banc.demarrage', { nombre: scenarios.length, scanner: scanner.name }));
  const resultats: ResultatScenario[] = [];
  for (const scenario of scenarios) {
    journal(traduire(dico, 'banc.scenarioEnCours', { id: scenario.id }));
    const resultat = await noterScenario(scenario, { scanner, config, dico, obtenirGabarit });
    resultats.push(resultat);
    if (resultat.statut === 'erreur') {
      journal(traduire(dico, 'banc.scenarioErreur', { id: resultat.scenarioId, erreur: resultat.erreur ?? '' }));
    } else {
      journal(
        traduire(dico, 'banc.scenarioTermine', {
          id: resultat.scenarioId,
          detectes: resultat.attendus.filter((attendu) => attendu.verdict === 'detecte').length,
          attendus: resultat.attendus.length,
          fauxPositifs: resultat.fauxPositifs.length,
          dureeMs: resultat.dureeMs,
        }),
      );
    }
  }
  return calculerScorecard(resultats, config, horodatage);
}

// ---------------------------------------------------------------------------
// Mode CLI : pnpm banc --scenario <id> | --tous
// ---------------------------------------------------------------------------

function lireOptions(): { scenario?: string; tous: boolean } | null {
  try {
    const { values } = parseArgs({ options: { scenario: { type: 'string' }, tous: { type: 'boolean' } }, strict: true });
    return { scenario: values.scenario, tous: values.tous === true };
  } catch {
    return null;
  }
}

async function principal(): Promise<void> {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);

  const options = lireOptions();
  if (options === null || (!options.tous && options.scenario === undefined)) {
    console.error(traduire(dico, 'banc.usage'));
    process.exitCode = 2;
    return;
  }

  // Imports différés : le moteur, le registre des gabarits et le chargement des
  // scénarios ne sont nécessaires qu'en mode CLI (les tests injectent les leurs).
  const [{ scanner }, { obtenirGabarit }, { chargerScenario, chargerScenarios, ErreurScenarioIntrouvable }] = await Promise.all([
    import('../../core/index.js'),
    import('../gabarits/index.js'),
    import('../scenarios/charger.js'),
  ]);

  const dossierScenarios = depuisRacine(config.scenarios.dossier);
  let scenarios: Scenario[];
  try {
    scenarios = options.tous
      ? await chargerScenarios(dossierScenarios)
      : [await chargerScenario(dossierScenarios, options.scenario ?? '')];
  } catch (erreur: unknown) {
    if (erreur instanceof ErreurScenarioIntrouvable) {
      console.error(traduire(dico, 'banc.scenarioIntrouvable', { id: erreur.id }));
      process.exitCode = 1;
      return;
    }
    throw erreur;
  }
  if (scenarios.length === 0) {
    console.error(traduire(dico, 'banc.aucunScenario', { dossier: dossierScenarios }));
    process.exitCode = 1;
    return;
  }

  const scorecard = await executerBanc({ scenarios, scanner, config, dico, obtenirGabarit, journal: console.log });
  console.log(rendreScorecardConsole(scorecard, dico, config.langueConsole));
  const fichier = await ecrireScorecard(scorecard, depuisRacine(config.scorecard.dossierResultats));
  console.log(traduire(dico, 'banc.resultatsEcrits', { fichier }));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  principal().catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  });
}
