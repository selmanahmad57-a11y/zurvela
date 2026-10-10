/**
 * TÉMOIN du serveur de scan public (étape 4, parties 2-3-4). VRAI CHEMIN : vrai
 * serveur HTTP, client brut, vraies routes. Dépendances doublées (stocks
 * mémoire, `recuperer`/`executer` injectés) → gratuit, déterministe, zéro scan.
 * Gardes prouvées par mutation : peutScanner-avant-enfiler, file 1-à-la-fois,
 * IDOR (scanId imprévisible).
 */
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  creerOrdonnanceur,
  creerServeurScan,
  demarrerScan,
  type EntreeScan,
  type ExecuterScan,
  type ServeurScan,
  type StockScans,
} from './serveur-scan.js';
import type { EntreeJeton, Preuve, Recuperer, StockVerification } from './verification-propriete.js';
import { enregistrerDepense, type ConfigQuota, type StockQuota } from './quota.js';

// ───────── stocks mémoire ─────────
function stockVerif(): StockVerification {
  const j = new Map<string, EntreeJeton>();
  const p = new Map<string, Preuve>();
  return { lireJeton: (o) => j.get(o), ecrireJeton: (o, e) => void j.set(o, e), lirePreuve: (o) => p.get(o), ecrirePreuve: (o, v) => void p.set(o, v) };
}
function stockScans(): StockScans & { tout: () => EntreeScan[] } {
  const m = new Map<string, EntreeScan>();
  return {
    lire: (id) => m.get(id),
    ecrire: (id, e) => void m.set(id, e),
    prochainEnAttente: () =>
      [...m.values()].filter((e) => e.etat === 'en-attente').sort((a, b) => a.creeLe - b.creeLe)[0],
    tout: () => [...m.values()],
  };
}

const CONFIG = { octetsJeton: 32, expirationJetonMs: 86_400_000, fenetreValiditeMs: 3_600_000, prefixeFichier: 'zurvela-verification-', octetsScanId: 32, tailleCorpsMax: 8192 };
const CONFIG_QUOTA: ConfigQuota = { global: 50, parOrigine: 3, depenseMaxUsd: 5 };
function stockQuotaMemoire(initial: Record<string, number> = {}): StockQuota {
  const m = new Map<string, number>(Object.entries(initial));
  return { lire: (c) => m.get(c), ecrire: (c, n) => void m.set(c, n) };
}

const serveurs: ServeurScan[] = [];
afterEach(async () => {
  while (serveurs.length > 0) await serveurs.pop()!.fermer();
});

