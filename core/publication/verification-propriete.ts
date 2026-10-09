/**
 * VÉRIFICATION DE PROPRIÉTÉ (publication, étape 3) — LE VERROU DE SÉCURITÉ du
 * produit public : aucun scan ne part sans une preuve que le demandeur contrôle
 * le site. « On ne scanne que ce qu'on a le droit de scanner » (constitution §3).
 *
 * Logique PURE et testable ici ; le serveur HTTP (étape 4) l'appellera. Aucun
 * seuil en dur : durées, tailles et identité du robot entrent par paramètres
 * (leurs défauts de production vivront en config à l'étape 4). Les plages d'IP
 * privées/réservées sont des FAITS universels (RFC 1918/4193/3927…), au même
 * régime que les codes HTTP — le code connaît LE WEB, pas LE MONDE.
 *
 * Gardes de sécurité (chacune éprouvée par une mutation au témoin) :
 *  4a confusion/normalisation · 4b aucune redirection suivie · 4c origine exacte
 *  4d SSRF : hôte non public refusé AVANT connexion, IP épinglée (anti-rebinding)
 *  4e (NON close ici) SSRF au moment du scan via Playwright → dette n°34.
 */
import { randomBytes } from 'node:crypto';
import { isIP, type LookupFunction } from 'node:net';
import http from 'node:http';
import https from 'node:https';

// ───────────────────────── Types ─────────────────────────

export type RaisonRefusUrl = 'url-invalide' | 'schema-non-supporte' | 'userinfo-interdit' | 'ip-litterale-interdite';
export type ResultatNormalisation = { ok: true; origine: string } | { ok: false; raison: RaisonRefusUrl };

export type RaisonEchec =
  | RaisonRefusUrl
  | 'jeton-absent'
  | 'jeton-expire'
  | 'fichier-absent'
  | 'mauvais-contenu'
  | 'redirection-refusee'
  | 'hote-non-public'
  | 'erreur-reseau';

export interface Preuve {
  readonly origine: string;
  readonly prouveeLe: number;
  readonly valideJusqua: number;
}

/** Ce que le store garde en attendant le dépôt du fichier. */
export interface EntreeJeton {
  readonly jeton: string;
  readonly expireLe: number;
}

/** Store injectable : fichier JSON en production (étape 4), en mémoire au témoin. */
export interface StockVerification {
  lireJeton(origine: string): EntreeJeton | undefined;
  ecrireJeton(origine: string, entree: EntreeJeton): void;
  lirePreuve(origine: string): Preuve | undefined;
  ecrirePreuve(origine: string, preuve: Preuve): void;
}

/** Une adresse résolue. */
export interface AdresseResolue {
  readonly address: string;
  readonly family: number;
}
/** Résolveur DNS injectable (défaut : `dns.lookup` all). */
export type ResoudreDns = (hostname: string) => Promise<AdresseResolue[]>;

export type ResultatGet =
  | { type: 'ok'; corps: string }
  | { type: 'absent'; statut: number }
  | { type: 'redirection'; statut: number }
  | { type: 'hote-non-public' }
  | { type: 'erreur' };

/** La fonction qui va chercher le fichier (injectée → le témoin passe le vrai `recupererDirect` sur un serveur local). */
export type Recuperer = (origine: string, chemin: string) => Promise<ResultatGet>;

// ───────────────────── 4a : normalisation ─────────────────────

/**
 * URL brute → origine canonique `schéma://hôte[:port]`, ou refus.
 * Parseur WHATWG (robuste aux pièges d'encodage/IDN). Refuse : schéma hors
 * http(s), identifiants intégrés (`user:pass@` — vecteur de confusion), hôte
 * en IP littérale (un outil public attend un nom de domaine, et ça ferme une
 * part du SSRF d'entrée). L'origine est EXACTE : pas de fusion www/apex, pas
 * de domaine enregistrable — prouver A n'autorise que A.
 */
export function normaliserOrigine(urlBrute: string): ResultatNormalisation {
  const brut = urlBrute.trim();
  if (brut === '') {
    return { ok: false, raison: 'url-invalide' };
  }
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    try {
      u = new URL(`https://${brut}`);
    } catch {
      return { ok: false, raison: 'url-invalide' };
    }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, raison: 'schema-non-supporte' };
  }
  if (u.username !== '' || u.password !== '') {
    return { ok: false, raison: 'userinfo-interdit' };
  }
  let hote = u.hostname.toLowerCase();
  if (hote.endsWith('.')) {
    hote = hote.slice(0, -1);
  }
  if (hote === '') {
    return { ok: false, raison: 'url-invalide' };
  }
  // IPv6 est entre crochets dans un hostname d'URL ; on teste la forme nue.
  const hoteNu = hote.startsWith('[') && hote.endsWith(']') ? hote.slice(1, -1) : hote;
  if (isIP(hoteNu) !== 0) {
    return { ok: false, raison: 'ip-litterale-interdite' };
  }
  const port = u.port === '' ? '' : `:${u.port}`;
  return { ok: true, origine: `${u.protocol}//${hote}${port}` };
}

