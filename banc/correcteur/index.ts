/**
 * Correcteur (cahier des charges §6) : pour chaque scénario, déploie le
 * mini-site, lance le sujet à noter (`scanner`, contrat de core/), compare
 * son rapport au manifeste de vérité terrain, puis produit la scorecard.
 *
 * Mode CLI : `pnpm banc [--sujet reel|factice] --scenario <id> | --tous`.
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
import { attendusBug, type ConfigBanc, type Gabarit, type ResultatAttendu, type ResultatScenario, type Scenario, type Scorecard } from '../types.js';
import {
  RAISON_PERTES_PROTOCOLE,
  RAISON_PROFILS_NON_MESURES,
  profilsNonMesuresSubis,
  apparier,
  calculerComptesProtocole,
  comptesProtocoleZero,
  noterProfils,
  profilsNonMesures,
  statutSelonPertes,
} from './appariement.js';
import { calculerScorecard, ecrireScorecard, purgerResultats, rendreScorecardConsole } from './scorecard.js';

export interface ParametresNotation {
  scanner: Scanner;
  config: ConfigBanc;
  dico: Dictionnaire;
  obtenirGabarit: (nom: string) => Gabarit;
  /**
   * `true` quand le banc a été lancé avec `--sans-ia` : l'absence de profil
   * est alors DÉCLARÉE, donc attendue. Sans ce drapeau, le banc ne pourrait
   * pas distinguer une absence demandée d'une absence subie.
   */
  iaDeclareeAbsente?: boolean;
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

  // Rien n'est détecté, donc aucun verdict de confirmation n'a été rendu :
  // l'attendu est raté ET mal jugé. Seuls les attendus de nature `bug` sont
  // concernés — un attendu de profil ne se « rate » pas, il se mesure ou non.
  const toutRate = (): ResultatAttendu[] =>
    attendusBug(manifeste).map((attendu): ResultatAttendu => ({ attendu, verdict: 'rate', anomaliesAppariees: [], verdictRendu: null, bienJuge: false }));

  // Un scénario en ERREUR rend des comptes de protocole à zéro : rien n'a pu
  // être apparié au manifeste, et un compteur non apparié ferait mentir la
  // mesure des fausses alertes évitées dans un sens ou dans l'autre.
  if (rapport === undefined) {
    // Scanner en échec : rien n'est détecté, rien n'est signalé.
    return { ...base, protocole: comptesProtocoleZero(), statut: 'erreur', erreur, attendus: toutRate(), profils: profilsNonMesures(manifeste), fauxPositifs: [], coutApi: 0 };
  }
  try {
    // Les deux mesures se calculent ENSEMBLE : les comptes du protocole lisent
    // l'appariement (un attendu déjà couvert par une anomalie retenue n'est pas
    // une anomalie perdue), et l'invariant de `calculerComptesProtocole` protège
    // l'appariement d'un rapport qui se lirait « 100 % de détection » alors que
    // le protocole est tombé.
    const { attendus, fauxPositifs } = apparier(rapport, manifeste);
    const protocole = calculerComptesProtocole(rapport, manifeste, attendus);
    const profils = noterProfils(rapport, manifeste);
    // INVARIANT (brique 3, clôture) : une anomalie réelle détruite par le
    // protocole interdit le statut `ok`. Appliqué ICI, au moment où le statut
    // est décidé, et non déduit ailleurs d'une colonne.
    let statut = statutSelonPertes(protocole);
    let raison = statut === 'ok' ? undefined : RAISON_PERTES_PROTOCOLE;
    // INVARIANT JUMEAU (brique 4a) : en régime IA actif, un attendu de profil
    // non mesuré est une absence SUBIE, et elle interdit `ok`. En `--sans-ia`,
    // l'absence est déclarée et n'entache rien.
    if (statut === 'ok' && profilsNonMesuresSubis(profils, params.iaDeclareeAbsente === true) > 0) {
      statut = 'erreur';
      raison = RAISON_PROFILS_NON_MESURES;
    }
    return {
      ...base,
      protocole,
      statut,
      ...(raison === undefined ? {} : { erreur: raison }),
      attendus,
      profils,
      fauxPositifs,
      coutApi: rapport.coutApi,
      rapport,
    };
  } catch (cause: unknown) {
    // Rapport inexploitable (structure inattendue, ou candidates écartées sans
    // groupes) : faute du sujet noté, pas du banc — le scénario est en erreur,
    // l'exécution continue. Le rapport est conservé comme pièce à conviction.
    // Le coût, lui, a bien été dépensé : le rapport le transporte, et un coût
    // dépensé qui ne se voit pas est un coût qui ment (APPRENTISSAGES n°3).
    // Le garde-fou n'est pas décoratif — l'hypothèse de cette branche est
    // justement un rapport structurellement suspect, et un `NaN` propagé dans
    // tous les agrégats serait pire que le zéro d'avant.
    const coutApi = Number.isFinite(rapport.coutApi) ? rapport.coutApi : 0;
    return { ...base, protocole: comptesProtocoleZero(), statut: 'erreur', erreur: messageErreur(cause), attendus: toutRate(), profils: profilsNonMesures(manifeste), fauxPositifs: [], coutApi, rapport };
  }
}

