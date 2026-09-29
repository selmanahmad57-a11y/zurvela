/**
 * Correcteur (cahier des charges §6) : pour chaque scénario, déploie le
 * mini-site, lance le sujet à noter (`scanner`, contrat de core/), compare
 * son rapport au manifeste de vérité terrain, puis produit la scorecard.
 *
 * Mode CLI : `pnpm banc [--sujet reel|factice] [--sans-ia] [--politique deterministe|ia] --scenario <id> | --tous`.
 */
import { tauxRejouabilite } from '../../core/scanner/confirmation/rejouabilite.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Rapport, Scanner } from '../../core/types.js';
import { chargerConfig } from '../config.js';
import { depuisRacine } from '../outils/racine.js';
import { deriverManifeste } from '../scenarios/manifeste.js';
import { demarrerServeur } from '../serveur.js';
import {
  attendusBug,
  estNomPolitique,
  POLITIQUE_IA,
  POLITIQUES,
  type ConfigBanc,
  type Gabarit,
  type ResultatAttendu,
  type ResultatScenario,
  type Scenario,
  type Scorecard,
  type SujetNote,
} from '../types.js';
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
import {
  RAISON_REPLIS_DECISION,
  calculerCouverture,
  ciblesNonMesurees,
  compterReplisDecision,
  noterCibles,
  politiqueAppliquee,
  replisDecisionSubis,
  verifierContraintes,
} from './navigation.js';
import {
  RAISON_PROSE_NON_MESUREE,
  RAISON_RAPPORTS_NON_MESURES,
  RAISON_RAPPORT_SCENARIO_EN_ERREUR,
  noterRapports,
  prosesNonMesureesSubies,
  rapportsNonMesures,
  rapportsNonMesuresSubis,
} from './rapport.js';
import { chargerDetectionLangue, type ConfigDetectionLangue } from './langue-prose.js';
import { calculerScorecard, ecrireScorecard, purgerResultats, rendreScorecardConsole } from './scorecard.js';

export interface ParametresNotation {
  /** Le sujet noté, assemblé POUR CHAQUE scénario : le budget de pages en dépend. */
  sujet: SujetNote;
  /**
   * Politique de décision DEMANDÉE au moteur pour ce run (`--politique`,
   * défaut = `exploration.politique` de `config/scanner.json`). Le banc la
   * vérifie dans le rapport : une option muette ferait noter le comportement
   * par défaut sous l'étiquette de l'autre politique.
   */
  politique: string;
  config: ConfigBanc;
  dico: Dictionnaire;
  obtenirGabarit: (nom: string) => Gabarit;
  /**
   * `true` quand le banc a été lancé avec `--sans-ia` : l'absence de profil
   * est alors DÉCLARÉE, donc attendue. Sans ce drapeau, le banc ne pourrait
   * pas distinguer une absence demandée d'une absence subie.
   */
  iaDeclareeAbsente?: boolean;
  /**
   * `true` quand le sujet noté ne produit AUCUN rapport business par
   * construction — le scanner factice, témoin négatif du banc.
   *
   * Distinct d'`iaDeclareeAbsente` : `--sans-ia` retire l'IA, pas le rapport.
   * Le moteur en produit un STRUCTUREL sans clé, et c'est précisément dans
   * cette exécution que l'invariant doit pouvoir mordre.
   */
  sujetSansRapport?: boolean;
  /**
   * Table de détection de langue (`config/detection-langue.json`).
   *
   * OBLIGATOIRE, et `null` pour dire « ce contrôle n'est pas exercé ». Le champ
   * a d'abord été optionnel, et la revue a montré ce que l'optionnalité coûte :
   * deux des chemins réels de la notation ne le passaient pas — dont
   * `banc:enregistrer-ia`, la SEULE exécution où le modèle écrit réellement la
   * prose. Le contrôle y était donc inexistant, et son absence valait
   * SUCCÈS. Un appelant peut renoncer à ce contrôle ; il ne peut plus l'oublier.
   */
  detectionLangue: ConfigDetectionLangue | null;
}

export interface ParametresBanc extends ParametresNotation {
  /** Étiquette du run d'équivalence : le moteur monté sans client injecté. */
  assemblage?: 'production';
  scenarios: Scenario[];
  /** Sortie de progression (une ligne par appel) ; silencieux si absent. */
  journal?: (ligne: string) => void;
}

/**
 * Course entre le scanner et un timer. Le timer est toujours nettoyé et ne
 * retient jamais le processus ; un rejet tardif du scanner (après le
 * timeout) est absorbé pour ne pas devenir un rejet non géré.
 */
