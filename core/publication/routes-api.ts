/**
 * ROUTES D'API — SOURCE UNIQUE. Le serveur route ces chemins (serveur-scan.ts les
 * utilise), et le témoin de synchro (`routes-api.test.ts`) vérifie que le
 * `Caddyfile` proxie EXACTEMENT ceux-là vers Node (le reste → file_server). Un
 * ajout de route ici qui oublierait le `Caddyfile` rougit.
 *
 * ATTENTION : le témoin ne prouve que la SYNCHRO DES LISTES, pas le routage de
 * Caddy. La précédence `@api` vs `file_server` (l'erreur SILENCIEUSE : une page
 * qui masque `/scanner`) n'est pas testable sous le gate vitest-only — elle se
 * prouve au DÉPLOIEMENT (sonde comportementale + rollback dans `deployer-caddy.sh`).
 */

/** Les chemins d'API, nommés une seule fois — le serveur les référence. */
export const CHEMINS = {
  verifier: '/verifier',
  scanner: '/scanner',
  sante: '/sante',
  statut: '/statut/', // PRÉFIXE : /statut/:id
} as const;

/** Chaque route d'API + sa forme (exact|préfixe), pour la synchro Caddy. */
export const ROUTES_API = [
  { chemin: CHEMINS.verifier, prefixe: false },
  { chemin: CHEMINS.scanner, prefixe: false },
  { chemin: CHEMINS.sante, prefixe: false },
  { chemin: CHEMINS.statut, prefixe: true },
] as const;

/**
 * Forme du matcher `path` de Caddy : exact → `/x` ; préfixe → `/x*`. Le glob
 * `/statut/*` est MESURÉ aligné avec le `startsWith('/statut/')` du serveur (même
 * accord sur `/statut/<id>`, `/statut/`, `/statut` nu).
 */
export const matcherCaddy = (r: { readonly chemin: string; readonly prefixe: boolean }): string =>
  r.prefixe ? `${r.chemin}*` : r.chemin;
