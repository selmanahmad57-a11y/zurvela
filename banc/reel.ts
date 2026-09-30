/**
 * `pnpm banc:reel` — LA VALIDATION SUR LE RÉEL (docs/METHODE.md §12, cahier P2-1
 * contrat 6).
 *
 * Le banc a validé à 100 % un moteur qui fait 85 % de faux positifs sur le web
 * réel : ses gabarits sont propres, ses cassettes figent une réponse. Depuis
 * la Phase 2, un cahier correctif se clôt aussi sur un sous-ensemble des dix
 * sites de la campagne 6b, rejoués AVANT et APRÈS la correction — dans la
 * même session, parce que ces sites sont vivants.
 *
 * Ce que cette commande est : une MESURE de non-régression du réel, de la
 * famille `banc:*` comme `banc:equivalence`. Ce qu'elle n'est pas : un scan de
 * campagne (les fiches restent le bestiaire) ni un atelier (rien ne se corrige
 * à chaud sur le réel). Elle scanne les sites nommés par leurs cas
 * (`banc/reel/<site>.json`), lit les journaux, compare la rejouabilité et la
 * durée aux attendus du cas, et ÉCRIT son résultat comme les autres.
 *
 * Trois précautions, toutes tranchées le 2026-09-29 :
 *  - l'« avant » se mesure dans la même session que l'« après » (`--avant`
 *    nomme le dossier d'un moteur d'avant — un worktree d'une version
 *    antérieure — et la commande y lance le MÊME scan, à quelques minutes
 *    d'écart) ; sans `--avant`, l'avant est celui de la fiche, et la commande
 *    le dit. `--avant` est RÉPÉTABLE : plusieurs moteurs d'avant se mesurent
 *    dans la même session, ce qui donne le seul tableau comparable quand les
 *    cibles sont vivantes — un cahier isole ainsi son propre écart, et la
 *    somme des cahiers se lit d'un coup (P2-2, décision D4) ;
 *  - un site indisponible, ou dont la structure a changé (moins de pages ou
 *    de candidates que le seuil du cas), est DÉCLARÉ, jamais comparé — le
 *    fantôme de troisième espèce appliqué à la validation réelle ;
 *  - un témoin (un site où tout marchait) doit rester où il était : s'il
 *    bouge, c'est le moteur ou le réseau, pas le site.
 *
 * Elle est payante et non déterministe : chaque scan coûte sa rédaction, et
 * deux runs ne sont jamais identiques. Le budget s'annonce à l'ouverture du
 * cahier ; elle refuse de partir sans clé.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../core/i18n.js';
import { chargerConfigScanner, FICHIER_CONFIG_PRODUCTION, type ConfigScanner } from '../core/scanner/config.js';
import { MOTIF_CONSTATEE_AU_REJEU, graviteDecouverte } from '../core/scanner/confirmation/decouvertes.js';
import { MOTIF_DECOUVERTE_DIAGNOSTIC_SITE } from '../core/scanner/confirmation/pont-vocabulaires.js';
import { tauxRejouabilite } from '../core/scanner/confirmation/rejouabilite.js';
import { VERDICTS_RETENUS, type Anomalie, type Rapport } from '../core/types.js';
import { chargerConfig } from './config.js';
import { depuisRacine } from './outils/racine.js';

/** Dossier des cas de validation réelle, un fichier par site. */
export const DOSSIER_CAS = 'banc/reel';

export interface CasReel {
  id: string;
  url: string;
  /** `defaut` : un site où le défaut a mordu ; `temoin` : un site où tout marchait déjà. */
  role: 'defaut' | 'temoin';
  fiche: string;
  defaut: string | null;
  /** L'« avant » de la fiche : ce que le moteur de la campagne a produit. */
  avant: { rejouabiliteGroupesPourcent: number; candidates: number; groupes: number; retenues: number; pages: number; dureeMs: number };
  attendus: { rejouabiliteGroupesMinPourcent: number; dureeMaxMs: number; pagesMin: number; candidatesMin: number };
}

