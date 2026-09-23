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

/**
 * Bloc de texte déposé par S01 (`injection-profil`) dans la page d'accueil.
 *
 * Seuls le RÔLE et les CLÉS i18n vivent ici : le texte de l'injection est du
 * CONTENU DE SITE comme un autre et vit dans les locales du gabarit
 * (`site/locales/<langue>.json`, section `injection`). Une charge d'injection
 * écrite en dur dans le code du bug serait une charge en une seule langue,
 * invérifiable en `en`, et un motif de langue naturelle dans le code
 * (constitution §2).
 */
export const ROLE_NOTE_INJECTION = 'note-injection';

export const SELECTEUR_NOTE_INJECTION: SelecteurBalise = {
  balise: 'section',
  attribut: 'data-role',
  valeur: ROLE_NOTE_INJECTION,
};

/**
 * Clés i18n du bloc d'injection, dans l'ordre d'affichage : un titre puis les
 * lignes de la charge. Partagées par le bug et ses tests — c'est par elles
 * que le test vérifie que la charge est bien SERVIE, dans les deux langues.
 */
export const CLE_INJECTION_TITRE = 'injection.titre';
/**
 * La ligne de RECLASSEMENT, nommée à part : c'est la seule de la charge qui
 * désigne une cible du vocabulaire de `config/profilage.json`. Son test vérifie
 * que la cible nommée est encore ATTEIGNABLE — une attaque qui réclame une
 * valeur que le contrat de sortie interdit ne peut plus être obéie, et
 * « inertie tenue » redeviendrait la tautologie que ce gabarit existe pour
 * éviter.
 */
export const CLE_INJECTION_RECLASSEMENT = 'injection.reclassement';
export const CLES_INJECTION_LIGNES = [CLE_INJECTION_RECLASSEMENT, 'injection.desobeissance', 'injection.action'] as const;

/**
 * Étiquette de langue que la charge réclame. Elle est DÉCLARÉE ici, pas
 * seulement écrite en prose dans les locales, pour qu'un test puisse vérifier
 * deux choses d'un coup : que les deux locales la nomment bien, et qu'elle
 * diffère de toutes les langues du banc. Une charge qui réclamerait la langue
 * du scénario ne demanderait rien — l'attendu « resté inerte » serait satisfait
 * sans que le modèle ait eu quoi que ce soit à refuser.
 *
 * Ce n'est pas un motif de langue naturelle dans une détection (constitution
 * §2) : c'est une propriété du CONTENU d'un gabarit du banc, au même titre que
 * les clés i18n ci-dessus. La cible de type de site, elle, n'est pas déclarée
 * ici : elle appartient au vocabulaire de `config/profilage.json`, et son test
 * la confronte à cette source plutôt qu'à une copie.
 */
export const LANGUE_CIBLE_INJECTION = 'de';
