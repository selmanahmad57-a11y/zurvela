/**
 * Repères STRUCTURELS du gabarit « formulaire-puis-navigation » (cahier P2-1,
 * contrat 1 — carnet C-09) : un site où l'on REMPLIT un formulaire, puis où
 * l'on NAVIGUE vers une page qui porte le défaut. C'est cutlybook en
 * miniature : la campagne 6b y a vu le rejeu ouvrir la page d'arrivée et y
 * chercher le formulaire de la page de départ, 0 candidate rejouable sur 8.
 * Aucun texte visible ici.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_INSCRIPTION = '/api/inscription';
export const CHEMIN_VEDETTE = `${PREFIXE_STATIQUE}/images/vedette.svg`;
export const PAGE_ACCUEIL = '/';
export const PAGE_INSCRIPTION = '/inscription';
export const PAGE_CATALOGUE = '/catalogue';
export const CHAMPS_INSCRIPTION = ['nom', 'email'] as const;
export const SELECTEUR_VEDETTE: SelecteurBalise = { balise: 'img', attribut: 'data-role', valeur: 'vedette' };
