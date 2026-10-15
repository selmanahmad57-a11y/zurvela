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
  cheminVerification,
  demarrerVerification,
  normaliserOrigine,
  peutScanner,
  type Recuperer,
  type StockVerification,
} from './verification-propriete.js';
import { categoriserEchec } from './categorie-echec.js';
import { CHEMINS } from './routes-api.js';
import { reserverScan, type ConfigQuota, type StockQuota } from './quota.js';
import { emailValide } from './courriel.js';

// ───────────────────────── File des scans ─────────────────────────

export type EtatScan = 'en-attente' | 'en-cours' | 'termine' | 'echoue';
export interface EntreeScan {
  readonly scanId: string;
  readonly origine: string;
  readonly etat: EtatScan;
  readonly creeLe: number;
  readonly rapportHtml?: string;
  readonly erreur?: string;
  /** E-mail de livraison (étape 6), STOCKÉ TRANSITOIREMENT : effacé après la tentative d'envoi. */
  readonly email?: string;
}
export interface StockScans {
  lire(scanId: string): EntreeScan | undefined;
  ecrire(scanId: string, entree: EntreeScan): void;
  /** Le plus ancien scan « en-attente », ou undefined. */
  prochainEnAttente(): EntreeScan | undefined;
}

/** Exécute un scan derrière le proxy et rend le rapport HTML + son coût réel (pour le plafond de dépense). Injecté (le banc le double). */
export type ExecuterScan = (origine: string) => Promise<{ ok: true; rapportHtml: string; cout: number } | { ok: false; erreur: string; cout: number }>;

// ───────── (2) peutScanner AVANT d'enfiler + (4) IDOR (scanId imprévisible) ─────────

export interface OptionsDemarrerScan {
  readonly stockPreuves: StockVerification;
  readonly stockScans: StockScans;
  readonly maintenant: number;
  readonly octetsScanId: number;
  /** E-mail de livraison optionnel (étape 6), stocké sur l'entrée. Supposé DÉJÀ validé par l'appelant. */
  readonly email?: string;
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
  opts.stockScans.ecrire(scanId, {
    scanId,
    origine: auto.origine,
    etat: 'en-attente',
    creeLe: opts.maintenant,
    ...(opts.email === undefined ? {} : { email: opts.email }),
  });
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
/** Retire l'e-mail d'une entrée (minimisation, étape 6) : retourne une copie sans le champ, le reste intact. */
function entreeSansEmail(e: EntreeScan): EntreeScan {
  const copie: Partial<Record<keyof EntreeScan, unknown>> = { ...e };
  delete copie.email;
  return copie as EntreeScan;
}

export function creerOrdonnanceur(deps: {
  stockScans: StockScans;
  executer: ExecuterScan;
  maintenant: () => number;
  /** APRÈS chaque scan (réussi OU échoué), le coût réel — alimente le plafond de dépense (étape 5). */
  surCout?: (cout: number) => void;
  /** LIVRAISON e-mail (étape 6). Injecté (le banc le double). Son échec ne doit JAMAIS casser l'accès par id. */
  envoyer?: (opts: { destinataire: string; origine: string; rapportHtml: string }) => Promise<{ ok: boolean }>;
}): Ordonnanceur {
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
          // Le coût réel (même sur échec : des appels IA ont pu être payés) alimente le plafond de dépense.
          deps.surCout?.(r.cout);
          // LIVRAISON e-mail (étape 6) : si un e-mail a été collecté et qu'un rapport existe, l'envoyer.
          // Son échec ne casse PAS l'accès par id (le rapport reste à /statut/:id) MAIS il CRIE
          // (dette de clôture 2026-10-15) — un envoi raté ne doit pas être invisible.
          if (en.email !== undefined && r.ok && deps.envoyer !== undefined) {
            let envoye = false;
            try {
              // Le `{ok}` est LU (un ok:false — Resend non-200 — était auparavant ignoré en silence).
              envoye = (await deps.envoyer({ destinataire: en.email, origine: en.origine, rapportHtml: r.rapportHtml })).ok;
            } catch {
              envoye = false; // l'échec d'envoi ne casse jamais l'accès par id
            }
            if (!envoye) {
              // CRI : un envoi raté (ok:false OU throw) ne doit pas être invisible — l'e-mail
              // est effacé juste après, le marchand n'a pas son rapport, et sans ce cri rien
              // n'en garderait trace. §3 : scanId + origine, JAMAIS l'e-mail (identifiants
              // clients hors des logs) ; sur stderr (diagnostic opérateur, jamais au client).
              console.error('[envoi-echoue]', en.scanId, en.origine);
            }
          }
        } catch (e) {
          deps.stockScans.ecrire(en.scanId, { ...en, etat: 'echoue', erreur: (e as Error).message });
        }
        // EFFACEMENT (minimisation, étape 6) : retirer l'e-mail de l'entrée — réussi OU échoué, scan OU envoi.
        // On relit l'état courant (il porte le rapport/l'erreur) pour ne garder que lui, sans l'e-mail.
        if (en.email !== undefined) {
          const courant = deps.stockScans.lire(en.scanId);
          if (courant !== undefined) {
            deps.stockScans.ecrire(en.scanId, entreeSansEmail(courant));
          }
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
  /** Port d'écoute (toujours sur 127.0.0.1, derrière le reverse-proxy). Absent → port éphémère (tests). */
  readonly port?: number;
}

export interface DepsServeur {
  readonly stockVerif: StockVerification;
  readonly stockScans: StockScans;
  readonly stockQuota: StockQuota;
  readonly configQuota: ConfigQuota;
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