function scannerSousTimeout(
  scanner: Scanner,
  url: string,
  timeoutMs: number,
  messageTimeout: string,
  langueRapport?: string,
): Promise<Rapport> {
  let timer: NodeJS.Timeout | undefined;
  const echeance = new Promise<never>((_resoudre, rejeter) => {
    timer = setTimeout(() => rejeter(new Error(messageTimeout)), timeoutMs);
    timer.unref();
  });
  // La langue du rapport est un PARAMÈTRE DE SCAN : le banc la demande, puis
  // la vérifie dans le rapport rendu. Un canal muet ferait noter un rapport
  // français sous l'étiquette d'une demande anglaise — la mesure verte du
  // comportement par défaut, étiquetée du nom de l'autre (APPRENTISSAGES n°6).
  const scan = (async () =>
    scanner(url, { timeoutMs, ...(langueRapport === undefined ? {} : { langueRapport }) }))();
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
  const { sujet, politique, config, dico, obtenirGabarit } = params;
  const gabarit = obtenirGabarit(scenario.gabarit);
  const timeoutMs = config.scan.timeoutMs;

  // Le scanner est assemblé POUR CE SCÉNARIO : c'est là que le budget de
  // pages et la politique demandée entrent dans le moteur.
  const scanner = await sujet.pour(scenario);
  const serveur = await demarrerServeur(scenario, gabarit, config);
  let rapport: Rapport | undefined;
  let erreur: string | undefined;
  // Durée mesurée par le banc (pas auto-déclarée par le scanner) : disponible même en cas d'erreur ou de timeout.
  const debut = Date.now();
  try {
    rapport = await scannerSousTimeout(
      scanner,
      serveur.url,
      timeoutMs,
      traduire(dico, 'banc.timeoutScan', { timeoutMs }),
      scenario.langueRapport,
    );
  } catch (cause: unknown) {
    erreur = messageErreur(cause);
  } finally {
    await serveur.arreter();
  }
  const dureeMs = Date.now() - debut;

  const manifeste = deriverManifeste(scenario, gabarit);
  const base = { scenarioId: scenario.id, gabarit: gabarit.nom, langue: scenario.langue, politique, dureeMs };

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
    return {
      ...base,
      protocole: comptesProtocoleZero(),
      statut: 'erreur',
      erreur,
      attendus: toutRate(),
      profils: profilsNonMesures(manifeste),
      cibles: ciblesNonMesurees(manifeste, politique),
      rapports: rapportsNonMesures(manifeste, RAISON_RAPPORT_SCENARIO_EN_ERREUR),
      nbReplisDecision: 0,
      fauxPositifs: [],
      coutApi: 0,
    };
  }
  try {
    // AVANT toute notation : ce que le banc a DEMANDÉ est-il arrivé ? Un
    // budget ou une politique qui ne seraient pas parvenus au moteur
    // produiraient une mesure verte du comportement par défaut, étiquetée du
    // nom de l'autre — un diagnostic faux (APPRENTISSAGES n°6). La garde lève,
    // et le scénario passe en erreur par le même chemin qu'un rapport
    // inexploitable.
    verifierContraintes(rapport, scenario, politique);
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
    const appliquee = politiqueAppliquee(rapport);
    const contextePolitique = { demandee: politique, ...(appliquee === undefined ? {} : { appliquee }) };
    const cibles = noterCibles(rapport, manifeste, contextePolitique);
    const rapports = noterRapports(rapport, manifeste, params.detectionLangue, params.iaDeclareeAbsente === true);
    // INVARIANT ÉTENDU (4a → 5) : un attendu de rapport non mesuré est une
    // absence SUBIE dès que l'IA n'a pas été déclarée absente — et un rapport
    // business est produit MÊME sans IA (structurel). Son absence totale est
    // donc un défaut du moteur, jamais un effet du mode dégradé.
    // `sujetSansRapport` et NON `iaDeclareeAbsente` : un rapport business est
    // produit même sans IA (structurel), donc `--sans-ia` n'excuse pas son
    // absence — c'est au contraire la run où l'invariant doit mordre.
    if (statut === 'ok' && rapportsNonMesuresSubis(rapports, params.sujetSansRapport === true) > 0) {
      statut = 'erreur';
      raison = RAISON_RAPPORTS_NON_MESURES;
    }
    // INVARIANT JUMEAU : un rapport qui avait des sections à rédiger et n'a
    // aucune prose, hors absence DÉCLARÉE d'IA, est une rédaction non mesurée.
    // Sans lui, un parc de cassettes introuvable produit des rapports
    // STRUCTURELS — donc justes — et une scorecard verte.
    if (statut === 'ok' && prosesNonMesureesSubies(rapports, params.iaDeclareeAbsente === true) > 0) {
      statut = 'erreur';
      raison = RAISON_PROSE_NON_MESUREE;
    }
    const couverture = calculerCouverture(rapport, manifeste, contextePolitique);
    const nbReplisDecision = compterReplisDecision(rapport);
    // INVARIANT ÉTENDU (4a → 4b) : un repli par décision est une absence
    // SUBIE. Le scan continue — c'est le bon comportement — mais le scénario
    // ne peut pas se lire « tout va bien » : ce qu'il mesure n'est plus ce
    // qu'on croit mesurer.
    if (statut === 'ok' && replisDecisionSubis(nbReplisDecision, politique, POLITIQUE_IA) > 0) {
      statut = 'erreur';
      raison = RAISON_REPLIS_DECISION;
    }
    return {
      ...base,
      protocole,
      statut,
      ...(raison === undefined ? {} : { erreur: raison }),
      ...(appliquee === undefined ? {} : { politiqueAppliquee: appliquee }),
      attendus,
      profils,
      cibles,
      rapports,
      ...(rapport.rapportBusiness === undefined ? {} : { rapportBusiness: rapport.rapportBusiness }),
      ...(couverture === undefined ? {} : { couverture }),
      nbReplisDecision,
      fauxPositifs,
      coutApi: rapport.coutApi,
      // Le coût VENTILÉ voyage jusqu'à la scorecard : sans lui, le tableau des
      // profils afficherait le total du scan — donc, depuis la navigation IA,
      // surtout le prix du PARCOURS — sous l'étiquette du profilage.
      ...(rapport.coutApiParFamille === undefined ? {} : { coutApiParFamille: rapport.coutApiParFamille }),
      // Le chiffre qui manquait partout (APPRENTISSAGES n°18) : ce que le protocole a physiquement rejoué.
      rejouabilite: tauxRejouabilite(rapport),
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
    // Même garde-fou sur la ventilation que sur le total : trois `NaN`
    // propagés dans les agrégats seraient pires que le zéro d'avant.
    const parFamille = rapport.coutApiParFamille;
    const ventilationSaine =
      parFamille !== undefined &&
      Number.isFinite(parFamille.exploration) &&
      Number.isFinite(parFamille.profilage) &&
      Number.isFinite(parFamille.confirmation);
    return {
      ...base,
      protocole: comptesProtocoleZero(),
      statut: 'erreur',
      erreur: messageErreur(cause),
      attendus: toutRate(),
      profils: profilsNonMesures(manifeste),
      cibles: ciblesNonMesurees(manifeste, politique),
      rapports: rapportsNonMesures(manifeste, RAISON_RAPPORT_SCENARIO_EN_ERREUR),
      nbReplisDecision: 0,
      fauxPositifs: [],
      coutApi,
      ...(ventilationSaine && parFamille !== undefined ? { coutApiParFamille: parFamille } : {}),
      rapport,
    };
  }
}

