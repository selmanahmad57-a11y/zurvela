/**
 * CE QUE LE SCAN A APPRIS D'UN RECOUVREMENT (cahier P2-4, contrat du coût
 * de fermeture au rejeu).
 *
 * Le moteur retentait les cinq gestes de fermeture sur chaque intercepteur
 * À CHAQUE REJEU, alors que le scan venait de mesurer, sur cette page même,
 * ce qui ferme et ce qui ne ferme pas. Mesuré : 4 006 ms par rejeu concerné,
 * et jusqu'à 69 % du temps d'un rejeu de `recouvrement--q10` pour un seul
 * geste dont les trois candidats sont morts.
 *
 * Rejouer, c'est reproduire un parcours CONNU. Refaire l'apprentissage
 * n'est pas une garantie, c'est du gaspillage — et un gaspillage ne coûte
 * pas que son temps, il affame le budget de ce qui reste à vérifier (n°36).
 *
 * ## Les trois règles qui font qu'un souvenir ne ment pas
 *
 * 1. **La mémoire naît et meurt avec le SCAN.** Aucune persistance entre
 *    deux scans : un site change entre deux passages, et une mémoire qui
 *    survit ferait croire au moteur qu'il connaît une page qu'il n'a pas vue
 *    aujourd'hui. C'est un invariant de structure — elle est créée dans le
 *    scan et n'a aucun chemin vers le disque — et non un réglage.
 * 2. **Une absence de souvenir n'est pas un souvenir d'absence.** Un
 *    recouvrement dont la signature est inconnue reçoit la séquence
 *    complète. C'est le cas de `calque-au-rejeu` — un calque qui n'apparaît
 *    QU'AU rejeu — et des iframes publicitaires chargées tardivement.
 * 3. **Un souvenir est un raccourci, jamais une autorité.** Si le geste
 *    mémorisé échoue, le moteur reprend la séquence complète au lieu de
 *    conclure.
 */
import type { GesteFermeture } from './ecarter-recouvrement.js';

/** Journal : la mémoire a été consultée, et ce qu'elle a répondu. */
export const EVENEMENT_MEMOIRE_FERMETURE = 'recouvrement.memoire';

/** Ce que le scan sait d'un recouvrement : ce qui l'écarte, ou que rien ne l'écarte. */
export type SouvenirFermeture = { geste: GesteFermeture } | { aucunGeste: true };

/** La mémoire vue par l'écartement : déjà liée à une page et un viewport. */
export interface MemoireLiee {
  consulter(signature: string): SouvenirFermeture | undefined;
  retenir(signature: string, souvenir: SouvenirFermeture): void;
}

export interface MemoireFermeture {
  /**
   * La mémoire pour UNE page dans UN viewport. La clé comporte les deux :
   * un recouvrement n'est pas le même objet d'une page à l'autre, et un
   * bandeau présent sur desktop peut être absent sur mobile.
   */
  pour(url: string, viewport: string): MemoireLiee;
  /** Nombre de souvenirs retenus — pour le journal et les tests. */
  taille(): number;
}

export function creerMemoireFermeture(): MemoireFermeture {
  const souvenirs = new Map<string, SouvenirFermeture>();
  return {
    pour(url, viewport) {
      const prefixe = `${url}\u0000${viewport}\u0000`;
      return {
        consulter: (signature) => (signature === '' ? undefined : souvenirs.get(prefixe + signature)),
        retenir: (signature, souvenir) => {
          if (signature !== '') {
            souvenirs.set(prefixe + signature, souvenir);
          }
        },
      };
    },
    taille: () => souvenirs.size,
  };
}