// ───────────────────── 4d : IP publique ─────────────────────

/**
 * L'IP est-elle PUBLIQUE ? Faux pour loopback, privées, link-local (dont
 * 169.254.169.254, métadonnées cloud), CGNAT, multicast/réservé, ULA IPv6.
 * Faits RFC universels, pas des réglages.
 */
export function estIpPublique(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a = 0, b = 0] = ip.split('.').map((n) => Number.parseInt(n, 10));
    if (a === 0 || a === 10 || a === 127) return false; // « ce réseau », privé, loopback
    if (a === 172 && b >= 16 && b <= 31) return false; // privé
    if (a === 192 && b === 168) return false; // privé
    if (a === 169 && b === 254) return false; // link-local (inclut 169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
    if (a >= 224) return false; // multicast + réservé
    return true;
  }
  if (version === 6) {
    const bas = ip.toLowerCase();
    if (bas === '::1' || bas === '::') return false; // loopback / non spécifié
    if (bas.startsWith('fe80')) return false; // link-local
    if (bas.startsWith('fc') || bas.startsWith('fd')) return false; // ULA fc00::/7
    if (bas.startsWith('ff')) return false; // multicast
    if (bas.startsWith('::ffff:')) {
      const v4 = bas.slice('::ffff:'.length);
      return isIP(v4) === 4 ? estIpPublique(v4) : false; // IPv4-mapped
    }
    return true;
  }
  return false;
}

/** Erreur marquée « hôte non public » pour que le GET la classe sans ambiguïté. */
class ErreurHoteNonPublic extends Error {
  readonly codeZurvela = 'HOTE_NON_PUBLIC';
}

/**
 * 4d — le `lookup` qui VALIDE puis ÉPINGLE. Résolution UNIQUE : la même qui
 * valide est celle qui sert à connecter (pas de re-résolution → anti-rebinding,
 * mesuré : `node:net` appelle le lookup avec `options.all` et connecte à l'IP
 * renvoyée). Si une seule adresse n'est pas publique → on refuse AVANT toute
 * connexion.
 */
export function lookupPublicSeulement(resoudre: ResoudreDns): LookupFunction {
  const lookup = (
    hostname: string,
    options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address?: string | AdresseResolue[], family?: number) => void,
  ): void => {
    resoudre(hostname)
      .then((adresses) => {
        if (adresses.length === 0) {
          callback(new ErreurHoteNonPublic(`hôte non résolu : ${hostname}`));
          return;
        }
        for (const a of adresses) {
          if (!estIpPublique(a.address)) {
            callback(new ErreurHoteNonPublic(`adresse non publique pour ${hostname}`));
            return;
          }
        }
        const premiere = adresses[0];
        if (premiere === undefined) {
          callback(new ErreurHoteNonPublic(`hôte non résolu : ${hostname}`));
          return;
        }
        const tout = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
        if (tout) {
          callback(null, adresses);
        } else {
          callback(null, premiere.address, premiere.family);
        }
      })
      .catch((e) => callback(e as NodeJS.ErrnoException));
  };
  return lookup as unknown as LookupFunction;
}

/** Résolveur par défaut : `dns.lookup` all (importé paresseusement pour rester injectable/testable). */
export function resolveurSysteme(): ResoudreDns {
  return async (hostname) => {
    const dns = await import('node:dns');
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err, adresses) => {
        if (err) reject(err);
        else resolve(adresses.map((a) => ({ address: a.address, family: a.family })));
      });
    });
  };
}

// ───────────────── 4b + 4d + signalement : le GET gardé ─────────────────

export interface OptionsGet {
  readonly userAgent: string;
  readonly enTete: { readonly nom: string; readonly valeur: string };
  readonly delaiMs: number;
  readonly maxOctets: number;
  readonly lookup: LookupFunction;
}

/**
 * GET DIRECT, gardé. 4b : ne suit AUCUNE redirection (tout 3xx = échec, on lit
 * le statut nous-mêmes). 4d : connexion via le `lookup` validant+épinglant. Le
 * robot se signale (UA + en-tête, constitution §3). Corps plafonné.
 */
export function recupererDirect(origine: string, chemin: string, opts: OptionsGet): Promise<ResultatGet> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(origine + chemin);
    } catch {
      resolve({ type: 'erreur' });
      return;
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port === '' ? undefined : Number.parseInt(u.port, 10),
        path: u.pathname,
        method: 'GET',
        lookup: opts.lookup,
        servername: u.protocol === 'https:' ? u.hostname : undefined,
        headers: { 'user-agent': opts.userAgent, [opts.enTete.nom]: opts.enTete.valeur },
        timeout: opts.delaiMs,
      },
      (res) => {
        const statut = res.statusCode ?? 0;
        if (statut >= 300 && statut < 400) {
          res.destroy();
          resolve({ type: 'redirection', statut });
          return;
        }
        if (statut !== 200) {
          res.destroy();
          resolve({ type: 'absent', statut });
          return;
        }
        let corps = '';
        res.setEncoding('utf8');
        res.on('data', (d: string) => {
          corps += d;
          if (corps.length > opts.maxOctets) {
            req.destroy();
            resolve({ type: 'ok', corps: corps.slice(0, opts.maxOctets) });
          }
        });
        res.on('end', () => resolve({ type: 'ok', corps }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ type: 'erreur' });
    });
    req.on('error', (e: NodeJS.ErrnoException & { codeZurvela?: string }) => {
      resolve(e.codeZurvela === 'HOTE_NON_PUBLIC' ? { type: 'hote-non-public' } : { type: 'erreur' });
    });
    req.end();
  });
}

