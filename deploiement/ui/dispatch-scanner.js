// @ts-check
/**
 * DISPATCH de la réponse /scanner — SOURCE UNIQUE (navigateur ET vitest).
 *
 * Même régime que reessai.js / message-echec.js : logique pure, importée par la glue
 * ET son témoin. Le `fetch` est glue (il fait le réseau) ; `(statut, corps) → Resultat`
 * ne touche à rien — c'est la 2ᵉ fonction pure de la brique. Elle ROUTE par CODE HTTP,
 * jamais par le contenu du corps : c'est ce qui empêche un 429 (quota) ou un 500
 * (incohérence) d'atteindre la branche `echec-verification` — la seule qui alimente
 * `actionReessai`. Un 429 routé là dirait « corrige ton adresse » à un marchand qui a
 * juste atteint son quota : le faux message du 403 secondaire, par un autre chemin.
 *
 * Le `Retry-After` (header) n'entre PAS ici : le quota reset à minuit UTC (journalier),
 * donc `portee` seule suffit au message MVP (« limite du jour … réessayez demain »).
 * Le délai précis (compte à rebours) est une DETTE, lue par la glue si un jour voulu.
 */

/** @typedef {import('./reessai.js').FaitsReessai} FaitsReessai */
/** L'échec de vérification discriminé, tel que /scanner le renvoie sous un 403. */
/** @typedef {{ categorie: string, urlVerifiee?: string, reessai?: FaitsReessai }} EchecVerif */
/**
 * @typedef {(
 *   | { type: 'scan-lance', scanId: string }
 *   | { type: 'echec-verification', echec: EchecVerif }
 *   | { type: 'quota', portee: string }
 *   | { type: 'saisie-invalide', champ: string }
 *   | { type: 'incoherence-serveur' }
 * )} Resultat
 */

/**
 * Route une réponse /scanner (code + corps JSON déjà parsé) vers la logique cliente.
 * @param {number} statut
 * @param {unknown} corps
 * @returns {Resultat}
 */
export function dispatcherReponseScanner(statut, corps) {
  const c = /** @type {Record<string, unknown>} */ (corps ?? {});
  switch (statut) {
    case 202:
      return { type: 'scan-lance', scanId: String(c['scanId'] ?? '') };
    case 403:
      // NOTE (dépendance à (a)) : on fait CONFIANCE à ce que tout 403 porte un échec
      // DISCRIMINÉ — garanti par le reclassement de l'incohérence interne en 500
      // (serveur-scan.ts, commit eb37c67 : le 403 secondaire inatteignable est devenu
      // un 500). Pas de garde runtime ici : le cast exprime la confiance. Si un 403 NU
      // réapparaissait côté serveur, `actionReessai` le confondrait avec `url-invalide`
      // (absence de `reessai`). Ne pas réintroduire de 403 nu sans rétablir une garde.
      return { type: 'echec-verification', echec: /** @type {EchecVerif} */ (corps) };
    case 429:
      // `portee` seule (le délai = minuit UTC, « demain » pour toutes les portées).
      return { type: 'quota', portee: String(c['portee'] ?? '') };
    case 400:
      return { type: 'saisie-invalide', champ: String(c['erreur'] ?? '') };
    default:
      // FAIL-CLOSED DÉLIBÉRÉ : tout code non listé (500, 503 infra, 2xx/3xx inattendu…)
      // → générique honnête, jamais un routage au hasard. ATTENTION (inverse du `never`
      // d'exhaustivité) : ce fourre-tout AVALE en silence tout nouveau code. Si le
      // serveur se met à produire un code porteur d'une SÉMANTIQUE MARCHANDE (ex. 409
      // conflit), l'AJOUTER explicitement en `case` AU-DESSUS d'ici — ne pas le laisser
      // tomber dans ce `default`, où rien ne rougirait.
      return { type: 'incoherence-serveur' };
  }
}
