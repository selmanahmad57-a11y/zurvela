// @ts-check
/**
 * i18n PUR — SOURCE UNIQUE pour les DEUX rendeurs (serveur ET navigateur).
 *
 * `chercher` / `interpoler` / `traduire` / `rendreGabarit` sont de purs traitements
 * (traversée d'objet, regex) — aucune dépendance `fs`. Ils vivent ICI, dans le webroot,
 * parce que le navigateur ne peut importer que ce qui lui est servi ; `core/i18n.ts` les
 * RÉ-EXPORTE et ajoute `chargerDictionnaire` (lecture de fichier, serveur seul). Ainsi le
 * `chercher` que le témoin d'exhaustivité teste EST le `chercher` que le navigateur
 * exécute — pas un jumeau (cf. decisionReessai : le code testé est le code qui tourne).
 *
 * Invariant porté par `chercher` : une clé absente LÈVE (pas de repli silencieux sur la
 * clé brute). C'est ce sur quoi repose la ceinture d'exhaustivité du message marchand —
 * d'où l'exigence d'une source unique : si le navigateur avait un `chercher` à repli, un
 * trou de locale afficherait `echecMarchand.absent` brut sans que la ceinture le voie.
 */

/** @typedef {{ [cle: string]: string | Dictionnaire }} Dictionnaire */
/** @typedef {Record<string, string | number>} Valeurs */

/** Motif structurel d'un emplacement `{{chemin.de.cle}}` — aucune langue naturelle. */
const MOTIF_EMPLACEMENT = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Résout un chemin de clé dans un dictionnaire imbriqué. LÈVE si la clé manque ou n'est
 * pas une feuille — jamais de repli sur la clé brute.
 * @param {Dictionnaire} dictionnaire
 * @param {string} cle
 * @returns {string}
 */
export function chercher(dictionnaire, cle) {
  /** @type {string | Dictionnaire | undefined} */
  let courant = dictionnaire;
  for (const segment of cle.split('.')) {
    if (courant === undefined || typeof courant === 'string') {
      throw new Error(`Clé i18n introuvable : ${cle}`);
    }
    courant = courant[segment];
  }
  if (typeof courant !== 'string') {
    throw new Error(`Clé i18n introuvable : ${cle}`);
  }
  return courant;
}

/**
 * Remplace chaque `{{nom}}` par sa valeur. Un nom absent est une erreur.
 * @param {string} texte
 * @param {Valeurs} [valeurs]
 * @returns {string}
 */
export function interpoler(texte, valeurs = {}) {
  return texte.replace(MOTIF_EMPLACEMENT, (_correspondance, nom) => {
    const valeur = valeurs[nom];
    if (valeur === undefined) {
      throw new Error(`Valeur d'interpolation manquante : ${nom}`);
    }
    return String(valeur);
  });
}

/**
 * Traduit une clé et interpole ses valeurs.
 * @param {Dictionnaire} dictionnaire
 * @param {string} cle
 * @param {Valeurs} [valeurs]
 * @returns {string}
 */
export function traduire(dictionnaire, cle, valeurs) {
  return interpoler(chercher(dictionnaire, cle), valeurs);
}

/**
 * Remplace chaque `{{chemin.de.cle}}` d'un gabarit par sa traduction.
 * @param {string} gabarit
 * @param {Dictionnaire} dictionnaire
 * @returns {string}
 */
export function rendreGabarit(gabarit, dictionnaire) {
  return gabarit.replace(MOTIF_EMPLACEMENT, (_correspondance, cle) => chercher(dictionnaire, cle));
}
