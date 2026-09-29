/**
 * Repères STRUCTURELS du gabarit « catalogue-boutons » (cahier P2-1, contrat
 * 3 — carnet C-10) : un catalogue statique dont chaque article porte un
 * formulaire RÉDUIT À UN BOUTON (« Ajouter au panier »), vingt par page,
 * huit pages. C'est books.toscrape en miniature : la campagne 6b y a vu la
 * déterministe remplir 237 fois rien et consommer l'échéance entière. Huit
 * pages et non trois, parce que trois ne suffisent pas à épuiser la réserve
 * d'exploration du banc : soixante remplissages vides tiennent dans
 * l'échéance, cent quarante n'y tiennent pas — et c'est ce que le bug K01
 * doit pouvoir mesurer.
 * Aucun texte visible ici.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_PANIER = '/api/panier';
export const CHEMIN_ARTICLE = `${PREFIXE_STATIQUE}/images/article.svg`;
export const PAGE_ACCUEIL = '/';
export const NB_PAGES = 8;
export const PAGES_SUITE = Array.from({ length: NB_PAGES - 1 }, (_, i) => `/page/${i + 2}`);
export const PAGE_IMAGE_CASSEE = `/page/${NB_PAGES}`;
export const ARTICLES_PAR_PAGE = 20;
/** L'image du premier article de chaque page : c'est elle que K01 casse sur la dernière page. */
export const SELECTEUR_ARTICLE_UN: SelecteurBalise = { balise: 'img', attribut: 'data-role', valeur: 'article-1' };
