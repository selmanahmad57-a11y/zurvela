/**
 * Repères STRUCTURELS du gabarit « site-charge » (cahier P2-4, contrat 5).
 *
 * Il ne reproduit pas la SURFACE de la lourdeur — beaucoup de pages — mais
 * sa CAUSE : beaucoup de GROUPES à rejouer, et des rejeux coûteux. Un
 * gabarit « lourd » à trois groupes mesurerait la rapidité d'un petit site,
 * pas la saturation du budget de confirmation (APPRENTISSAGES n°30), et
 * c'est l'erreur que ce projet a commise quatre fois en une soirée.
 *
 * Son contrôle propre, vérifié par son test : SANS optimisation, il doit
 * SATURER — l'exploration s'arrête sur `reserve-confirmation`, et des
 * groupes restent jamais rejoués. Un gabarit qui ne sature pas ne mesure
 * rien de ce que P2-4 prétend corriger.
 */
export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_CONTACT = '/api/contact';
export const PAGE_ACCUEIL = '/';
/** Les pages du site, toutes servies par le même modèle : c'est leur NOMBRE qui compte. */
export const NB_PAGES = 8;
export const PAGES_RAYON = Array.from({ length: NB_PAGES }, (_, i) => `/rayon/${i + 1}`);
/** Le préfixe des ressources que Z01 fait manquer : une par groupe de cause. */
export const PREFIXE_MANQUANTE = `${PREFIXE_STATIQUE}/images/absente`;
