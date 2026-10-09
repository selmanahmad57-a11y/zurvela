/**
 * TÉMOIN de la vérification de propriété (publication, étape 3) — LE VERROU.
 * VRAI CHEMIN : de vrais serveurs HTTP locaux, de vraies sockets, le vrai
 * `recupererDirect` et le vrai `lookupPublicSeulement`. Aucun statut injecté.
 *
 * Chaque garde de sécurité a son sens ET sa mutation (prouvées rouges à la main
 * dans le cahier) :
 *  4a confusion/normalisation · 4b aucune redirection · 4c origine exacte
 *  4d SSRF : hôte non public refusé avant connexion, IP épinglée.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LookupFunction } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acheverVerification,
  demarrerVerification,
  estIpPublique,
  lookupPublicSeulement,
  normaliserOrigine,
  peutScanner,
  recupererDirect,
  type AdresseResolue,
  type EntreeJeton,
  type Preuve,
  type Recuperer,
  type StockVerification,
} from './verification-propriete.js';

// ───────── Outillage : un store en mémoire ─────────
function stockMemoire(): StockVerification {
  const jetons = new Map<string, EntreeJeton>();
  const preuves = new Map<string, Preuve>();
  return {
    lireJeton: (o) => jetons.get(o),
    ecrireJeton: (o, e) => void jetons.set(o, e),
    lirePreuve: (o) => preuves.get(o),
    ecrirePreuve: (o, p) => void preuves.set(o, p),
  };
}

// ───────── Outillage : un vrai serveur local ─────────
interface ServeurTest {
  readonly port: number;
  hits: number;
  close(): Promise<void>;
}
function serveurLocal(gestion: (url: string, res: http.ServerResponse) => void): Promise<ServeurTest> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      etat.hits += 1;
      gestion(req.url ?? '/', res);
    });
    const etat: ServeurTest = {
      port: 0,
      hits: 0,
      close: () => new Promise((r) => srv.close(() => r())),
    };
    srv.listen(0, '127.0.0.1', () => {
      (etat as { port: number }).port = (srv.address() as AddressInfo).port;
      resolve(etat);
    });
  });
}

// Lookup PERMISSIF (teste la mécanique du GET contre le loopback, hors garde SSRF).
const lookupPermissif: LookupFunction = ((hostname: string, options: unknown, cb: (e: null, a: unknown, f?: number) => void) => {
  if (typeof options === 'object' && options !== null && (options as { all?: boolean }).all) {
    cb(null, [{ address: '127.0.0.1', family: 4 }]);
  } else {
    cb(null, '127.0.0.1', 4);
  }
}) as unknown as LookupFunction;

const OPTS_GET = { userAgent: 'ZurvelaBot/0.1 (+https://zurvela.com)', enTete: { nom: 'X-Zurvela-Scan', valeur: '1' }, delaiMs: 2000, maxOctets: 4096 };
const PREFIXE = 'zurvela-verification-';

const serveurs: ServeurTest[] = [];
afterEach(async () => {
  while (serveurs.length > 0) {
    await serveurs.pop()!.close();
  }
});
async function lancer(gestion: (url: string, res: http.ServerResponse) => void): Promise<ServeurTest> {
  const s = await serveurLocal(gestion);
  serveurs.push(s);
  return s;
}

// ═══════════════════════ 4a : NORMALISATION ═══════════════════════
describe('4a — normalisation & confusion de domaine', () => {
  it('ajoute https par défaut, met en minuscules, retire le point final, jette le chemin', () => {
    expect(normaliserOrigine('boulangerie.fr')).toEqual({ ok: true, origine: 'https://boulangerie.fr' });
    expect(normaliserOrigine('Boulangerie.FR.')).toEqual({ ok: true, origine: 'https://boulangerie.fr' });
    expect(normaliserOrigine('http://x.fr/page?q=1#a')).toEqual({ ok: true, origine: 'http://x.fr' });
    expect(normaliserOrigine('https://x.fr:8443/')).toEqual({ ok: true, origine: 'https://x.fr:8443' });
  });
  it('REFUSE l’userinfo (vecteur de confusion user@host)', () => {
    expect(normaliserOrigine('https://victime.fr@attaquant.fr/')).toEqual({ ok: false, raison: 'userinfo-interdit' });
  });
  it('REFUSE les IP littérales (v4, v6)', () => {
    expect(normaliserOrigine('http://127.0.0.1')).toEqual({ ok: false, raison: 'ip-litterale-interdite' });
    expect(normaliserOrigine('https://1.2.3.4/x')).toEqual({ ok: false, raison: 'ip-litterale-interdite' });
    expect(normaliserOrigine('http://[::1]')).toEqual({ ok: false, raison: 'ip-litterale-interdite' });
  });
  it('REFUSE les schémas hors http(s)', () => {
    expect(normaliserOrigine('javascript:alert(1)').ok).toBe(false);
    expect(normaliserOrigine('ftp://x.fr')).toEqual({ ok: false, raison: 'schema-non-supporte' });
  });
});

// ═══════════════════════ 4d : IP PUBLIQUE (faits RFC) ═══════════════════════
describe('4d — estIpPublique : les plages dangereuses sont privées', () => {
  it('privé/réservé/loopback/link-local/CGNAT/multicast/ULA → NON public', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254', '100.64.0.1', '224.0.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:10.0.0.1']) {
      expect(estIpPublique(ip), ip).toBe(false);
    }
  });
  it('public → public (les bords de plages aussi)', () => {
    for (const ip of ['1.2.3.4', '8.8.8.8', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(estIpPublique(ip), ip).toBe(true);
    }
  });
});

// ═══════════════════════ 4d : LOOKUP validant+épinglant ═══════════════════════
describe('4d — lookupPublicSeulement : refuse le non-public AVANT de connecter', () => {
  const resolveurFixe = (adresses: AdresseResolue[]) => async () => adresses;

  it('une adresse privée → le lookup rappelle une ERREUR (pas d’adresse)', async () => {
    const lookup = lookupPublicSeulement(resolveurFixe([{ address: '10.0.0.1', family: 4 }]));
    const r = await new Promise<{ err: Error | null; adr: unknown }>((resolve) => {
      (lookup as unknown as (h: string, o: unknown, cb: (e: Error | null, a: unknown) => void) => void)('interne.corp', { all: true }, (err, adr) => resolve({ err, adr }));
    });
    expect(r.err).toBeInstanceOf(Error);
    expect(r.adr).toBeUndefined();
  });
  it('une adresse publique → le lookup rappelle l’adresse (forme all)', async () => {
    const lookup = lookupPublicSeulement(resolveurFixe([{ address: '1.2.3.4', family: 4 }]));
    const r = await new Promise<{ err: Error | null; adr: unknown }>((resolve) => {
      (lookup as unknown as (h: string, o: unknown, cb: (e: Error | null, a: unknown) => void) => void)('exemple.fr', { all: true }, (err, adr) => resolve({ err, adr }));
    });
    expect(r.err).toBeNull();
    expect(r.adr).toEqual([{ address: '1.2.3.4', family: 4 }]);
  });
});

// ═══════════════════════ 4d : SSRF bloqué, VRAI CHEMIN ═══════════════════════
describe('4d — SSRF : un hôte qui résout en privé ne déclenche AUCUNE connexion', () => {
  it('le serveur local (127.0.0.1) n’est JAMAIS touché, résultat = hote-non-public', async () => {
    const srv = await lancer((_u, res) => {
      res.writeHead(200);
      res.end('NE DEVRAIT PAS ÊTRE SERVI');
    });
    // le résolveur renvoie une IP PRIVÉE : la garde doit refuser avant toute socket.
    const lookup = lookupPublicSeulement(async () => [{ address: '10.0.0.1', family: 4 }]);
    const res = await recupererDirect(`http://interne.corp:${srv.port}`, '/x.txt', { ...OPTS_GET, lookup });
    expect(res).toEqual({ type: 'hote-non-public' });
    expect(srv.hits).toBe(0);
  });
});

// ═══════════════════════ 4b : LE GET ne suit AUCUNE redirection ═══════════════════════
describe('4b — recupererDirect : mécanique du GET (vrai serveur local)', () => {
  it('200 avec corps → ok', async () => {
    const srv = await lancer((_u, res) => {
      res.writeHead(200);
      res.end('contenu-jeton');
    });
    const res = await recupererDirect(`http://pin.test:${srv.port}`, '/f.txt', { ...OPTS_GET, lookup: lookupPermissif });
    expect(res).toEqual({ type: 'ok', corps: 'contenu-jeton' });
    expect(srv.hits).toBe(1);
  });
  it('404 → absent', async () => {
    const srv = await lancer((_u, res) => {
      res.writeHead(404);
      res.end('nope');
    });
    const res = await recupererDirect(`http://pin.test:${srv.port}`, '/f.txt', { ...OPTS_GET, lookup: lookupPermissif });
    expect(res).toEqual({ type: 'absent', statut: 404 });
  });
  it('302 (même same-origin) → redirection, JAMAIS suivie', async () => {
    const srv = await lancer((u, res) => {
      if (u === '/f.txt') {
        res.writeHead(302, { location: '/ailleurs' });
        res.end();
      } else {
        res.writeHead(200);
        res.end('ne doit pas être atteint');
      }
    });
    const res = await recupererDirect(`http://pin.test:${srv.port}`, '/f.txt', { ...OPTS_GET, lookup: lookupPermissif });
    expect(res).toEqual({ type: 'redirection', statut: 302 });
    expect(srv.hits).toBe(1); // une seule requête : pas de suivi
  });
});

// ═══════════════════════ FLUX COMPLET : démarrer → achever → peutScanner ═══════════════════════
describe('flux complet (vrai chemin) + garde cardinale', () => {
  const T0 = 1_000_000;
  const EXP_JETON = 24 * 3600 * 1000; // dépôt
  const FENETRE = 3600 * 1000; // validité de la preuve
  const recupVrai = (lookup: LookupFunction): Recuperer => (origine, chemin) => recupererDirect(origine, chemin, { ...OPTS_GET, lookup });

  it('SUCCÈS : le serveur sert le jeton courant → ok, preuve, peutScanner', async () => {
    const stock = stockMemoire();
    let jetonAttendu = '';
    let cheminAttendu = '';
    const srv = await lancer((u, res) => {
      if (u === cheminAttendu) {
        res.writeHead(200);
        res.end(`  ${jetonAttendu}  `); // espaces → le trim doit réussir
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const url = `http://pin.test:${srv.port}`;
    const dem = demarrerVerification(url, { stock, maintenant: T0, octetsJeton: 32, expirationJetonMs: EXP_JETON, prefixeFichier: PREFIXE });
    if (!dem.ok) return;
    jetonAttendu = dem.jeton;
    cheminAttendu = dem.chemin;
    const r = await acheverVerification(url, { stock, maintenant: T0 + 10, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preuve.origine).toBe(url);
    // garde cardinale : autorisé pour CETTE origine, dans la fenêtre
    expect(peutScanner(url, { stock, maintenant: T0 + 20 }).ok).toBe(true);
    // 4c confusion : une AUTRE origine n'est pas autorisée
    expect(peutScanner('http://pin.test:1', { stock, maintenant: T0 + 20 })).toEqual({ ok: false, raison: 'non-prouve' });
    // 4c sous-domaine : prouver l'hôte n'autorise pas un sous-domaine
    expect(peutScanner(`http://sous.pin.test:${srv.port}`, { stock, maintenant: T0 + 20 })).toEqual({ ok: false, raison: 'non-prouve' });
    // fenêtre : après valideJusqua → refus
    expect(peutScanner(url, { stock, maintenant: T0 + 10 + FENETRE })).toEqual({ ok: false, raison: 'preuve-expiree' });
  });

  it('fichier absent (404) → fichier-absent, pas de preuve', async () => {
    const stock = stockMemoire();
    const srv = await lancer((_u, res) => {
      res.writeHead(404);
      res.end();
    });
    const url = `http://pin.test:${srv.port}`;
    demarrerVerification(url, { stock, maintenant: T0, octetsJeton: 32, expirationJetonMs: EXP_JETON, prefixeFichier: PREFIXE });
    const r = await acheverVerification(url, { stock, maintenant: T0 + 10, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r).toEqual({ ok: false, raison: 'fichier-absent' });
    expect(peutScanner(url, { stock, maintenant: T0 + 20 }).ok).toBe(false);
  });

  it('mauvais contenu → mauvais-contenu', async () => {
    const stock = stockMemoire();
    const srv = await lancer((_u, res) => {
      res.writeHead(200);
      res.end('pas-le-bon-jeton');
    });
    const url = `http://pin.test:${srv.port}`;
    demarrerVerification(url, { stock, maintenant: T0, octetsJeton: 32, expirationJetonMs: EXP_JETON, prefixeFichier: PREFIXE });
    const r = await acheverVerification(url, { stock, maintenant: T0 + 10, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r).toEqual({ ok: false, raison: 'mauvais-contenu' });
  });

  it('redirection → redirection-refusee', async () => {
    const stock = stockMemoire();
    const srv = await lancer((_u, res) => {
      res.writeHead(301, { location: 'https://autre-site.fr/' });
      res.end();
    });
    const url = `http://pin.test:${srv.port}`;
    demarrerVerification(url, { stock, maintenant: T0, octetsJeton: 32, expirationJetonMs: EXP_JETON, prefixeFichier: PREFIXE });
    const r = await acheverVerification(url, { stock, maintenant: T0 + 10, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r).toEqual({ ok: false, raison: 'redirection-refusee' });
  });

  it('jeton expiré (fenêtre de dépôt dépassée) → jeton-expire', async () => {
    const stock = stockMemoire();
    const srv = await lancer((u, res) => {
      res.writeHead(200);
      res.end('peu importe');
    });
    const url = `http://pin.test:${srv.port}`;
    demarrerVerification(url, { stock, maintenant: T0, octetsJeton: 32, expirationJetonMs: EXP_JETON, prefixeFichier: PREFIXE });
    const r = await acheverVerification(url, { stock, maintenant: T0 + EXP_JETON + 1, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r).toEqual({ ok: false, raison: 'jeton-expire' });
    expect(srv.hits).toBe(0); // on ne va même pas chercher le fichier
  });

  it('jamais démarré → jeton-absent', async () => {
    const stock = stockMemoire();
    const r = await acheverVerification('http://jamais.test', { stock, maintenant: T0, recuperer: recupVrai(lookupPermissif), fenetreValiditeMs: FENETRE, prefixeFichier: PREFIXE });
    expect(r).toEqual({ ok: false, raison: 'jeton-absent' });
  });
});