  // Corps du handler, extrait en fonction nommée : la coquille fail-closed
  // (ci-dessous) reste lisible — la coquille ATTRAPE, le corps ROUTE.
  const traiter = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://local');
    const chemin = url.pathname;
    const methode = req.method ?? 'GET';

    // GET /santé — vivant/prêt, rien de métier, aucune fuite.
    if (methode === 'GET' && chemin === CHEMINS.sante) {
      return repondre(res, 200, { ok: true });
    }

    // POST /verifier — démarre une vérification de propriété (étape 3).
    if (methode === 'POST' && chemin === CHEMINS.verifier) {
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
    if (methode === 'POST' && chemin === CHEMINS.scanner) {
      const corps = await lireCorpsJson(req, config.tailleCorpsMax);
      const urlSite = typeof corps?.['url'] === 'string' ? (corps['url'] as string) : undefined;
      if (urlSite === undefined) return repondre(res, 400, { erreur: 'url-requise' });
      // E-mail de livraison OPTIONNEL (étape 6). GARDE ANTI-INJECTION, bord d'entrée :
      // s'il est fourni, il est validé AVANT tout stockage et toute réservation. Invalide → 400.
      const emailBrut = corps?.['email'];
      let email: string | undefined;
      if (emailBrut !== undefined) {
        if (typeof emailBrut !== 'string' || !emailValide(emailBrut)) {
          return repondre(res, 400, { erreur: 'email-invalide' });
        }
        email = emailBrut;
      }
      const verif = await acheverVerification(urlSite, {
        stock: deps.stockVerif,
        maintenant: deps.maintenant(),
        recuperer: deps.recuperer,
        fenetreValiditeMs: config.fenetreValiditeMs,
        prefixeFichier: config.prefixeFichier,
      });
      if (!verif.ok) {
        // DISCRIMINATION : au-delà de la cause interne, on renvoie la CATÉGORIE
        // MARCHAND (partition par action requise), et pour le seau `absent`/
        // `contenu-inattendu` l'URL EXACTE testée (l'outil d'auto-diagnostic — le
        // serveur l'a vue, l'UI ne peut pas la refaire). `erreur` reste pour le debug.
        const normEchec = normaliserOrigine(urlSite);
        const jetonEchec = normEchec.ok ? deps.stockVerif.lireJeton(normEchec.origine)?.jeton : undefined;
        const urlVerifiee = normEchec.ok && jetonEchec !== undefined ? `${normEchec.origine}${cheminVerification(config.prefixeFichier, jetonEchec)}` : '';
        const echec = categoriserEchec(verif.raison, urlVerifiee);
        // `reessai` : les FAITS serveur (constats du GET) pour la décision de réessai
        // de l'UI — groupés à part des champs marchand (categorie/urlVerifiee), autre
        // public. ABSENT pour `url-invalide` (rejet à la saisie : re-saisir l'URL, pas
        // un réessai de jeton). Les faits sont bénins : dérivables de la catégorie
        // déjà publique, ils décrivent le site cible et le jeton, pas nos défenses.
        const reessai = echec.categorie === 'url-invalide' ? {} : { reessai: { reponseServie: verif.reponseServie, jetonMort: verif.jetonMort } };
        // La `RaisonEchec` BRUTE ne fuit pas dans le contrat public : `categorie` est
        // le descripteur marchand. Rien côté UI ne lit la raison interne.
        return repondre(res, 403, { ...echec, ...reessai });
      }
      const norm = normaliserOrigine(urlSite);
      if (!norm.ok) return repondre(res, 400, { erreur: norm.raison });
      // QUOTA DUR + ENFILEMENT, bloc SYNCHRONE (aucun `await` au milieu) :
      // contrôler → réserver (incrémenter le nombre) → enfiler. L'atomicité de
      // ce bloc (serveur mono-processus, stock synchrone) ferme la fenêtre de
      // course — deux requêtes ne peuvent pas réserver la même dernière place.
      const maintenant = deps.maintenant();
      const reserve = reserverScan({ stock: deps.stockQuota, maintenant, origine: norm.origine, config: deps.configQuota, ...(email === undefined ? {} : { email }) });
      if (!reserve.ok) {
        res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(Math.ceil(reserve.retryApresMs / 1000)) });
        res.end(JSON.stringify({ erreur: 'limite-atteinte', portee: reserve.raison }));
        return;
      }
      const dem = demarrerScan(urlSite, {
        stockPreuves: deps.stockVerif,
        stockScans: deps.stockScans,
        maintenant,
        octetsScanId: config.octetsScanId,
        ...(email === undefined ? {} : { email }),
        ...(deps.genId === undefined ? {} : { genId: deps.genId }),
      });
      if (!dem.ok) {
        // INVARIANT : acheverVerification réussi ⟹ peutScanner réussit — la preuve
        // est écrite sous la MÊME origine, dans le MÊME stock, sans `await`
        // intermédiaire, et la fenêtre de validité (1h) dépasse tout GET. Les trois
        // raisons de demarrerScan (url-refusee/non-prouve/preuve-expiree) sont donc
        // inatteignables ICI. Si cette branche tire, notre garde cardinale s'est
        // CONTREDITE : bug serveur, PAS une erreur marchand. On ÉCHOUE FORT (la
        // coquille en fait un 500 honnête + un cri stderr) ; lui donner une catégorie
        // marchand serait un faux message (§3, zéro faux positif).
        throw new Error(`incohérence interne : acheverVerification a réussi mais demarrerScan refuse (raison ${dem.raison})`);
      }
      deps.ordonnanceur.declencher();
      return repondre(res, 202, { scanId: dem.scanId });
    }

