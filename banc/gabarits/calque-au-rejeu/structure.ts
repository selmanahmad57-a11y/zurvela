/**
 * Repères STRUCTURELS du gabarit « calque-au-rejeu » (clôture de P2-1 —
 * dette n°20). Un accueil qui présente trois offres par trois liens-boutons,
 * une image de vitrine, et trois pages d'offre. Ce que ce gabarit éprouve, ce
 * sont les DÉCOUVERTES AU REJEU : un calque qui n'apparaît qu'au-delà des
 * visites de l'exploration, donc pendant le rejeu d'un défaut ordinaire de la
 * même page, et qui recouvre les trois boutons à la fois — une cause, trois
 * interceptions. Aucun texte visible ici.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_CONTACT = '/api/contact';
export const PAGE_ACCUEIL = '/';
export const NB_OFFRES = 3;
export const PAGES_OFFRE = Array.from({ length: NB_OFFRES }, (_, i) => `/offre/${i + 1}`);
export const CHEMIN_VITRINE = `${PREFIXE_STATIQUE}/images/vitrine.svg`;
/** L'image de vitrine de l'accueil : c'est elle que D01 casse, et c'est son rejeu qui fait voir le calque. */
export const SELECTEUR_VITRINE: SelecteurBalise = { balise: 'img', attribut: 'data-role', valeur: 'vitrine' };
/** Le dernier des trois boutons : le calque s'insère juste après lui, dans le bloc des offres. */
export const SELECTEUR_DERNIER_BOUTON: SelecteurBalise = { balise: 'a', attribut: 'data-role', valeur: `offre-${NB_OFFRES}` };