/**
 * Les deux absences DÉCLARÉES d'un run, décidées en UN endroit.
 *
 * Elles ne disent pas la même chose, et les confondre éteint un invariant :
 *  - `iaDeclareeAbsente` couvre `--sans-ia` ET un sujet sans IA. Sans IA, il
 *    n'y a ni profil ni prose : leur absence est normale.
 *  - `sujetSansRapport` ne couvre QUE le sujet qui ne produit aucun rapport
 *    par construction. `--sans-ia` n'en fait pas partie : le moteur produit un
 *    rapport STRUCTUREL sans clé, et c'est précisément dans ce mode que la
 *    promesse de la constitution §4 doit être éprouvée.
 *
 * Extraite de la CLI et EXPORTÉE pour une seule raison : elle y vivait dans
 * `principal()`, que rien n'invoque en test. Une régression — les deux
 * drapeaux confondus — n'aurait fait échouer aucun test, et aurait désarmé
 * l'invariant du rapport dans la seule exécution où il mord (APPRENTISSAGES
 * n°12 : une correction que rien n'éprouve n'est pas une correction).
 */
export function absencesDeclarees(nomSujet: string, sansIa: boolean): { iaDeclareeAbsente: boolean; sujetSansRapport: boolean } {
  const sujetReel = nomSujet === 'reel';
  return { iaDeclareeAbsente: sansIa || !sujetReel, sujetSansRapport: !sujetReel };
}

