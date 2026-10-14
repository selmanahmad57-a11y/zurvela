// @ts-check
/**
 * DÉCISION DE RÉESSAI — SOURCE UNIQUE (navigateur ET vitest/core).
 *
 * ES module PUR : pas de DOM, pas de dépendance node → importable des deux côtés.
 * `@ts-check` + JSDoc le font vérifier par `tsc` SANS compilation ni bundler. C'est
 * CE fichier qui tourne en PROD (le navigateur l'importe, servi statique par Caddy)
 * ET que les témoins testent — plus de jumeau TS qui validerait un chemin mort.
 * Zéro divergence possible : il n'y a qu'une source.
 *
 * Le critère : au clic « réessayer », l'UI re-GETerait la MÊME URL du jeton courant.
 * Sûr SSI aucune réponse cachable n'y a été servie ET le jeton n'était pas déjà mort ;
 * sinon jeton neuf (nouvelle URL, à l'épreuve du cache CDN / du jeton mort). Les deux
 * faits sont CONSTATÉS par le serveur et remontés dans `/scanner` (`reessai`).
 *
 * Espace de 4 états, 3 ATTEIGNABLES. `{reponseServie:true, jetonMort:true}` est
 * INATTEIGNABLE par construction (jeton mort ⟹ retour avant le GET ⟹ rien servi) —
 * prouvé à la source par le témoin des faits d'`acheverVerification`. Aucun
 * comportement n'est testé dessus (pas de branche fantôme).
 */

/** @typedef {{ reponseServie: boolean, jetonMort: boolean }} FaitsReessai */
/** @typedef {'reverifier' | 'resoumettre'} IntentionReessai */

/**
 * @param {FaitsReessai} faits
 * @returns {IntentionReessai}
 */
export function decisionReessai(faits) {
  const reGetSur = !faits.reponseServie && !faits.jetonMort;
  return reGetSur ? 'resoumettre' : 'reverifier';
}
