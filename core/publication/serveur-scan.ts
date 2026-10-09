/**
 * SERVEUR DE SCAN PUBLIC (publication, étape 4). Le code quitte le dépôt et
 * tourne en continu face au public. Trois gardes, chacune prouvée au témoin :
 *  - la garde cardinale SSRF-au-scan = le PROXY FILTRANT (proxy-filtrant.ts),
 *    derrière lequel tout scan tourne (câblage `navigateur.ts`, transit prouvé) ;
 *  - `peutScanner` AVANT d'enfiler (garde de l'étape 3, active ici) : aucun scan
 *    ne part sans une preuve de propriété valide pour l'origine EXACTE ;
 *  - IDOR : le `scanId` est un jeton aléatoire crypto imprévisible — l'accès au
 *    rapport EST la connaissance de l'id (pas d'auth à ce stade).
 *
 * État durable en JSON atomique (preuves/jetons/scans). File : 1 scan à la fois.
 * Dépendances injectées (le banc teste sans scan réel ni réseau) ; la production
 * câble le vrai scanner-derrière-proxy et le vrai GET de vérification.
 * E-mail NON collecté (minimisation : reporté à l'étape 6).
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  acheverVerification,
  demarrerVerification,
  peutScanner,
  type Recuperer,
  type StockVerification,
} from './verification-propriete.js';

// ───────────────────────── File des scans ─────────────────────────

export type EtatScan = 'en-attente' | 'en-cours' | 'termine' | 'echoue';
export interface EntreeScan {
  readonly scanId: string;
  readonly origine: string;
  readonly etat: EtatScan;
  readonly creeLe: number;
  readonly rapportHtml?: string;
  readonly erreur?: string;
}
export interface StockScans {
  lire(scanId: string): EntreeScan | undefined;
  ecrire(scanId: string, entree: EntreeScan): void;
  /** Le plus ancien scan « en-attente », ou undefined. */
  prochainEnAttente(): EntreeScan | undefined;
}

/** Exécute un scan derrière le proxy et rend le rapport HTML. Injecté (le banc le double). */
export type ExecuterScan = (origine: string) => Promise<{ ok: true; rapportHtml: string } | { ok: false; erreur: string }>;

// ───────── (2) peutScanner AVANT d'enfiler + (4) IDOR (scanId imprévisible) ─────────

export interface OptionsDemarrerScan {
  readonly stockPreuves: StockVerification;
  readonly stockScans: StockScans;
  readonly maintenant: number;
  readonly octetsScanId: number;
  /** Générateur d'id (défaut : crypto). Le témoin injecte un générateur PRÉVISIBLE pour la mutation IDOR. */
  readonly genId?: () => string;
}
export type ResultatDemarrerScan = { ok: true; scanId: string } | { ok: false; raison: 'url-refusee' | 'non-prouve' | 'preuve-expiree' };

/**
 * LA GARDE CARDINALE DE L'ÉTAPE 3, ACTIVE. `peutScanner` lit l'état serveur des
 * preuves (non contournable par le client) : aucun scan n'est enfilé sans une
 * preuve valide pour l'origine exacte. Puis `scanId` imprévisible (IDOR).
 */
export function demarrerScan(urlBrute: string, opts: OptionsDemarrerScan): ResultatDemarrerScan {
  const auto = peutScanner(urlBrute, { stock: opts.stockPreuves, maintenant: opts.maintenant });
  if (!auto.ok) {
    return { ok: false, raison: auto.raison };
  }
  const scanId = (opts.genId ?? (() => randomBytes(opts.octetsScanId).toString('base64url')))();
  opts.stockScans.ecrire(scanId, { scanId, origine: auto.origine, etat: 'en-attente', creeLe: opts.maintenant });
  return { ok: true, scanId };
}

// ───────────────────────── (3) File : 1 scan à la fois ─────────────────────────

/**
 * Ordonnanceur SÉQUENTIEL : un seul scan à la fois. `declencher()` lance le
 * traitement s'il n'est pas déjà en cours ; à la fin d'un scan, il enchaîne sur
 * le suivant. Un redémarrage ne perd rien (l'état est durable) : au démarrage,
 * un scan resté « en-cours » (interrompu) est repris via `declencher`.
 */
export interface Ordonnanceur {
  declencher(): void;
  /** Promesse résolue quand la file est vidée — pour le témoin. */
  oisif(): Promise<void>;
}
export function creerOrdonnanceur(deps: { stockScans: StockScans; executer: ExecuterScan; maintenant: () => number }): Ordonnanceur {
  let enCours = false;
  let vague: Promise<void> = Promise.resolve();
  const traiter = async (): Promise<void> => {
    if (enCours) return;
    enCours = true;
    try {
      let prochain = deps.stockScans.prochainEnAttente();
      while (prochain !== undefined) {
        const en = prochain;
        deps.stockScans.ecrire(en.scanId, { ...en, etat: 'en-cours' });
        try {
          const r = await deps.executer(en.origine);
          deps.stockScans.ecrire(en.scanId, r.ok ? { ...en, etat: 'termine', rapportHtml: r.rapportHtml } : { ...en, etat: 'echoue', erreur: r.erreur });
        } catch (e) {
          deps.stockScans.ecrire(en.scanId, { ...en, etat: 'echoue', erreur: (e as Error).message });
        }
        prochain = deps.stockScans.prochainEnAttente();
      }
    } finally {
      enCours = false;
    }
  };
  return {
    declencher() {
      vague = vague.then(() => traiter());
    },
    oisif() {
      return vague;
    },
  };
}

