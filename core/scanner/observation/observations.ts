/**
 * LE COMPTEUR D'OBSERVATIONS (cahier P2-6, contrat préalable).
 *
 * Une observation est UN CHARGEMENT de page. Le moteur en fait plusieurs
 * de la même page sans y penser — la visite d'exploration, puis chaque
 * rejeu —, et c'est précisément ce matériau que P2-6 exploite : la
 * persistance d'un effet se mesure en comparant des observations, pas en
 * regardant un instant (APPRENTISSAGES n°45).
 *
 * Le compteur naît avec le SCAN et meurt avec lui, comme la mémoire de
 * fermeture : c'est la portée qui garantit l'unicité, pas une discipline
 * d'appelant. Et l'unicité est nécessaire — une visite d'exploration et un
 * rejeu de la même page sont deux observations, et deux compteurs locaux
 * repartant à 1 les confondraient, ce qui ferait croire à une persistance
 * là où il n'y a qu'un seul regard.
 *
 * Les identifiants sont des entiers croissants rendus en texte : aucune
 * horloge, aucun hasard, donc deux scans du même site produisent les mêmes
 * marques et le banc reste comparable.
 */
export interface CompteurObservations {
  /** Ouvre une observation et rend sa marque. */
  ouvrir(): string;
  /** Nombre d'observations ouvertes — pour le journal et les tests. */
  total(): number;
}

export function creerCompteurObservations(): CompteurObservations {
  let n = 0;
  return {
    ouvrir: () => {
      n += 1;
      return `o${n}`;
    },
    total: () => n,
  };
}
