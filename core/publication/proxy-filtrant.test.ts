/**
 * TÉMOIN du proxy filtrant d'egress (publication, étape 4, garde cardinale).
 * VRAI CHEMIN : vrai proxy, vrais serveurs locaux (loopback = « service
 * interne » qui ne doit JAMAIS être touché — loopback EST une plage privée),
 * vraies sockets, le vrai `estIpPublique`/`lookupPublicSeulement` de l'étape 3.
 * Le seul point injecté est le résolveur DNS (hostname→IP), comme à l'étape 3.
 *
 * La confirmation bout-en-bout avec Chromium réel (sous-ressource vers une IP
 * privée refusée par le proxy) est faite par script et RAPPORTÉE (la mesure l'a
 * établie) — ici on prouve la LOGIQUE du proxy, de façon déterministe, avec ses
 * mutations de sécurité.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { creerProxyFiltrant, type ProxyFiltrant } from './proxy-filtrant.js';
import type { AdresseResolue } from './verification-propriete.js';

// ── un vrai serveur loopback = le « service interne » (ne doit pas être touché) ──
interface ServeurTest {
  port: number;
  hits: () => number;
  close: () => Promise<void>;
}
function serveurInterne(): Promise<ServeurTest> {
  let hits = 0;
  const srv = http.createServer((_req, res) => {
    hits += 1;
    res.writeHead(200);
    res.end('SECRET-INTERNE');
  });
  return new Promise((r) =>
    srv.listen(0, '127.0.0.1', () =>
      r({ port: (srv.address() as AddressInfo).port, hits: () => hits, close: () => new Promise((x) => srv.close(() => x())) }),
    ),
  );
}

const aFermer: Array<{ fermer?: () => Promise<void>; close?: () => Promise<void> }> = [];
afterEach(async () => {
  while (aFermer.length > 0) {
    const o = aFermer.pop()!;
    await (o.fermer ?? o.close)!();
  }
});
async function proxy(resoudre: (h: string) => AdresseResolue[]): Promise<ProxyFiltrant> {
  const p = await creerProxyFiltrant({ resoudre: async (h) => resoudre(h), delaiMs: 3000 });
  aFermer.push(p);
  return p;
}
async function interne(): Promise<ServeurTest> {
  const s = await serveurInterne();
  aFermer.push(s);
  return s;
}

// client HTTP brut À TRAVERS le proxy (requête en forme absolue).
function getParProxy(proxyPort: number, url: string): Promise<{ statut: number; corps: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { host: '127.0.0.1', port: proxyPort, method: 'GET', path: url, headers: { host: u.host } },
      (res) => {
        let c = '';
        res.on('data', (d) => (c += d));
        res.on('end', () => resolve({ statut: res.statusCode ?? 0, corps: c }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// client CONNECT brut : renvoie la 1re ligne de réponse du proxy (sans ouvrir de vrai tunnel TLS).
function connectParProxy(proxyPort: number, cible: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => {
      s.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n\r\n`);
    });
    let data = '';
    s.on('data', (d) => {
      data += d.toString();
      if (data.includes('\r\n')) {
        resolve(data.split('\r\n')[0] ?? '');
        s.destroy();
      }
    });
    s.on('error', reject);
    s.setTimeout(4000, () => {
      resolve(`TIMEOUT:${data.split('\r\n')[0] ?? ''}`);
      s.destroy();
    });
  });
}

describe('proxy filtrant — 4d SSRF : refuse le privé, 0 egress (HTTP)', () => {
  it('une requête HTTP vers un hôte résolvant en PRIVÉ (loopback) est refusée, le service interne n’est JAMAIS touché', async () => {
    const srv = await interne();
    // interne.test « résout » vers l'IP du service interne (loopback = privé)
    const px = await proxy((h) => (h === 'interne.test' ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '8.8.8.8', family: 4 }]));
    const r = await getParProxy(px.port, `http://interne.test:${srv.port}/secret`);
    expect(r.statut).toBe(403);
    expect(r.corps).not.toContain('SECRET-INTERNE');
    expect(srv.hits()).toBe(0); // 0 egress : jamais connecté
    expect(px.refus()).toBe(1);
  });

  it('metadata cloud (169.254.169.254) est refusé', async () => {
    const px = await proxy(() => [{ address: '169.254.169.254', family: 4 }]);
    const r = await getParProxy(px.port, 'http://rebind.test/latest/meta-data/');
    expect(r.statut).toBe(403);
    expect(px.refus()).toBe(1);
  });
});

describe('proxy filtrant — 4d SSRF : refuse le privé AVANT le tunnel (CONNECT/HTTPS)', () => {
  it('un CONNECT vers un hôte résolvant en PRIVÉ est refusé AVANT ouverture, le service interne n’est JAMAIS touché', async () => {
    const srv = await interne();
    const px = await proxy(() => [{ address: '127.0.0.1', family: 4 }]); // privé (loopback)
    const ligne = await connectParProxy(px.port, `interne.test:${srv.port}`);
    expect(ligne).not.toContain('200'); // JAMAIS « 200 Connection Established »
    expect(ligne).toMatch(/403|TIMEOUT/);
    expect(srv.hits()).toBe(0); // tunnel jamais ouvert → 0 egress
    expect(px.refus()).toBe(1);
  });

  it('metadata cloud en CONNECT est refusé avant tunnel', async () => {
    const px = await proxy(() => [{ address: '169.254.169.254', family: 4 }]);
    const ligne = await connectParProxy(px.port, 'rebind.test:443');
    expect(ligne).not.toContain('200');
    expect(px.refus()).toBe(1);
  });
});

describe('proxy filtrant — relaie le public', () => {
  it('une requête HTTP vers un hôte résolvant en PUBLIC est relayée (vrai example.com, réseau requis)', async () => {
    // example.com (RFC 2606) résout en public par le résolveur SYSTÈME (pas d'injection).
    const reel = await creerProxyFiltrant({ delaiMs: 8000 });
    aFermer.push(reel);
    const r = await getParProxy(reel.port, 'http://example.com/');
    expect([200, 301, 302, 303, 307, 308]).toContain(r.statut); // relayé : une vraie réponse publique
    expect(reel.relais()).toBeGreaterThanOrEqual(1);
  });
});
