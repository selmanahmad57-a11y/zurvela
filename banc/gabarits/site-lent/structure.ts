/**
 * Repères STRUCTURELS du gabarit « site-lent » (cahier P2-1, contrat 2 —
 * carnet C-06) : un accueil et douze pages de contenu, servies avec un retard
 * quand L02 est actif. Ce que ce gabarit éprouve, c'est l'ÉCHÉANCE : sur un
 * site dont chaque page coûte, l'exploration doit rendre la main avant
 * d'avoir mangé la réserve de la confirmation. Aucun texte visible ici.
 */
export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_CONTACT = '/api/contact';
export const PAGE_ACCUEIL = '/';
export const NB_PAGES_CONTENU = 12;
export const PAGES_CONTENU = Array.from({ length: NB_PAGES_CONTENU }, (_, i) => `/p/${i + 1}`);
/** La page dont la PREMIÈRE visite est lente au-delà du seuil : c'est elle que le protocole doit rejouer. */
export const PAGE_LENTE = '/p/1';
