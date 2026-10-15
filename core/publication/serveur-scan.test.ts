/**
 * TÉMOIN du serveur de scan public (étape 4, parties 2-3-4). VRAI CHEMIN : vrai
 * serveur HTTP, client brut, vraies routes. Dépendances doublées (stocks
 * mémoire, `recuperer`/`executer` injectés) → gratuit, déterministe, zéro scan.
 * Gardes prouvées par mutation : peutScanner-avant-enfiler, file 1-à-la-fois,
 * IDOR (scanId imprévisible).
 */
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { decisionReessai, type FaitsReessai } from '../../deploiement/ui/reessai.js';

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
const CONFIG_QUOTA: ConfigQuota = { global: 50, parOrigine: 3, depenseMaxUsd: 5, parDestinataire: 3 };
function stockQuotaMemoire(initial: Record<string, number> = {}): StockQuota {
  const m = new Map<string, number>(Object.entries(initial));
  return { lire: (c) => m.get(c), ecrire: (c, n) => void m.set(c, n) };
}

const serveurs: ServeurScan[] = [];
afterEach(async () => {
  while (serveurs.length > 0) await serveurs.pop()!.fermer();
});

function requete(port: number, methode: string, chemin: string, corps?: unknown, timeoutMs?: number): Promise<{ statut: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = corps === undefined ? undefined : JSON.stringify(corps);
    const req = http.request({ host: '127.0.0.1', port, method: methode, path: chemin, headers: data === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let c = '';
      res.on('data', (d) => (c += d));
      res.on('end', () => resolve({ statut: res.statusCode ?? 0, json: c === '' ? {} : (JSON.parse(c) as Record<string, unknown>) }));
    });
    req.on('error', reject);
    // Garde-temps OPTIONNEL (version test du fail-closed) : armé par le témoin de la
    // coquille pour que, si le handler cesse de répondre (coquille absente), la requête
    // ÉCHOUE VITE au lieu de pendre la suite jusqu'au timeout global. `destroy` ferme la
    // socket → afterEach/close() n'attend pas une connexion fantôme (pas de résidu de port).
    if (timeoutMs !== undefined) req.setTimeout(timeoutMs, () => req.destroy(new Error(`requête sans réponse en ${timeoutMs} ms`)));
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
    config: over.config ?? CONFIG,
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
  it('honore un port FIXE en config (cible stable pour le reverse-proxy)', async () => {
    // On lie DIRECTEMENT un port choisi au hasard (pas de sonde qu'on relâche :
    // cette fenêtre était une course sous forte parallélisation). Si le port est
    // pris, creerServeurScan rejette (EADDRINUSE) et on retente un autre port —
    // 10 tirages dans une plage de 10000 → collision négligeable, zéro course.
    for (let essai = 0; essai < 10; essai++) {
      const port = 50000 + Math.floor(Math.random() * 10000);
      try {
        const { s } = await monterServeur({ config: { ...CONFIG, port } });
        expect(s.port).toBe(port);
        return;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
        throw e;
      }
    }
    throw new Error('port fixe : 10 ports consécutifs occupés (improbable)');
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

  // DISCRIMINATION : l'échec de /scanner porte la CATÉGORIE MARCHAND (pas juste la
  // cause interne), et pour le seau irréductible `absent` il porte l'URL EXACTE
  // testée — sans elle, l'auto-diagnostic de l'UI (« ouvre cette URL ») est creux.
  it('échec « fichier absent » → 403 porte categorie:absent + urlVerifiee (l’URL à auto-diagnostiquer)', async () => {
    const { s } = await monterServeur({ recuperer: recupererAbsent });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(scan.statut).toBe(403);
    expect(scan.json['categorie']).toBe('absent');
    expect(String(scan.json['urlVerifiee'])).toContain('https://ok.test/zurvela-verification-');
  });

  // RÉESSAI (β) : les FAITS serveur voyagent sous un objet dédié `reessai` (séparé
  // des champs marchand categorie/urlVerifiee), et la décision UI en découle.
  it('échec « fichier absent » → reessai {reponseServie:true, jetonMort:false} ; decisionReessai → reverifier (bout en bout)', async () => {
    const { s } = await monterServeur({ recuperer: recupererAbsent });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(scan.statut).toBe(403);
    expect(scan.json['reessai']).toEqual({ reponseServie: true, jetonMort: false });
    // le constat serveur gouverne la décision UI : absent → reverifier, de bout en bout
    expect(decisionReessai(scan.json['reessai'] as FaitsReessai)).toBe('reverifier');
  });

  it('url invalide → catégorie url-invalide, AUCUN reessai (saisie, pas un réessai de jeton)', async () => {
    const { s } = await monterServeur();
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'ftp://x.fr' });
    expect(scan.statut).toBe(403);
    expect(scan.json['categorie']).toBe('url-invalide');
    expect(scan.json['reessai']).toBeUndefined();
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

// ═══════════════ (6) E-MAIL DE LIVRAISON ═══════════════
type Envoyer = (opts: { destinataire: string; origine: string; rapportHtml: string }) => Promise<{ ok: boolean }>;

// Monte un serveur dont l'ordonnanceur a un `envoyer` doublé (zéro mail réel).
// `executer` peut bloquer sur une barrière → on observe l'état transitoire.
async function monterAvecEnvoi(opts: {
  envoyer?: Envoyer;
  stockQuota?: StockQuota;
  executer?: ExecuterScan;
} = {}): Promise<{ s: ServeurScan; ss: ReturnType<typeof stockScans>; ord: ReturnType<typeof creerOrdonnanceur>; envoyer: ReturnType<typeof vi.fn<Envoyer>> }> {
  const sv = stockVerif();
  const ss = stockScans();
  const sq = opts.stockQuota ?? stockQuotaMemoire();
  const executer: ExecuterScan = opts.executer ?? (async () => ({ ok: true, rapportHtml: '<html>RAPPORT</html>', cout: 0 }));
  const envoyer = vi.fn<Envoyer>(opts.envoyer ?? (async () => ({ ok: true })));
  const ord = creerOrdonnanceur({ stockScans: ss, executer, maintenant: () => 1000, envoyer });
  const s = await monterServeur({ stockVerif: sv, stockScans: ss, stockQuota: sq, recuperer: recupererBon(sv), ordonnanceur: ord });
  return { s: s.s, ss, ord, envoyer };
}

describe('(6) e-mail de livraison', () => {
  it('collecte + envoi + EFFACEMENT : stocké transitoirement, livré à la fin, PUIS effacé (le rapport reste)', async () => {
    let liberer!: () => void;
    const barriere = new Promise<void>((r) => (liberer = r));
    const { s, ss, ord, envoyer } = await monterAvecEnvoi({
      executer: async () => {
        await barriere; // le scan reste « en-cours » tant qu'on n'a pas libéré
        return { ok: true, rapportHtml: '<html>RAPPORT</html>', cout: 0 };
      },
    });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'client@example.com' });
    expect(scan.statut).toBe(202);
    const id = String(scan.json['scanId']);
    // STOCKÉ TRANSITOIREMENT, pendant que le scan tourne encore
    await new Promise((r) => setTimeout(r, 5));
    expect(ss.lire(id)?.email).toBe('client@example.com');
    liberer();
    await ord.oisif();
    // LIVRÉ
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0]![0]).toEqual({ destinataire: 'client@example.com', origine: 'https://ok.test', rapportHtml: '<html>RAPPORT</html>' });
    // EFFACÉ après envoi, le rapport conservé
    const apres = ss.lire(id);
    expect(apres?.email).toBeUndefined();
    expect(apres?.etat).toBe('termine');
    expect(apres?.rapportHtml).toContain('RAPPORT');
  });

  it('ANTI-INJECTION (bord d’entrée) : un e-mail à CR/LF → 400, RIEN enfilé', async () => {
    const { s, ss } = await monterAvecEnvoi();
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const r = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'victime@example.com\r\nBcc: evil@x.com' });
    expect(r.statut).toBe(400);
    expect(r.json['erreur']).toBe('email-invalide');
    expect(ss.tout()).toEqual([]); // aucun scan créé
  });

  it('PLAFOND DESTINATAIRE : destinataire au plafond → 429 portee « destinataire »', async () => {
    const { s } = await monterAvecEnvoi({ stockQuota: stockQuotaMemoire({ [`${JOUR}|destinataire:plein@example.com`]: 3 }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const r = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'plein@example.com' });
    expect(r.statut).toBe(429);
    expect(r.json['portee']).toBe('destinataire');
  });

  it('ÉCHEC D’ENVOI n’affecte JAMAIS l’id : le rapport reste à /statut/:id, l’e-mail est quand même effacé', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {}); // l'envoi raté crie désormais — tu
    const { s, ss, ord, envoyer } = await monterAvecEnvoi({
      envoyer: async () => {
        throw new Error('Resend indisponible');
      },
    });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'client@example.com' });
    expect(scan.statut).toBe(202);
    const id = String(scan.json['scanId']);
    await ord.oisif();
    expect(envoyer).toHaveBeenCalledTimes(1);
    // l'id reste le filet : rapport toujours accessible malgré l'échec d'envoi
    const st = await requete(s.port, 'GET', `/statut/${encodeURIComponent(id)}`);
    expect(st.statut).toBe(200);
    expect(st.json['etat']).toBe('termine');
    expect(String(st.json['rapportHtml'])).toContain('RAPPORT');
    // et l'e-mail est tout de même effacé (minimisation, même sur échec)
    expect(ss.lire(id)?.email).toBeUndefined();
    cri.mockRestore();
  });

  // DETTE DE CLÔTURE (la plus importante) : un envoi RATÉ ne doit pas être INVISIBLE.
  // L'envoyer avale les throws ET l'e-mail est effacé juste après → sans cri, un rapport
  // non livré ne laisse AUCUNE trace. Le cri (stderr, comme l'incohérence) rend l'échec
  // relisible, sans casser l'accès par id. §3 : scanId+origine, JAMAIS l'e-mail dans les logs.
  it('envoi qui THROW → CRIE (scanId+origine), jamais l’e-mail (§3)', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { s, ord } = await monterAvecEnvoi({ envoyer: async () => { throw new Error('Resend indisponible'); } });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'client@example.com' });
    await ord.oisif();
    expect(cri).toHaveBeenCalled(); // un envoi raté ne doit pas être invisible
    expect(cri.mock.calls.flat().join(' ')).not.toContain('client@example.com'); // §3 : jamais l'e-mail
    cri.mockRestore();
  });

  it('envoi qui renvoie ok:false (Resend non-200, mode aujourd’hui IGNORÉ) → CRIE aussi', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { s, ss, ord } = await monterAvecEnvoi({ envoyer: async () => ({ ok: false }) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'client@example.com' });
    await ord.oisif();
    expect(cri).toHaveBeenCalled(); // le {ok} est désormais LU, pas ignoré
    expect(ss.lire(String(scan.json['scanId']))?.email).toBeUndefined(); // l'id reste le filet
    cri.mockRestore();
  });

  it('envoi RÉUSSI (ok:true) → AUCUN cri (le cri est spécifique à l’échec)', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { s, ord } = await monterAvecEnvoi(); // défaut : ok:true
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test', email: 'client@example.com' });
    await ord.oisif();
    expect(cri).not.toHaveBeenCalled();
    cri.mockRestore();
  });

  it('sans e-mail : 202, aucun envoi, aucun compteur destinataire', async () => {
    const { s, ss, ord, envoyer } = await monterAvecEnvoi();
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' });
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' });
    expect(scan.statut).toBe(202);
    await ord.oisif();
    expect(envoyer).not.toHaveBeenCalled();
    expect(ss.lire(String(scan.json['scanId']))?.email).toBeUndefined();
  });
});

