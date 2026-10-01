/**
 * Repères STRUCTURELS du gabarit « recouvrement » (cahier P2-3, contrat 6).
 *
 * Un accueil de boutique à trois produits, un panier, et un pied de page.
 * Il porte les DEUX FACES du contrat 1 — un recouvrement qu'un geste neutre
 * écarte, un recouvrement que rien n'écarte — et la face que l'option A
 * rend nécessaire : UN GESTE PAR BUG, pour que retirer un geste de la liste
 * fasse échouer son cas et lui seul.
 *
 * Il porte aussi les deux erreurs du contrat 4 : des intercepteurs de même
 * construction (qui doivent fondre) et deux calques réellement distincts
 * (qui ne doivent pas). Aucun texte visible n'est lu par le moteur.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_CONTACT = '/api/contact';
export const PAGE_ACCUEIL = '/';
export const PAGE_PANIER = '/panier';
export const NB_PRODUITS = 3;

/** Le bloc des produits : c'est après lui que les calques s'insèrent. */
export const SELECTEUR_PRODUITS: SelecteurBalise = { balise: 'section', attribut: 'data-role', valeur: 'produits' };
/** Le bouton de commande, dans le formulaire : une ACTION CRITIQUE au sens du contrat 2. */
export const SELECTEUR_COMMANDE: SelecteurBalise = { balise: 'button', attribut: 'data-role', valeur: 'commander' };
/** Le pied de page : ce qu'il contient est du CONTENU SECONDAIRE au sens du contrat 2. */
export const SELECTEUR_PIED: SelecteurBalise = { balise: 'footer', attribut: 'data-role', valeur: 'pied' };
/** Le lien de mentions du pied : le cas exact de la fiche 09, publié « Bloquant » à tort. */
export const SELECTEUR_LIEN_PIED: SelecteurBalise = { balise: 'a', attribut: 'data-role', valeur: 'lien-pied' };

/** Rôle du conteneur de chaque calque injecté, pour les tests du gabarit. */
export const ROLE_CALQUE = 'calque';
