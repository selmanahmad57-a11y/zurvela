/**
 * TÉMOIN de SYNCHRO ROUTES_API ↔ Caddyfile.
 *
 * ── CE QU'IL PROUVE ─────────────────────────────────────────────────────────
 * Le `Caddyfile` proxie vers Node EXACTEMENT les chemins d'API que le serveur
 * sert (liste blanche `@api`). Source unique `ROUTES_API` : empêche l'oubli
 * d'ajout (« le code route /nouvelle, le Caddyfile l'oublie » → rouge).
 *
 * ── CE QU'IL NE PROUVE PAS (à savoir, ne pas s'y reposer) ───────────────────
 * Que Caddy ROUTE correctement. Il compare des ensembles de chemins, PAS le
 * comportement de résolution. L'erreur SILENCIEUSE et dangereuse — un
 * `file_server` glob qui attrape `/scanner` avant `@api` et le sert en 404
 * statique, listes pourtant identiques des deux côtés — passe à travers ce
 * témoin. Le ROUTAGE (la précédence `@api` vs `file_server`) se prouve au
 * DÉPLOIEMENT (validation comportementale réelle : chaque route d'API atteint
 * Node, aucune page ne la masque). CEINTURE, pas garde du routage — même régime
 * que le témoin « vocabulaire fermé » de la discrimination.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROUTES_API, matcherCaddy } from './routes-api.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CADDYFILE = path.join(RACINE, 'deploiement', 'Caddyfile');

describe('synchro ROUTES_API ↔ Caddyfile (la LISTE des routes, PAS le routage)', () => {
  it('le matcher @api du Caddyfile proxie EXACTEMENT les chemins d’API du serveur', () => {
    const contenu = readFileSync(CADDYFILE, 'utf8');
    const ligne = contenu.split('\n').find((l) => l.trim().startsWith('@api path'));
    expect(ligne, '@api path introuvable dans le Caddyfile').toBeTypeOf('string');
    const cheminsCaddy = (ligne ?? '')
      .trim()
      .replace(/^@api\s+path/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const attendus = ROUTES_API.map(matcherCaddy);
    expect([...cheminsCaddy].sort()).toEqual([...attendus].sort());
  });
});
