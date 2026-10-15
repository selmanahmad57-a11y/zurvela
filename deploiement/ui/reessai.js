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

/**
 * L'échec de vérification DISCRIMINÉ, tel que /scanner le renvoie sous un 403 :
 * `categorie` TOUJOURS présente ; `reessai` présent SAUF `url-invalide` (le serveur
 * omet la clé). Défini ICI — la maison des décisions de réessai — et importé par le
 * dispatch (qui le PRODUIT), jamais l'inverse : une seule source de la forme, sans
 * dépendance circulaire (dispatch → reessai).
 */
/** @typedef {{ categorie: string, urlVerifiee?: string, reessai?: FaitsReessai }} EchecVerif */

/** L'action du bouton « réessayer » côté UI. */
/** @typedef {'corriger-url' | IntentionReessai} ActionReessai */

/**
 * DÉCISION D'ACTION du réessai — couche fine au-dessus de `decisionReessai`. Appelée
 * UNIQUEMENT sur un échec discriminé (403), garanti par le dispatch qui ne route que
 * `echec-verification` vers ici : l'échec porte donc toujours une `categorie`.
 *
 * Absence de `reessai` ⟺ `url-invalide` : le serveur OMET la clé pour ce seul cas
 * (rejet à la saisie, aucun GET → aucun fait de réessai). L'action est alors de
 * CORRIGER l'adresse — ne JAMAIS tomber dans `decisionReessai`, qui n'a pas de faits.
 * Sinon, le critère β pur tranche re-GET sûr (`resoumettre`) vs jeton frais
 * (`reverifier`, à l'épreuve du 404 CDN).
 *
 * @param {EchecVerif} echec
 * @returns {ActionReessai}
 */
export function actionReessai(echec) {
  if (echec.reessai === undefined) return 'corriger-url';
  return decisionReessai(echec.reessai);
}