export interface MesuresScan {
  dureeMs: number;
  pages: number;
  candidates: number;
  retenues: number;
  groupes: number;
  groupesRejoues: number;
  /** Rejouabilité par GROUPES en pourcentage ; null sans candidate (rien à rejouer n'est pas zéro). */
  tauxGroupesPourcent: number | null;
  arret: string;
  coutApi: number;
  /** Taille du journal écrit par le scan — ce que la fiche 07 appelait « le journal lourd ». */
  tailleJournalOctets: number;
  /** Retenues publiées sans re-test qui leur soit propre : les découvertes (cahier P2-1, contrat 8). */
  decouvertes: number;
  /**
   * Découvertes publiées comme si elles avaient été vérifiées : verdict de
   * retenue, ou gravité au-delà de la borne. Doit valoir zéro — c'est le
   * contrat 8 lu sur le réel. Se mesure aussi sur le moteur d'AVANT, qui
   * posait `confirmee` sur ses découvertes : c'est l'écart que l'on montre.
   */
  decouvertesAffirmees: number;
}

/** Une découverte se reconnaît à son verdict (moteur P2-1) ou à son motif (tout moteur). */
function estDecouverte(anomalie: Anomalie): boolean {
  return anomalie.verdict === 'decouverte' || anomalie.motif === MOTIF_CONSTATEE_AU_REJEU || anomalie.motif === MOTIF_DECOUVERTE_DIAGNOSTIC_SITE;
}

/** Une découverte « affirmée » : publiée avec un verdict de retenue, ou une gravité que seul un re-test autorise. */
function estAffirmee(anomalie: Anomalie): boolean {
  return (anomalie.verdict !== undefined && VERDICTS_RETENUS.includes(anomalie.verdict)) || graviteDecouverte(anomalie.graviteEstimee) !== anomalie.graviteEstimee;
}

export type VerdictReel =
  | { statut: 'tenu'; temoinStable: boolean | null }
  | { statut: 'non-tenu'; raisons: string[] }
  | { statut: 'declare'; motif: 'indisponible' | 'structure-changee' | 'echec-scan'; detail: string };

export interface OptionsReel {
  sites: string[];
  /** Moteurs d'avant, dans l'ordre donné : chacun scanne le même site, dans la même session. */
  avant: string[];
}

const DECIMALES = 1;

/**
 * Ce qu'il faut pour écrire une ligne à l'opérateur : le dictionnaire et les
 * formats de nombres de la langue console (constitution §2 — « 2.1 % » ou
 * « 0.3101 USD » sont des formats du monde, pas du web).
 */
export interface Rendu {
  dico: Dictionnaire;
  pourcent(valeur: number | null): string;
  entier(valeur: number): string;
  montant(valeur: number): string;
}

