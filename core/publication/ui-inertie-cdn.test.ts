/**
 * TÉMOIN GARDÉ — INERTIE CDN de l'interface marchande (l'invariant le plus critique
 * de la glue, désormais gardé à CHAQUE run, pas seulement par l'e2e one-shot).
 *
 * Pilote un vrai navigateur sur `deploiement/ui/` (API Zurvela MOCKÉE — zéro scan
 * payant) à travers saisie→depot→echec, et ASSERTE au niveau comportemental :
 *  - la page S'INITIALISE (le titre apparaît, pas le fallback bootstrap) ;
 *  - les écrans RENDENT (depot, echec) ;
 *  - AUCUN appel ne sort de l'origine de l'API Zurvela — en particulier, RIEN ne
 *    touche l'URL du jeton (origine+chemin du marchand). C'est le constat CDN au
 *    niveau RÉSEAU : le seul GET légitime sur l'URL du jeton est celui que le serveur
 *    fait pendant /scanner, déclenché par le clic. Rougira si un remaniement d'app.js
 *    glisse un `fetch` vers cette URL — le défaut que tout le chantier a rendu
 *    structurellement impossible (un écran inerte, une affordance absente).
 *
 * Playwright est déjà au gate (core/scanner/*.test.ts pilotent Chromium) : ce témoin
 * ne coûte ni dépendance ni scan, juste un lancement de navigateur.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';

const RACINE = join(process.cwd(), 'deploiement/ui');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const ORIGINE = 'https://exemple-marchand.invalid'; // le site du marchand — JAMAIS fetché par l'UI
const CHEMIN = '/zurvela-verification-xyz123.txt';

let serveur: Server;
let navigateur: Browser;
let base: string;

beforeAll(async () => {
  serveur = createServer(async (req, res) => {
    try {
      const demande = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const relatif = demande === '/' ? 'index.html' : demande; // le FICHIER résolu (pas le chemin de requête)
      const contenu = await readFile(join(RACINE, relatif));
      res.writeHead(200, { 'content-type': TYPES[extname(relatif)] ?? 'application/octet-stream' });
      res.end(contenu);
    } catch {
      res.writeHead(404);
      res.end('non trouvé');
    }
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
  const port = (serveur.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  navigateur = await chromium.launch();
});

afterAll(async () => {
  await navigateur?.close();
  await new Promise<void>((r) => serveur?.close(() => r()));
});

describe('UI — inertie CDN (aucun appel hors API Zurvela, saisie→depot→echec)', () => {
  it("la page s'initialise, les écrans rendent, et RIEN ne touche l'URL du jeton", async () => {
    const page = await navigateur.newPage();
    const horsApi: string[] = [];
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) {
        horsApi.push(url.href); // tout appel hors base = vers le marchand = INTERDIT avant/sans le serveur
        return route.abort();
      }
      if (url.pathname === '/verifier') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ origine: ORIGINE, jeton: 'ZV-xyz123', chemin: CHEMIN, expireLe: Date.now() + 86_400_000 }) });
      }
      if (url.pathname === '/scanner') {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ categorie: 'absent', urlVerifiee: ORIGINE + CHEMIN, reessai: { reponseServie: true, jetonMort: false } }) });
      }
      return route.continue(); // fichiers statiques de l'UI (même origine)
    });

    await page.goto(base + '/');
    await page.getByRole('heading').waitFor({ timeout: 15_000 }); // S'INITIALISE (titre, pas le bootstrap <p>)

    await page.locator('#url').fill(ORIGINE);
    await page.getByRole('button', { name: /continuer/i }).click();
    await page.getByText(/déposez ce fichier/i).waitFor({ timeout: 15_000 }); // écran DEPOT rend

    await page.getByRole('button', { name: /c'est déposé/i }).click();
    await page.getByText(/n'a pas abouti/i).waitFor({ timeout: 15_000 }); // écran ECHEC rend

    await page.close();
    expect(erreurs).toEqual([]); // la glue tourne sans erreur JS
    expect(horsApi).toEqual([]); // AUCUN appel hors API Zurvela : l'URL du jeton n'est jamais touchée
  });
});
