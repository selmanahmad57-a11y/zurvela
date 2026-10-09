/**
 * PROXY FILTRANT D'EGRESS (publication, étape 4) — LA GARDE CARDINALE du scan
 * public. Rien ne part en public sans lui. Le scan tourne dans Chromium, qui
 * résout son PROPRE DNS et charge des SOUS-RESSOURCES (images, scripts, iframes)
 * et suit des REDIRECTIONS vers n'importe quel hôte : chacune est un vecteur
 * SSRF indépendant. `--host-resolver-rules` n'épingle que l'origine listée et
 * laisse passer tout le reste (mesuré, étape 4). Le proxy, lui, voit CHAQUE
 * connexion du navigateur, valide l'IP de destination et refuse les plages
 * privées/réservées/metadata — indépendamment de toute option Chromium.
 *
 * Il NE réinvente PAS l'épinglage : il réutilise `lookupPublicSeulement` de
 * l'étape 3 (résoudre → valider → connecter à l'IP validée, UNE seule
 * résolution, pas de re-résolution → anti-rebinding TOCTOU) pour SES sorties.
 *
 * Deux sous-points, fermés ici (pas en dette) :
 *  - HTTP en clair : le proxy voit la requête, valide+épingle via `lookup`.
 *  - HTTPS via CONNECT : le tunnel est opaque une fois ouvert, donc on valide+
 *    épingle l'IP AVANT d'ouvrir — on ne répond « 200 Connection Established »
 *    QU'APRÈS que la socket amont (connectée à l'IP validée) s'est ouverte. Un
 *    CONNECT vers un hôte résolvant en privé est refusé AVANT tout tunnel.
 */
import http from 'node:http';
import net from 'node:net';
import { CODE_HOTE_NON_PUBLIC, lookupPublicSeulement, resolveurSysteme, type ResoudreDns } from './verification-propriete.js';

export type EvenementProxy =
  | { type: 'refus'; hote: string; raison: 'hote-non-public' }
  | { type: 'relais'; hote: string }
  | { type: 'erreur'; hote: string };

export interface OptionsProxy {
  /** Résolveur DNS injectable (défaut : `dns.lookup` all). Le témoin l'injecte pour contrôler les hôtes. */
  readonly resoudre?: ResoudreDns;
  /** Délai de connexion amont (ms). */
  readonly delaiMs?: number;
  /** Observabilité : chaque geste d'egress (relais/refus) est signalé — journalisable (constitution §5). */
  readonly surEvenement?: (e: EvenementProxy) => void;
}

export interface ProxyFiltrant {
  readonly port: number;
  refus(): number;
  relais(): number;
  fermer(): Promise<void>;
}

const estRefusSsrf = (e: unknown): boolean => (e as { codeZurvela?: string } | null)?.codeZurvela === CODE_HOTE_NON_PUBLIC;

export function creerProxyFiltrant(opts: OptionsProxy = {}): Promise<ProxyFiltrant> {
  const delaiMs = opts.delaiMs ?? 10_000;
  const lookup = lookupPublicSeulement(opts.resoudre ?? resolveurSysteme());
  let refus = 0;
  let relais = 0;
  const signaler = (e: EvenementProxy): void => {
    if (e.type === 'refus') refus += 1;
    if (e.type === 'relais') relais += 1;
    opts.surEvenement?.(e);
  };

  const serveur = http.createServer();

  // ── HTTP EN CLAIR : requête en forme absolue (le client est configuré en proxy). ──
  serveur.on('request', (req, res) => {
    let u: URL;
    try {
      u = new URL(req.url ?? '');
    } catch {
      res.writeHead(400);
      res.end('requete-proxy-invalide');
      return;
    }
    if (u.protocol !== 'http:') {
      res.writeHead(400);
      res.end('schema-non-supporte');
      return;
    }
    const enTetes = { ...req.headers };
    delete enTetes['proxy-connection'];
    const amont = http.request(
      {
        host: u.hostname,
        port: u.port === '' ? 80 : Number.parseInt(u.port, 10),
        path: `${u.pathname}${u.search}`,
        method: req.method,
        headers: enTetes,
        lookup, // valide + épingle AVANT toute connexion
        timeout: delaiMs,
      },
      (amontRes) => {
        signaler({ type: 'relais', hote: u.hostname });
        res.writeHead(amontRes.statusCode ?? 502, amontRes.headers);
        amontRes.pipe(res);
      },
    );
    amont.on('timeout', () => amont.destroy());
    amont.on('error', (e) => {
      if (estRefusSsrf(e)) {
        signaler({ type: 'refus', hote: u.hostname, raison: 'hote-non-public' });
        if (!res.headersSent) res.writeHead(403);
        res.end('refus-ssrf');
      } else {
        signaler({ type: 'erreur', hote: u.hostname });
        if (!res.headersSent) res.writeHead(502);
        res.end('erreur-amont');
      }
    });
    req.pipe(amont);
  });

  // ── HTTPS via CONNECT : valider + épingler AVANT d'ouvrir le tunnel. ──
  serveur.on('connect', (req, clientSocket, tete) => {
    const cible = req.url ?? '';
    const sep = cible.lastIndexOf(':');
    const hote = sep === -1 ? cible : cible.slice(0, sep);
    const port = sep === -1 ? 443 : Number.parseInt(cible.slice(sep + 1), 10) || 443;

    // `net.connect` avec notre `lookup` : résout+valide+épingle. Si l'hôte
    // résout en privé, le lookup rappelle une erreur et AUCUNE socket n'est
    // ouverte vers l'IP — le tunnel ne s'ouvre jamais.
    const amont = net.connect({ host: hote, port, lookup, timeout: delaiMs });

    amont.once('connect', () => {
      // 200 émis SEULEMENT après connexion à l'IP VALIDÉE : avant, rien n'est tunnelé.
      signaler({ type: 'relais', hote });
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (tete && tete.length > 0) amont.write(tete);
      amont.pipe(clientSocket);
      clientSocket.pipe(amont);
    });
    amont.on('timeout', () => amont.destroy());
    amont.on('error', (e) => {
      if (estRefusSsrf(e)) {
        signaler({ type: 'refus', hote, raison: 'hote-non-public' });
        // Tunnel JAMAIS ouvert : on refuse explicitement, puis on ferme.
        clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      } else {
        signaler({ type: 'erreur', hote });
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
    });
    clientSocket.on('error', () => amont.destroy());
  });

  return new Promise((resolve) => {
    serveur.listen(0, '127.0.0.1', () => {
      resolve({
        port: (serveur.address() as net.AddressInfo).port,
        refus: () => refus,
        relais: () => relais,
        fermer: () => new Promise((r) => serveur.close(() => r())),
      });
    });
  });
}