export function creerRendu(dico: Dictionnaire, langue: string): Rendu {
  const pourcentage = new Intl.NumberFormat(langue, { style: 'percent', maximumFractionDigits: DECIMALES });
  const entier = new Intl.NumberFormat(langue, { maximumFractionDigits: 0 });
  const montant = new Intl.NumberFormat(langue, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const nonApplicable = traduire(dico, 'scorecard.nonApplicable');
  return {
    dico,
    pourcent: (valeur) => (valeur === null ? nonApplicable : pourcentage.format(valeur / 100)),
    entier: (valeur) => entier.format(valeur),
    montant: (valeur) => montant.format(valeur),
  };
}

export function lireOptions(args?: string[]): OptionsReel | null {
  try {
    const { values } = parseArgs({
      args,
      options: { site: { type: 'string', multiple: true }, avant: { type: 'string', multiple: true } },
      allowPositionals: false,
      strict: true,
    });
    return { sites: values.site ?? [], avant: values.avant ?? [] };
  } catch {
    return null;
  }
}

/** Les mesures d'un scan, lues sur son rapport technique — les mêmes chiffres que la fiche recopie. */
export function mesuresDe(rapport: Rapport, tailleJournalOctets: number): MesuresScan {
  const rejouabilite = tauxRejouabilite(rapport);
  const decouvertes = rapport.anomalies.filter(estDecouverte);
  const taux = rejouabilite.groupes === 0 ? null : Math.round((rejouabilite.groupesRejoues / rejouabilite.groupes) * 100 * 10 ** DECIMALES) / 10 ** DECIMALES;
  return {
    dureeMs: rapport.dureeMs,
    pages: rapport.parcours?.pages.length ?? 0,
    candidates: rapport.candidates?.length ?? 0,
    retenues: rapport.anomalies.length,
    groupes: rejouabilite.groupes,
    groupesRejoues: rejouabilite.groupesRejoues,
    tauxGroupesPourcent: taux,
    arret: rapport.parcours?.arret ?? 'erreur',
    coutApi: rapport.coutApi,
    tailleJournalOctets,
    decouvertes: decouvertes.length,
    decouvertesAffirmees: decouvertes.filter(estAffirmee).length,
  };
}

/**
 * Le verdict d'un cas, PUR : l'après face aux attendus, et le témoin face à
 * son avant. Une structure qui a changé n'est pas jugée ; un taux sans
 * dénominateur (aucune candidate) ne peut pas être « sous le seuil » — il est
 * déclaré comme un changement de structure si le cas attendait des candidates.
 */
export function juger(cas: CasReel, apres: MesuresScan, rendu: Rendu, avant?: MesuresScan): VerdictReel {
  const { dico } = rendu;
  if (apres.pages < cas.attendus.pagesMin || apres.candidates < cas.attendus.candidatesMin) {
    return {
      statut: 'declare',
      motif: 'structure-changee',
      detail: traduire(dico, 'reel.structureChangee', {
        id: cas.id,
        pages: rendu.entier(apres.pages),
        pagesMin: rendu.entier(cas.attendus.pagesMin),
        candidates: rendu.entier(apres.candidates),
        candidatesMin: rendu.entier(cas.attendus.candidatesMin),
      }),
    };
  }
  const raisons: string[] = [];
  const taux = apres.tauxGroupesPourcent ?? 0;
  if (taux < cas.attendus.rejouabiliteGroupesMinPourcent) {
    raisons.push(traduire(dico, 'reel.raisonRejouabilite', { taux: rendu.pourcent(apres.tauxGroupesPourcent), min: rendu.pourcent(cas.attendus.rejouabiliteGroupesMinPourcent) }));
  }
  // Contrat 8, sur tous les sites : une découverte n'est jamais publiée comme
  // un défaut vérifié. Pas de seuil : un seul cas suffit à ne pas tenir.
  if (apres.decouvertesAffirmees > 0) {
    raisons.push(traduire(dico, 'reel.raisonDecouvertes', { nombre: rendu.entier(apres.decouvertesAffirmees) }));
  }
  if (apres.dureeMs > cas.attendus.dureeMaxMs) {
    raisons.push(traduire(dico, 'reel.raisonDuree', { dureeMs: rendu.entier(apres.dureeMs), dureeMaxMs: rendu.entier(cas.attendus.dureeMaxMs) }));
  }
  const reference = avant?.tauxGroupesPourcent ?? cas.avant.rejouabiliteGroupesPourcent;
  let temoinStable: boolean | null = null;
  if (cas.role === 'temoin') {
    temoinStable = taux >= reference;
    if (!temoinStable) {
      raisons.push(traduire(dico, 'reel.temoinBouge', { avant: rendu.pourcent(reference), apres: rendu.pourcent(apres.tauxGroupesPourcent) }));
    }
  }
  return raisons.length === 0 ? { statut: 'tenu', temoinStable } : { statut: 'non-tenu', raisons };
}

export async function chargerCas(dossier: string = depuisRacine(DOSSIER_CAS)): Promise<CasReel[]> {
  const fichiers = (await readdir(dossier)).filter((nom) => nom.endsWith('.json')).sort();
  const cas: CasReel[] = [];
  for (const fichier of fichiers) {
    cas.push(JSON.parse(await readFile(path.join(dossier, fichier), 'utf8')) as CasReel);
  }
  return cas;
}

/** Disponibilité du site, sous l'identité déclarée du robot : un statut, ou null si le réseau a refusé. */
async function disponibilite(url: string, config: ConfigScanner): Promise<number | null> {
  try {
    const reponse = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': config.robot.userAgent, [config.robot.enTete]: config.robot.valeurEnTete },
      redirect: 'follow',
      signal: AbortSignal.timeout(config.exploration.chargementPageMs),
    });
    return reponse.status;
  } catch {
    return null;
  }
}

/**
 * Un scan RÉEL par le moteur d'un dossier donné — le nôtre ou celui d'avant —
 * par la même commande que la campagne (`scripts/scan.ts`), donc la même
 * configuration de production, le même journal. Le moteur d'avant doit avoir
 * ses dépendances installées ; la commande le dit plutôt que de deviner.
 */