// ───────────────── Le chemin du fichier (universel) ─────────────────

export function cheminVerification(prefixeFichier: string, jeton: string): string {
  return `/${prefixeFichier}${jeton}.txt`;
}

// ───────────────── 1. Génération du jeton ─────────────────

export interface OptionsDemarrage {
  readonly stock: StockVerification;
  readonly maintenant: number;
  readonly octetsJeton: number;
  readonly expirationJetonMs: number;
  readonly prefixeFichier: string;
}

export type ResultatDemarrage =
  | { ok: true; origine: string; jeton: string; chemin: string; expireLe: number }
  | { ok: false; raison: RaisonRefusUrl };

export function demarrerVerification(urlBrute: string, opts: OptionsDemarrage): ResultatDemarrage {
  const norm = normaliserOrigine(urlBrute);
  if (!norm.ok) {
    return { ok: false, raison: norm.raison };
  }
  const jeton = randomBytes(opts.octetsJeton).toString('base64url');
  const expireLe = opts.maintenant + opts.expirationJetonMs;
  opts.stock.ecrireJeton(norm.origine, { jeton, expireLe });
  return { ok: true, origine: norm.origine, jeton, chemin: cheminVerification(opts.prefixeFichier, jeton), expireLe };
}

// ───────────────── 3. Achèvement (GET + comparaison) ─────────────────

export interface OptionsAchevement {
  readonly stock: StockVerification;
  readonly maintenant: number;
  readonly recuperer: Recuperer;
  readonly fenetreValiditeMs: number;
  readonly prefixeFichier: string;
}

export type ResultatVerification = { ok: true; preuve: Preuve } | { ok: false; raison: RaisonEchec };

export async function acheverVerification(urlBrute: string, opts: OptionsAchevement): Promise<ResultatVerification> {
  const norm = normaliserOrigine(urlBrute);
  if (!norm.ok) {
    return { ok: false, raison: norm.raison };
  }
  const entree = opts.stock.lireJeton(norm.origine);
  if (entree === undefined) {
    return { ok: false, raison: 'jeton-absent' };
  }
  if (opts.maintenant > entree.expireLe) {
    return { ok: false, raison: 'jeton-expire' };
  }
  const res = await opts.recuperer(norm.origine, cheminVerification(opts.prefixeFichier, entree.jeton));
  switch (res.type) {
    case 'redirection':
      return { ok: false, raison: 'redirection-refusee' };
    case 'hote-non-public':
      return { ok: false, raison: 'hote-non-public' };
    case 'absent':
      return { ok: false, raison: 'fichier-absent' };
    case 'erreur':
      return { ok: false, raison: 'erreur-reseau' };
    case 'ok': {
      if (res.corps.trim() !== entree.jeton) {
        return { ok: false, raison: 'mauvais-contenu' };
      }
      const preuve: Preuve = { origine: norm.origine, prouveeLe: opts.maintenant, valideJusqua: opts.maintenant + opts.fenetreValiditeMs };
      opts.stock.ecrirePreuve(norm.origine, preuve);
      return { ok: true, preuve };
    }
  }
}

// ───────────────── GARDE CARDINALE : peutScanner ─────────────────

export type ResultatAutorisation = { ok: true; origine: string } | { ok: false; raison: 'url-refusee' | 'non-prouve' | 'preuve-expiree' };

/**
 * LE VERROU. Aucun scan ne part sans que cette fonction renvoie `ok`. Elle ne
 * lit QUE l'état serveur des preuves (jamais une donnée du client), exige une
 * preuve pour l'origine EXACTE (4c : pas de sous-domaine, pas de suffixe) et
 * non expirée. Non contournable par le contenu d'une requête (même patron que
 * le filtre d'actions destructives, §3 : après décision, en code).
 */
export function peutScanner(urlBrute: string, opts: { stock: StockVerification; maintenant: number }): ResultatAutorisation {
  const norm = normaliserOrigine(urlBrute);
  if (!norm.ok) {
    return { ok: false, raison: 'url-refusee' };
  }
  const preuve = opts.stock.lirePreuve(norm.origine);
  if (preuve === undefined) {
    return { ok: false, raison: 'non-prouve' };
  }
  if (opts.maintenant >= preuve.valideJusqua) {
    return { ok: false, raison: 'preuve-expiree' };
  }
  return { ok: true, origine: norm.origine };
}
