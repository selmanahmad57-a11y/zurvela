/**
 * CATÉGORIE MARCHAND de l'échec de vérification (interface marchande).
 *
 * Le serveur discrimine déjà SIX causes techniques (`RaisonEchec`). Ici on les
 * mappe en CATÉGORIE MARCHAND — une partition par ACTION requise du marchand,
 * pas une taxonomie technique. Critère unique (cahier interface) :
 *   - deux causes partagent une catégorie SSI elles appellent la même action ;
 *   - une catégorie porte `urlVerifiee` SSI son action est « inspecte cette URL ».
 *
 * Le seul à avoir VU le site est le serveur (GET gardé, proxy d'egress,
 * épinglage SSRF — l'UI ne peut refaire ce GET). Et il y a un seau que personne
 * dans le système ne peut trancher : `absent` (404 à l'URL exacte — pas-encore-là
 * / mauvais-endroit / mauvais-nom). On ne devine pas une précision qu'on n'a pas
 * (éthique zéro-faux-positif) : on renvoie `absent` + l'URL, et l'UI équipe le
 * marchand à l'ouvrir lui-même.
 *
 * Le TYPE porte la règle de l'URL (union discriminée) ; l'exhaustivité du mapping
 * est imposée par `tsc` (une 7ᵉ `RaisonEchec` ne compilera pas sans sa catégorie).
 */
import type { RaisonEchec } from './verification-propriete.js';

/** Vocabulaire fermé des catégories marchand. */
export const CATEGORIES_ECHEC_MARCHAND = [
  'absent',
  'contenu-inattendu',
  'redirection',
  'injoignable',
  'non-public',
  'session-expiree',
  'url-invalide',
] as const;

export type CategorieEchecMarchand = (typeof CATEGORIES_ECHEC_MARCHAND)[number];

/**
 * L'échec rendu au marchand. Union DISCRIMINÉE : seules `absent` et
 * `contenu-inattendu` — dont l'action est « inspecte cette URL » — portent
 * `urlVerifiee`. `tsc` refuse une `absent` nue ou un `injoignable` avec URL.
 */
export type EchecMarchand =
  | { readonly categorie: 'absent'; readonly urlVerifiee: string }
  | { readonly categorie: 'contenu-inattendu'; readonly urlVerifiee: string }
  | { readonly categorie: 'redirection' }
  | { readonly categorie: 'injoignable' }
  | { readonly categorie: 'non-public' }
  | { readonly categorie: 'session-expiree' }
  | { readonly categorie: 'url-invalide' };

/**
 * Mappe une cause serveur vers sa catégorie marchand. `urlVerifiee` = l'URL
 * exacte testée (le serveur l'a ; l'appelant la fournit). Elle n'est RETENUE que
 * pour les catégories dont l'action est de l'inspecter.
 */
export function categoriserEchec(raison: RaisonEchec, urlVerifiee: string): EchecMarchand {
  switch (raison) {
    case 'fichier-absent':
      return { categorie: 'absent', urlVerifiee };
    case 'mauvais-contenu':
      return { categorie: 'contenu-inattendu', urlVerifiee };
    case 'redirection-refusee':
      return { categorie: 'redirection' };
    case 'erreur-reseau':
      return { categorie: 'injoignable' };
    case 'hote-non-public':
      return { categorie: 'non-public' };
    case 'jeton-absent':
    case 'jeton-expire':
      return { categorie: 'session-expiree' };
    case 'url-invalide':
    case 'schema-non-supporte':
    case 'userinfo-interdit':
    case 'ip-litterale-interdite':
      return { categorie: 'url-invalide' };
  }
  // Exhaustivité imposée par tsc : une RaisonEchec non couverte rend `raison`
  // non-`never` ici → la compilation échoue.
  const _exhaustif: never = raison;
  return _exhaustif;
}