async function scannerAvec(moteur: string, url: string, dossierTravail: string, moment: string): Promise<{ ok: true; rapport: Rapport; tailleJournalOctets: number } | { ok: false; message: string }> {
  const journal = path.join(dossierTravail, `${moment}.journal.json`);
  const sortie = path.join(dossierTravail, `${moment}.rapport.md`);
  const code = await new Promise<number>((resoudre) => {
    const enfant = spawn(process.execPath, ['--import', 'tsx', 'scripts/scan.ts', url, '--config', 'production', '--journal', journal, '--sortie', sortie], {
      cwd: moteur,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    enfant.on('exit', (statut) => resoudre(statut ?? 1));
    enfant.on('error', () => resoudre(1));
  });
  if (code !== 0) {
    return { ok: false, message: `exit ${code}` };
  }
  try {
    return { ok: true, rapport: JSON.parse(await readFile(journal, 'utf8')) as Rapport, tailleJournalOctets: (await stat(journal)).size };
  } catch (erreur: unknown) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

interface ResultatCas {
  cas: CasReel;
  disponibilite: number | null;
  /** Un relevé par moteur d'avant, dans l'ordre de `--avant`. */
  avant: { moteur: string; mesures: MesuresScan | { echec: string } }[];
  apres?: MesuresScan | { echec: string };
  verdict: VerdictReel;
}

async function principal(): Promise<void> {
  const options = lireOptions();
  const configBanc = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), configBanc.langueConsole);
  const rendu = creerRendu(dico, configBanc.langueConsole);
  const momentAvant = traduire(dico, 'reel.momentAvant');
  const momentApres = traduire(dico, 'reel.momentApres');
  if (options === null) {
    console.error(traduire(dico, 'reel.usage'));
    process.exitCode = 2;
    return;
  }
  const scanner = await chargerConfigScanner(FICHIER_CONFIG_PRODUCTION);
  const cle = process.env[scanner.ia.variableCle];
  if (cle === undefined || cle === '') {
    console.error(traduire(dico, 'reel.sansCle', { variable: scanner.ia.variableCle }));
    process.exitCode = 2;
    return;
  }
  const tous = await chargerCas();
  const connus = tous.map((cas) => cas.id);
  for (const id of options.sites) {
    if (!connus.includes(id)) {
      console.error(traduire(dico, 'reel.casInconnu', { id, connus: connus.join(', ') }));
      process.exitCode = 2;
      return;
    }
  }
  const retenus = options.sites.length === 0 ? tous : tous.filter((cas) => options.sites.includes(cas.id));
  console.log(traduire(dico, 'reel.entete', { nombre: retenus.length }));

  const dossierTravail = await mkdtemp(path.join(tmpdir(), 'zurvela-reel-'));
  const resultats: ResultatCas[] = [];
  let coutTotal = 0;
  for (const cas of retenus) {
    console.log(traduire(dico, 'reel.debut', { id: cas.id, role: cas.role, fiche: cas.fiche, url: cas.url }));
    const statut = await disponibilite(cas.url, scanner);
    if (statut !== 200) {
      const detail = traduire(dico, 'reel.indisponible', { id: cas.id, statut: statut === null ? traduire(dico, 'scorecard.nonApplicable') : rendu.entier(statut) });
      console.log(detail);
      resultats.push({ cas, disponibilite: statut, avant: [], verdict: { statut: 'declare', motif: 'indisponible', detail } });
      continue;
    }
    const resultat: ResultatCas = { cas, disponibilite: statut, avant: [], verdict: { statut: 'declare', motif: 'echec-scan', detail: '' } };
    // Les moteurs d'avant, dans l'ordre : le DERNIER sert de référence au
    // témoin (c'est le plus proche de l'après), les précédents donnent la
    // profondeur historique du tableau.
    let mesuresAvant: MesuresScan | undefined;
    for (const moteur of options.avant) {
      const nom = path.basename(moteur);
      const avant = await scannerAvec(moteur, cas.url, dossierTravail, `${cas.id}.${nom}`);
      if (avant.ok) {
        const mesures = mesuresDe(avant.rapport, avant.tailleJournalOctets);
        coutTotal += mesures.coutApi;
        mesuresAvant = mesures;
        resultat.avant.push({ moteur: nom, mesures });
        console.log(ligneScan(rendu, `${momentAvant} ${nom}`, mesures));
      } else {
        resultat.avant.push({ moteur: nom, mesures: { echec: avant.message } });
        console.log(traduire(dico, 'reel.echecScan', { moment: `${momentAvant} ${nom}`, message: avant.message }));
      }
    }
    const apres = await scannerAvec(depuisRacine(), cas.url, dossierTravail, `${cas.id}.apres`);
    if (!apres.ok) {
      resultat.apres = { echec: apres.message };
      resultat.verdict = { statut: 'declare', motif: 'echec-scan', detail: apres.message };
      console.log(traduire(dico, 'reel.echecScan', { moment: momentApres, message: apres.message }));
      resultats.push(resultat);
      continue;
    }
    const mesures = mesuresDe(apres.rapport, apres.tailleJournalOctets);
    coutTotal += mesures.coutApi;
    resultat.apres = mesures;
    console.log(ligneScan(rendu, momentApres, mesures));
    resultat.verdict = juger(cas, mesures, rendu, mesuresAvant);
    console.log(ligneVerdict(rendu, cas, mesures, resultat.verdict));
    resultats.push(resultat);
  }

  const fichier = path.join(depuisRacine(configBanc.scorecard.dossierResultats), `reel-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(fichier, `${JSON.stringify({ horodatage: new Date().toISOString(), avant: options.avant ?? null, dossierTravail, resultats }, null, 1)}\n`, 'utf8');
  const tenus = resultats.filter((r) => r.verdict.statut === 'tenu').length;
  const nonTenus = resultats.filter((r) => r.verdict.statut === 'non-tenu').length;
  console.log(traduire(dico, 'reel.resultatsEcrits', { fichier }));
  console.log(traduire(dico, 'reel.bilan', { tenus, nonTenus, declares: resultats.length - tenus - nonTenus, total: resultats.length, cout: rendu.montant(coutTotal) }));
  if (nonTenus > 0) {
    process.exitCode = 1;
  }
}

/** Octets par kilo-octet : l'unité de taille du journal, une constante du web. */
const OCTETS_PAR_KO = 1024;

function ligneScan(rendu: Rendu, moment: string, mesures: MesuresScan): string {
  return traduire(rendu.dico, 'reel.scan', {
    moment,
    dureeMs: rendu.entier(mesures.dureeMs),
    pages: rendu.entier(mesures.pages),
    candidates: rendu.entier(mesures.candidates),
    retenues: rendu.entier(mesures.retenues),
    decouvertes: rendu.entier(mesures.decouvertes),
    affirmees: rendu.entier(mesures.decouvertesAffirmees),
    groupesRejoues: rendu.entier(mesures.groupesRejoues),
    groupes: rendu.entier(mesures.groupes),
    taux: rendu.pourcent(mesures.tauxGroupesPourcent),
    arret: mesures.arret,
    cout: rendu.montant(mesures.coutApi),
    journalKo: rendu.entier(Math.round(mesures.tailleJournalOctets / OCTETS_PAR_KO)),
  });
}

function ligneVerdict(rendu: Rendu, cas: CasReel, mesures: MesuresScan, verdict: VerdictReel): string {
  const { dico } = rendu;
  if (verdict.statut === 'tenu') {
    return traduire(dico, 'reel.tenu', {
      id: cas.id,
      taux: rendu.pourcent(mesures.tauxGroupesPourcent),
      min: rendu.pourcent(cas.attendus.rejouabiliteGroupesMinPourcent),
      dureeMs: rendu.entier(mesures.dureeMs),
      dureeMaxMs: rendu.entier(cas.attendus.dureeMaxMs),
      temoin: verdict.temoinStable === true ? traduire(dico, 'reel.temoinStable') : '',
    });
  }
  if (verdict.statut === 'non-tenu') {
    return traduire(dico, 'reel.nonTenu', { id: cas.id, raisons: verdict.raisons.join(traduire(dico, 'reel.separateur')) });
  }
  return verdict.detail;
}

if (process.argv[1]?.endsWith('reel.ts') === true) {
  principal().catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  });
}