function requete(port: number, methode: string, chemin: string, corps?: unknown): Promise<{ statut: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = corps === undefined ? undefined : JSON.stringify(corps);
    const req = http.request({ host: '127.0.0.1', port, method: methode, path: chemin, headers: data === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let c = '';
      res.on('data', (d) => (c += d));
      res.on('end', () => resolve({ statut: res.statusCode ?? 0, json: c === '' ? {} : (JSON.parse(c) as Record<string, unknown>) }));
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

// recuperer qui « sert » le bon jeton (lu dans le stock) = site qui a déposé le fichier.
const recupererBon = (sv: StockVerification): Recuperer => async (origine) => {
  const e = sv.lireJeton(origine);
  return e === undefined ? { type: 'absent', statut: 404 } : { type: 'ok', corps: e.jeton };
};
// recuperer qui ne sert RIEN (fichier absent).
const recupererAbsent: Recuperer = async () => ({ type: 'absent', statut: 404 });

async function monterServeur(over: Partial<Parameters<typeof creerServeurScan>[0]> = {}): Promise<{ s: ServeurScan; sv: StockVerification; ss: ReturnType<typeof stockScans>; sq: StockQuota; ordonnanceur: ReturnType<typeof creerOrdonnanceur>; executer: ExecuterScan }> {
  const sv = over.stockVerif ?? stockVerif();
  const ss = (over.stockScans as ReturnType<typeof stockScans>) ?? stockScans();
  const sq = over.stockQuota ?? stockQuotaMemoire();
  const executer: ExecuterScan = (over as { executer?: ExecuterScan }).executer ?? (async () => ({ ok: true, rapportHtml: '<html>RAPPORT</html>', cout: 0 }));
  const ordonnanceur = over.ordonnanceur ?? creerOrdonnanceur({ stockScans: ss, executer, maintenant: () => 1000, surCout: (cout) => enregistrerDepense({ stock: sq, maintenant: 1000, cout }) });
  const s = await creerServeurScan({
    stockVerif: sv,
    stockScans: ss,
    stockQuota: sq,
    configQuota: over.configQuota ?? CONFIG_QUOTA,
    ordonnanceur,
    recuperer: over.recuperer ?? recupererBon(sv),
    maintenant: over.maintenant ?? (() => 1000),
    config: CONFIG,
    ...(over.genId === undefined ? {} : { genId: over.genId }),
  });
  serveurs.push(s);
  return { s, sv, ss, sq, ordonnanceur, executer };
}

// ═══════════════ (2) peutScanner AVANT d'enfiler ═══════════════
describe('(2) peutScanner avant d’enfiler', () => {
  it('origine NON prouvée → pas d’enfilement', () => {
    const ss = stockScans();
    const r = demarrerScan('https://pasprouve.test', { stockPreuves: stockVerif(), stockScans: ss, maintenant: 1000, octetsScanId: 32 });
    expect(r).toEqual({ ok: false, raison: 'non-prouve' });
    expect(ss.tout()).toEqual([]); // rien enfilé
  });
  it('origine prouvée → enfilée, scanId imprévisible', () => {
    const sv = stockVerif();
    sv.ecrirePreuve('https://ok.test', { origine: 'https://ok.test', prouveeLe: 500, valideJusqua: 5000 });
    const ss = stockScans();
    const r = demarrerScan('https://ok.test', { stockPreuves: sv, stockScans: ss, maintenant: 1000, octetsScanId: 32 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scanId.length).toBeGreaterThanOrEqual(40); // 32 octets base64url
    expect(ss.lire(r.scanId)?.etat).toBe('en-attente');
  });
});

// ═══════════════ (3) file : 1 scan à la fois ═══════════════
describe('(3) ordonnanceur séquentiel', () => {
  it('traite les scans un par un (jamais en parallèle) et marque « termine »', async () => {
    const ss = stockScans();
    let enCours = 0;
    let maxSimultane = 0;
    const executer: ExecuterScan = async () => {
      enCours += 1;
      maxSimultane = Math.max(maxSimultane, enCours);
      await new Promise((r) => setTimeout(r, 10));
      enCours -= 1;
      return { ok: true, rapportHtml: '<html>ok</html>', cout: 0 };
    };
    const ord = creerOrdonnanceur({ stockScans: ss, executer, maintenant: () => 1 });
    ss.ecrire('a', { scanId: 'a', origine: 'https://a.test', etat: 'en-attente', creeLe: 1 });
    ss.ecrire('b', { scanId: 'b', origine: 'https://b.test', etat: 'en-attente', creeLe: 2 });
    ord.declencher();
    await ord.oisif();
    expect(maxSimultane).toBe(1); // JAMAIS deux à la fois
    expect(ss.lire('a')?.etat).toBe('termine');
    expect(ss.lire('b')?.etat).toBe('termine');
  });
  it('un executer qui échoue → « echoue », l’erreur conservée', async () => {
    const ss = stockScans();
    const ord = creerOrdonnanceur({ stockScans: ss, executer: async () => ({ ok: false, erreur: 'scan-cassé', cout: 0 }), maintenant: () => 1 });
    ss.ecrire('x', { scanId: 'x', origine: 'https://x.test', etat: 'en-attente', creeLe: 1 });
    ord.declencher();
    await ord.oisif();
    expect(ss.lire('x')?.etat).toBe('echoue');
    expect(ss.lire('x')?.erreur).toBe('scan-cassé');
  });
});

// ═══════════════ (4) routes + IDOR ═══════════════
describe('(4) routes', () => {
  it('GET /sante → 200', async () => {
    const { s } = await monterServeur();
    expect((await requete(s.port, 'GET', '/sante')).statut).toBe(200);
  });
  it('POST /verifier → jeton + chemin ; sans url → 400', async () => {
    const { s } = await monterServeur();
    const r = await requete(s.port, 'POST', '/verifier', { url: 'boulangerie.fr' });
    expect(r.statut).toBe(200);
    expect(typeof r.json['jeton']).toBe('string');
    expect(String(r.json['chemin'])).toContain('zurvela-verification-');
    expect((await requete(s.port, 'POST', '/verifier', {})).statut).toBe(400);
  });
  it('flux complet : /verifier → (fichier servi) /scanner → 202 scanId → /statut rend l’avancement', async () => {
    const { s, ss, ordonnanceur } = await monterServeur();
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(scan.statut).toBe(202);
    const id = String(scan.json['scanId']);
    expect(id.length).toBeGreaterThanOrEqual(40);
    await ordonnanceur.oisif();
    const st = await requete(s.port, 'GET', `/statut/${encodeURIComponent(id)}`);
    expect(st.statut).toBe(200);
    expect(st.json['etat']).toBe('termine');
    expect(String(st.json['rapportHtml'])).toContain('RAPPORT');
    void ss;
  });
  it('/scanner sans fichier déposé → 403 (pas de scan)', async () => {
    const { s } = await monterServeur({ recuperer: recupererAbsent });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(scan.statut).toBe(403);
  });

  // IDOR : l'id imprévisible EST la capacité. L'énumération classique ne donne rien.
  it('IDOR : un id deviné/voisin ne rend AUCUN rapport ; seul l’id exact', async () => {
    const { s } = await monterServeur();
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    const id = String(scan.json['scanId']);
    for (const devine of ['1', '2', '3', '0', id.slice(0, -1), `${id}a`]) {
      expect((await requete(s.port, 'GET', `/statut/${encodeURIComponent(devine)}`)).statut, `id deviné ${devine}`).toBe(404);
    }
    expect((await requete(s.port, 'GET', `/statut/${encodeURIComponent(id)}`)).statut).toBe(200);
  });
});

// ═══════════════ (5) QUOTA DUR ═══════════════
const JOUR = '1970-01-01'; // jourUtc(1000)
describe('(5) quota — plafonds durs à /scanner', () => {
  it('quota GLOBAL atteint → 429 MÊME avec preuve valide', async () => {
    const { s } = await monterServeur({ stockQuota: stockQuotaMemoire({ [`${JOUR}|global`]: 50 }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const r = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(r.statut).toBe(429);
    expect(r.json['portee']).toBe('global');
  });

  it('quota PAR ORIGINE atteint → 429 pour cette origine, une AUTRE passe', async () => {
    const { s } = await monterServeur({ stockQuota: stockQuotaMemoire({ [`${JOUR}|origine:https://a.test`]: 3 }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://a.test' });
    expect((await requete(s.port, 'POST', '/scanner', { url: 'https://a.test' })).statut).toBe(429);
    await requete(s.port, 'POST', '/verifier', { url: 'https://b.test' });
    expect((await requete(s.port, 'POST', '/scanner', { url: 'https://b.test' })).statut).toBe(202);
  });

  it('quota DÉPENSE : un scan lourd (6 $ > 5) pousse le cumul → le scan SUIVANT est refusé 429', async () => {
    const { s, ordonnanceur } = await monterServeur({ executer: async () => ({ ok: true, rapportHtml: '<html>x</html>', cout: 6 }) } as Parameters<typeof monterServeur>[0]);
    await requete(s.port, 'POST', '/verifier', { url: 'https://a.test' });
    expect((await requete(s.port, 'POST', '/scanner', { url: 'https://a.test' })).statut).toBe(202); // 1er passe
    await ordonnanceur.oisif(); // le scan se termine → 6 $ enregistrés
    await requete(s.port, 'POST', '/verifier', { url: 'https://b.test' });
    const r = await requete(s.port, 'POST', '/scanner', { url: 'https://b.test' }); // 2e refusé par la dépense
    expect(r.statut).toBe(429);
    expect(r.json['portee']).toBe('depense');
  });

  it('429 porte un en-tête Retry-After', async () => {
    const { s } = await monterServeur({ stockQuota: stockQuotaMemoire({ [`${JOUR}|global`]: 50 }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const retry = await new Promise<string | undefined>((resolve) => {
      const body = JSON.stringify({ url: 'https://ok.test' });
      const req = http.request({ host: '127.0.0.1', port: s.port, method: 'POST', path: '/scanner', headers: { 'content-type': 'application/json' } }, (res) => {
        res.resume();
        resolve(res.headers['retry-after']);
      });
      req.end(body);
    });
    expect(Number(retry)).toBeGreaterThan(0);
  });

  it('COURSE : deux /scanner CONCURRENTS à la dernière place → une seule passe (202), l’autre 429', async () => {
    // global à 49 (cap 50) : une seule place. Les deux requêtes vérifient OK puis se disputent la place.
    const { s } = await monterServeur({ stockQuota: stockQuotaMemoire({ [`${JOUR}|global`]: 49 }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const [a, b] = await Promise.all([
      requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' }),
      requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' }),
    ]);
    const statuts = [a.statut, b.statut].sort();
    expect(statuts).toEqual([202, 429]); // exactement une passe, une refusée
  });
});