    // GET /statut/:id — avancement puis rapport, via l'id IMPRÉVISIBLE (IDOR).
    if (methode === 'GET' && chemin.startsWith(CHEMINS.statut)) {
      const id = decodeURIComponent(chemin.slice(CHEMINS.statut.length));
      const entree = id === '' ? undefined : deps.stockScans.lire(id);
      if (entree === undefined) return repondre(res, 404, { erreur: 'introuvable' });
      return repondre(res, 200, {
        etat: entree.etat,
        ...(entree.rapportHtml === undefined ? {} : { rapportHtml: entree.rapportHtml }),
        ...(entree.erreur === undefined ? {} : { erreur: entree.erreur }),
      });
    }

    return repondre(res, 404, { erreur: 'route-inconnue' });
  };

  // COQUILLE FAIL-CLOSED (dernière ligne). Sans elle, un `throw` dans `traiter`
  // PEND la requête (promesse rejetée en unhandledRejection, Node ne répond jamais —
  // même motif que « le serveur qui se pendait sur conflit de port »). Tout `throw`
  // inattendu — dont notre invariant d'incohérence — devient ici un 500 PROPRE :
  // requête fermée, process vivant. Le détail CRIE sur stderr (diagnostic opérateur,
  // hors locales/, n°32), jamais au client (pas de fuite).
  const serveur = http.createServer((req, res) => {
    traiter(req, res).catch((e: unknown) => {
      console.error('[incoherence-serveur]', e);
      // `headersSent` : si une réponse est déjà partie, écrire un 500 par-dessus
      // relancerait (writeHead) → le catch lancerait LUI-MÊME, sans filet derrière.
      // INATTEIGNABLE aujourd'hui : AUCUN envoi incrémental dans ce handler (chaque
      // réponse = writeHead+end atomique SUIVI d'un return ; aucun `throw` après un
      // envoi). Le garde reste quand même (un catch de dernière ligne ne doit jamais
      // lancer) et DEVIENDRA ACTIF si un handler se met un jour à streamer — ne pas le
      // retirer en le croyant mort. Branche documentée inatteignable, donc non testée.
      if (!res.headersSent) {
        repondre(res, 500, { erreur: 'incoherence-interne' });
      } else {
        res.destroy();
      }
    });
  });

  return new Promise((resolve, reject) => {
    // Rejeter si le port est déjà pris (EADDRINUSE) plutôt que de rester pendu :
    // un conflit de port doit échouer FORT, pas silencieusement.
    serveur.once('error', reject);
    serveur.listen(config.port ?? 0, '127.0.0.1', () => {
      serveur.removeListener('error', reject);
      resolve({
        port: (serveur.address() as { port: number }).port,
        fermer: () => new Promise((r) => serveur.close(() => r())),
      });
    });
  });
}