// ───────────────────────── (4) Serveur + 4 routes ─────────────────────────

export interface ConfigPublication {
  readonly octetsJeton: number;
  readonly expirationJetonMs: number;
  readonly fenetreValiditeMs: number;
  readonly prefixeFichier: string;
  readonly octetsScanId: number;
  readonly tailleCorpsMax: number;
}

export interface DepsServeur {
  readonly stockVerif: StockVerification;
  readonly stockScans: StockScans;
  readonly ordonnanceur: Ordonnanceur;
  readonly recuperer: Recuperer;
  readonly maintenant: () => number;
  readonly config: ConfigPublication;
  /** Générateur d'id (tests : prévisible pour la mutation IDOR). */
  readonly genId?: () => string;
}

export interface ServeurScan {
  readonly port: number;
  fermer(): Promise<void>;
}

function lireCorpsJson(req: http.IncomingMessage, maxOctets: number): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let brut = '';
    let trop = false;
    req.on('data', (d: Buffer) => {
      brut += d.toString('utf8');
      if (brut.length > maxOctets) {
        trop = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (trop) return resolve(null);
      try {
        const v = JSON.parse(brut) as unknown;
        resolve(typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function repondre(res: http.ServerResponse, statut: number, corps: unknown): void {
  const txt = JSON.stringify(corps);
  res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8' });
  res.end(txt);
}

export function creerServeurScan(deps: DepsServeur): Promise<ServeurScan> {
  const { config } = deps;

  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const chemin = url.pathname;
    const methode = req.method ?? 'GET';

    // GET /santé — vivant/prêt, rien de métier, aucune fuite.
    if (methode === 'GET' && chemin === '/sante') {
      return repondre(res, 200, { ok: true });
    }

    // POST /verifier — démarre une vérification de propriété (étape 3).
    if (methode === 'POST' && chemin === '/verifier') {
      const corps = await lireCorpsJson(req, config.tailleCorpsMax);
      const urlSite = typeof corps?.['url'] === 'string' ? (corps['url'] as string) : undefined;
      if (urlSite === undefined) return repondre(res, 400, { erreur: 'url-requise' });
      const dem = demarrerVerification(urlSite, {
        stock: deps.stockVerif,
        maintenant: deps.maintenant(),
        octetsJeton: config.octetsJeton,
        expirationJetonMs: config.expirationJetonMs,
        prefixeFichier: config.prefixeFichier,
      });
      if (!dem.ok) return repondre(res, 400, { erreur: dem.raison });
      return repondre(res, 200, { origine: dem.origine, jeton: dem.jeton, chemin: dem.chemin, expireLe: dem.expireLe });
    }

    // POST /scanner — achève la vérification et, si peutScanner passe, enfile.
    if (methode === 'POST' && chemin === '/scanner') {
      const corps = await lireCorpsJson(req, config.tailleCorpsMax);
      const urlSite = typeof corps?.['url'] === 'string' ? (corps['url'] as string) : undefined;
      if (urlSite === undefined) return repondre(res, 400, { erreur: 'url-requise' });
      const verif = await acheverVerification(urlSite, {
        stock: deps.stockVerif,
        maintenant: deps.maintenant(),
        recuperer: deps.recuperer,
        fenetreValiditeMs: config.fenetreValiditeMs,
        prefixeFichier: config.prefixeFichier,
      });
      if (!verif.ok) return repondre(res, 403, { erreur: verif.raison });
      const dem = demarrerScan(urlSite, {
        stockPreuves: deps.stockVerif,
        stockScans: deps.stockScans,
        maintenant: deps.maintenant(),
        octetsScanId: config.octetsScanId,
        ...(deps.genId === undefined ? {} : { genId: deps.genId }),
      });
      if (!dem.ok) return repondre(res, 403, { erreur: dem.raison });
      deps.ordonnanceur.declencher();
      return repondre(res, 202, { scanId: dem.scanId });
    }

    // GET /statut/:id — avancement puis rapport, via l'id IMPRÉVISIBLE (IDOR).
    if (methode === 'GET' && chemin.startsWith('/statut/')) {
      const id = decodeURIComponent(chemin.slice('/statut/'.length));
      const entree = id === '' ? undefined : deps.stockScans.lire(id);
      if (entree === undefined) return repondre(res, 404, { erreur: 'introuvable' });
      return repondre(res, 200, {
        etat: entree.etat,
        ...(entree.rapportHtml === undefined ? {} : { rapportHtml: entree.rapportHtml }),
        ...(entree.erreur === undefined ? {} : { erreur: entree.erreur }),
      });
    }

    return repondre(res, 404, { erreur: 'route-inconnue' });
  });

  return new Promise((resolve) => {
    serveur.listen(0, '127.0.0.1', () => {
      resolve({
        port: (serveur.address() as { port: number }).port,
        fermer: () => new Promise((r) => serveur.close(() => r())),
      });
    });
  });
}