export async function executerBanc(params: ParametresBanc): Promise<Scorecard> {
  const { scenarios, sujet, politique, config, dico, obtenirGabarit, iaDeclareeAbsente, sujetSansRapport, detectionLangue } = params;
  const journal = params.journal ?? ((): void => undefined);
  const horodatage = new Date().toISOString();

  journal(traduire(dico, 'banc.demarrage', { nombre: scenarios.length, scanner: sujet.nom, politique }));
  const resultats: ResultatScenario[] = [];
  for (const scenario of scenarios) {
    journal(traduire(dico, 'banc.scenarioEnCours', { id: scenario.id }));
    const resultat = await noterScenario(scenario, {
      sujet,
      politique,
      config,
      dico,
      obtenirGabarit,
      iaDeclareeAbsente,
      sujetSansRapport,
      detectionLangue,
    });
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
  return calculerScorecard(resultats, config, horodatage, politique, params.assemblage);
}

// ---------------------------------------------------------------------------
// Mode CLI : pnpm banc [--sujet reel|factice] [--sans-ia] [--politique deterministe|ia] --scenario <id> | --tous
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
  /**
   * `--assemblage-production` : le sujet est le moteur monté SANS client
   * injecté — le vrai client, le vrai réseau, la vraie dépense. C'est le mode
   * d'équivalence du cahier correctif n°1, et il est exclusif de `--sans-ia`.
   */
  assemblageProduction: boolean;
  /**
   * `--politique deterministe|ia` : la politique de décision de navigation
   * imposée au moteur pour tout le run. Absente = celle de
   * `config/scanner.json`. Deux runs de politiques différentes produisent deux
   * scorecards comparables : c'est ainsi que la jumelle inter-politiques se
   * mesure, une politique à la fois, mais toujours affichée à deux.
   */
  politique?: string;
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
        'assemblage-production': { type: 'boolean' },
        politique: { type: 'string' },
      },
      strict: true,
    });
    // Les deux modes se contredisent : l'un retire toute IA, l'autre exige la vraie.
    if (values['sans-ia'] === true && values['assemblage-production'] === true) {
      return null;
    }
    return {
      scenario: values.scenario,
      tous: values.tous === true,
      sujet: values.sujet,
      sansIa: values['sans-ia'] === true,
      assemblageProduction: values['assemblage-production'] === true,
      politique: values.politique,
    };
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

  // La politique par défaut est celle du MOTEUR (`config/scanner.json`), pas
  // une valeur du banc : le banc demande ce que le produit ferait de
  // lui-même tant qu'on ne lui demande rien d'autre.
  const { chargerConfigScanner } = await import('../../core/scanner/config.js');
  const configScanner = await chargerConfigScanner();
  const politique = options.politique ?? configScanner.exploration.politique;
  if (!estNomPolitique(politique)) {
    console.error(traduire(dico, 'banc.politiqueInconnue', { politique, politiques: POLITIQUES.join(', ') }));
    console.error(traduire(dico, 'banc.usage'));
    process.exitCode = 2;
    return;
  }

  // Le banc IMPOSE son client IA au moteur : rejeu sur cassettes par défaut,
  // aucune capacité avec `--sans-ia`. Dans les deux cas, aucun appel réseau —
  // un poste qui porte une clé d'API ne doit pas noter autre chose qu'un poste
  // qui n'en a pas.
  let sujet: SujetNote;
  if (options.assemblageProduction) {
    // MODE D'ÉQUIVALENCE (cahier correctif n°1). Aucun client n'est fourni au
    // moteur : il construit le sien depuis config/ et la clé, comme en
    // production. Payant, réseau réel, non déterministe, aucune cassette lue ni
    // écrite — et il refuse de partir sans clé plutôt que de mesurer un
    // silence de plus.
    const { chargerConfigScanner } = await import('../../core/scanner/config.js');
    const scanner = await chargerConfigScanner();
    const cle = process.env[scanner.ia.variableCle];
    if (cle === undefined || cle === '') {
      console.error(traduire(dico, 'banc.assemblageProductionSansCle', { variable: scanner.ia.variableCle }));
      process.exitCode = 2;
      return;
    }
    console.log(traduire(dico, 'banc.assemblageProduction'));
    sujet = await creerSujet(nomSujet, undefined, { politique, assemblageProduction: true });
  } else {
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
    sujet = await creerSujet(nomSujet, client, { politique });
  }

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

  // Les deux absences déclarées, décidées par `absencesDeclarees` — une seule
  // source, et elle est testée : ici, dans `principal()`, rien ne l'exercerait.
  const { iaDeclareeAbsente, sujetSansRapport } = absencesDeclarees(nomSujet, options.sansIa);
  // La table de détection de langue est chargée UNE FOIS : sans elle, le
  // contrôle de la langue de la prose ne s'exerce pas, et le critère
  // « rapport intégralement dans la langue demandée » retomberait sur la
  // comparaison d'étiquettes qui ne peut pas échouer.
  const detectionLangue = await chargerDetectionLangue();
  const scorecard = await executerBanc({
    scenarios,
    sujet,
    politique,
    config,
    dico,
    obtenirGabarit,
    journal: console.log,
    iaDeclareeAbsente,
    sujetSansRapport,
    detectionLangue,
    ...(options.assemblageProduction ? { assemblage: 'production' as const } : {}),
  });
  console.log(rendreScorecardConsole(scorecard, dico, config.langueConsole, { iaDeclareeAbsente, rejouabiliteMinPourcent: config.scorecard.rejouabiliteMinPourcent }));
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