// ═══════════════ (a) handler fail-closed ═══════════════
// Le vrai gain (mesuré : le handler n'avait AUCUN try/catch → un throw PENDAIT la
// requête, motif « serveur qui se pend »). On teste au niveau GÉNÉRIQUE : tout throw
// → 500 propre + process vivant. L'incohérence interne (acheverVerification ⟹
// peutScanner violé), reclassée de 403 marchand en 500 honnête, en est une INSTANCE.
describe('(a) handler fail-closed : tout throw → 500, process vivant', () => {
  it('throw générique dans le handler → 500 incoherence-interne + cri stderr + process survit', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    // stockScans dont `lire` LANCE : GET /statut le déclenche (chemin le plus court).
    const ssExplosif = { ...stockScans(), lire: () => { throw new Error('boum'); } };
    const { s } = await monterServeur({ stockScans: ssExplosif });
    const r = await requete(s.port, 'GET', '/statut/abc', undefined, 2000); // garde-temps : si la coquille saute, échec en 2s, pas 120s
    expect(r.statut).toBe(500);
    expect(r.json['erreur']).toBe('incoherence-interne');
    expect(cri).toHaveBeenCalled(); // le cri a eu lieu (stderr, hors locales)
    // PROCESS VIVANT : une requête suivante répond normalement (pas de crash).
    expect((await requete(s.port, 'GET', '/sante')).statut).toBe(200);
    cri.mockRestore();
  });

  it('incohérence acheverVerification-ok / peutScanner-non → 500, JAMAIS un 403 marchand', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    // ecrirePreuve NO-OP : acheverVerification réussit (jeton servi, corps = jeton)
    // mais la preuve n'est pas écrite → peutScanner dit `non-prouve` → l'invariant tire.
    const sv: StockVerification = { ...stockVerif(), ecrirePreuve: () => {} };
    const { s } = await monterServeur({ stockVerif: sv, recuperer: recupererBon(sv) });
    await requete(s.port, 'POST', '/verifier', { url: 'https://ok.test' }); // pose le jeton
    const scan = await requete(s.port, 'POST', '/scanner', { url: 'https://ok.test' }, 2000); // garde-temps idem
    expect(scan.statut).toBe(500); // 500, PAS 403
    expect(scan.json['erreur']).toBe('incoherence-interne');
    expect(scan.json['categorie']).toBeUndefined(); // surtout : PAS de catégorie marchand (faux message évité)
    expect(cri).toHaveBeenCalled();
    cri.mockRestore();
  });
});
