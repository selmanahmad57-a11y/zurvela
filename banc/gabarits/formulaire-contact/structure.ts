/**
 * Repères STRUCTURELS du gabarit « formulaire-contact », partagés entre le
 * site sain, ses bugs injectables et ses tests : chemins d'URL, rôles
 * (`data-role`), noms de champs et marqueurs de bloc. Aucun texte visible.
 */
import type { SelecteurBalise } from '../../outils/transformations.js';

export const PREFIXE_STATIQUE = '/statique';
export const CHEMIN_API_FORMULAIRE = '/api/contact';
export const CHEMIN_SCRIPT_FORMULAIRE = `${PREFIXE_STATIQUE}/formulaire.js`;
export const CHEMIN_LOGO = `${PREFIXE_STATIQUE}/images/logo.svg`;

export const PAGE_ACCUEIL = '/';
export const PAGE_CONTACT = '/contact';
export const PAGE_CONFIRMATION = '/confirmation';

/** Champs du formulaire que le backend exige non vides. */
export const CHAMPS_FORMULAIRE = ['nom', 'email', 'message'] as const;

/** Nom du bloc de formulaire.js qui rend l'échec visible et débloque le bouton. */
export const BLOC_GESTION_ERREUR = 'gestion-erreur';

export const SELECTEUR_BOUTON_ENVOYER: SelecteurBalise = { balise: 'button', attribut: 'data-role', valeur: 'envoyer' };
export const SELECTEUR_LOGO: SelecteurBalise = { balise: 'img', attribut: 'data-role', valeur: 'logo' };
export const SELECTEUR_ZONE_ENVOI: SelecteurBalise = { balise: 'div', attribut: 'data-role', valeur: 'zone-envoi' };
