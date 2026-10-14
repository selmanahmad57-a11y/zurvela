// @ts-check
/**
 * CLÉ DU MESSAGE MARCHAND — SOURCE UNIQUE (navigateur ET vitest).
 *
 * Même régime que `reessai.js` : la PRÉSENTATION vit côté navigateur (archi B, β).
 * Le serveur n'énonce que des FAITS dans l'échec /scanner — `categorie`,
 * `urlVerifiee`, `reessai` — language-neutres ; il ne rend AUCUNE prose. Le
 * navigateur reçoit `categorie` et en dérive la clé de locale, puis traduit
 * côté client. Rien de présentation ne transite par le contrat d'API (le jour de
 * l'anglais, le serveur n'a pas à négocier la langue : la locale est pure cliente).
 *
 * La clé est l'IDENTITÉ PRÉFIXÉE de la catégorie (`absent` → `echecMarchand.absent`).
 * On ne transporte donc pas de clé séparée et il n'y a pas de table à trouer :
 * toute catégorie est couverte PAR CONSTRUCTION. La seule complétude qui reste à
 * garantir — qu'une entrée de locale existe pour chaque catégorie — se joue entre
 * le dictionnaire et les catégories réelles, prouvée au runtime par le témoin
 * d'exhaustivité (tsc ne voit pas le JSON).
 *
 * Cette fonction est la SEULE maison de la convention de clé : le navigateur et le
 * témoin l'importent tous deux, donc la convention ne peut pas diverger entre eux.
 */

/** @typedef {import('../../core/publication/categorie-echec.js').CategorieEchecMarchand} CategorieEchecMarchand */

/**
 * Dérive la clé de locale du message marchand pour une catégorie d'échec.
 * @param {CategorieEchecMarchand} categorie
 * @returns {string}
 */
export function cleMessageEchec(categorie) {
  return 'echecMarchand.' + categorie;
}