export async function executerBanc(params: ParametresBanc): Promise<Scorecard> {
  const { scenarios, scanner, config, dico, obtenirGabarit, iaDeclareeAbsente } = params;
  const journal = params.journal ?? ((): void => undefined);
  const horodatage = new Date().toISOString();

  journal(traduire(dico, 'banc.demarrage', { nombre: scenarios.length, scanner: scanner.name }));
  const resultats: ResultatScenario[] = [];
  for (const scenario of scenarios) {
    journal(traduire(dico, 'banc.scenarioEnCours', { id: scenario.id }));
    const resultat = await noterScenario(scenario, { scanner, config, dico, obtenirGabarit, iaDeclareeAbsente });
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
// Mode CLI : pnpm banc [--sujet reel|factice] --scenario <id> | --tous
// ---------------------------------------------------------------------------

export interface OptionsCli {
  scenario?: string;
  tous: boolean;
  /** Nom du sujet demandé ; absent = sujet par défaut de la config. */
  sujet?: string;
  /**
   * `--sans-ia` : le moteur reçoit un client SANS CAPACITÉ. Le scan tourne
   * sur ses seuls détecteurs techniques, les attendus de profil restent NON
   * MESURÉS, et la détection comme les verdicts doivent rester identiques —
   * c'est l'épreuve du mode dégradé permanent (constitution §4).
   */
  sansIa: boolean;
}

/** Analyse les arguments (ceux du processus par défaut) ; null si la ligne de commande est mal formée. */
export function lireOptions(args?: string[]): OptionsCli | null {
  try {
    const { values } = parseArgs({
      args,
      options: {
        scenario: { type: 'string' },
        tous: { type: 'boolean' },
        sujet: { type: 'string' },
        'sans-ia': { type: 'boolean' },
      },
      strict: true,
    });
    return { scenario: values.scenario, tous: values.tous === true, sujet: values.sujet, sansIa: values['sans-ia'] === true };
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

  // Imports différés : les sujets, le registre des gabarits et le chargement des
  // scénarios ne sont nécessaires qu'en mode CLI (les tests injectent les leurs).
  const [{ NOMS_SUJETS, creerSujet, estNomSujet }, { obtenirGabarit }, { chargerScenario, chargerScenarios, ErreurScenarioIntrouvable }] =
    await Promise.all([import('./sujets.js'), import('../gabarits/index.js'), import('../scenarios/charger.js')]);

  const nomSujet = options.sujet ?? config.scan.sujetParDefaut;
  if (!estNomSujet(nomSujet)) {
    console.error(traduire(dico, 'banc.sujetInconnu', { sujet: nomSujet, sujets: NOMS_SUJETS.join(', ') }));
    console.error(traduire(dico, 'banc.usage'));
    process.exitCode = 2;
    return;
  }

  // Le banc IMPOSE son client IA au moteur : rejeu sur cassettes par défaut,
  // aucune capacité avec `--sans-ia`. Dans les deux cas, aucun appel réseau —
  // un poste qui porte une clé d'API ne doit pas noter autre chose qu'un poste
  // qui n'en a pas.
  const { creerClientIaBanc, DOSSIER_CASSETTES } = await import('../ia.js');
  const { COMMANDE_ENREGISTREMENT_IA } = await import('../../core/ia/index.js');
  const { client } = await creerClientIaBanc({
    regime: options.sansIa ? 'sans-ia' : 'rejeu',
    journaliser: (type, details) => {
      console.log(`  ${type} ${JSON.stringify(details ?? {})}`);
    },
  });
  console.log(
    options.sansIa
      ? traduire(dico, 'banc.sansIa')
      : traduire(dico, 'banc.iaRejeu', { dossier: DOSSIER_CASSETTES, commande: COMMANDE_ENREGISTREMENT_IA }),
  );
  const scanner = await creerSujet(nomSujet, client);

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

  // L'absence de profil est DÉCLARÉE de deux façons : `--sans-ia` (on a dit au
  // banc de ne pas appeler l'IA) et un sujet qui, par construction, n'en
  // produit aucun (le scanner factice, témoin négatif du banc). Toute autre
  // absence est SUBIE et interdit `ok`.
  const iaDeclareeAbsente = options.sansIa || nomSujet !== 'reel';
  const scorecard = await executerBanc({
    scenarios,
    scanner,
    config,
    dico,
    obtenirGabarit,
    journal: console.log,
    iaDeclareeAbsente,
  });
  console.log(rendreScorecardConsole(scorecard, dico, config.langueConsole, { iaDeclareeAbsente }));
  const dossierResultats = depuisRacine(config.scorecard.dossierResultats);
  const fichier = await ecrireScorecard(scorecard, dossierResultats);
  console.log(traduire(dico, 'banc.resultatsEcrits', { fichier }));
  const purges = await purgerResultats(dossierResultats, config.scorecard.retentionRuns);
  if (purges.length > 0) {
    console.log(traduire(dico, 'banc.resultatsPurges', { nombre: purges.length, retention: config.scorecard.retentionRuns }));
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  principal().catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  });
}
