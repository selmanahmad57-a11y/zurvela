/**
 * Repères STRUCTURELS du gabarit « tiers-au-robot » (cahier P2-2, contrat 6).
 * Un accueil de commerce qui dépend d'une seconde origine de deux façons :
 * une police de titre, dont l'échec ne se voit pas (le navigateur retombe sur
 * une police système), et un script d'avis clients que la page APPELLE, dont
 * l'échec casse la page (erreur JavaScript, bloc d'avis vide). Aucun texte
 * visible ici.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_CONTACT = '/api/contact';
export const PAGE_ACCUEIL = '/';
export const PAGE_ATELIER = '/atelier';
/** Chemins servis par la seconde origine. */
export const CHEMIN_POLICE_TIERCE = '/polices/titre.woff2';
export const CHEMIN_SCRIPT_AVIS = '/widget/avis.js';
/** Balise de mesure d'audience : chargée par la page, jamais rappelée par elle. */
export const CHEMIN_MESURE_TIERCE = '/mesure/audience.js';
/** Le bloc que le script d'avis remplit : il reste vide quand le script manque. */
export const SELECTEUR_AVIS: SelecteurBalise = { balise: 'section', attribut: 'data-role', valeur: 'avis' };
/** Le logo de l'accueil : la ressource interne que W04 fait manquer. */
export const SELECTEUR_LOGO: SelecteurBalise = { balise: 'img', attribut: 'data-role', valeur: 'logo' };
