/**
 * Contrat de sortie d'une décision de navigation : un schéma DÉRIVÉ de
 * l'énumération reçue, et sa validation Ajv.
 *
 * C'est ici que la RÈGLE CENTRALE de la brique devient mécanique. Le moteur
 * énumère des identifiants opaques ; le contrat n'accepte que ceux-là. Un
 * `actionId` hors liste n'est donc pas « une action inattendue à filtrer
 * ensuite » : c'est une réponse HORS SCHÉMA, traitée exactement comme un
 * champ manquant — relance structurelle puis indisponibilité. Le modèle n'a
 * aucun champ où écrire un sélecteur, une URL ou un texte d'action : il ne
 * peut pas inventer un acte, seulement élire parmi ceux que le moteur a déjà
 * jugés légitimes.
 *
 * Même partage des rôles qu'au profilage, et pour les mêmes raisons :
 *  - `schemaValidationDecision` VÉRIFIE localement, au retour ;
 *  - `schemaContratModeleDecision` est envoyé au modèle, restreint au
 *    sous-ensemble de JSON Schema qu'acceptent les sorties structurées.
 *
 * SÉCURITÉ (constitution §3) : un constat d'invalidité ne reproduit JAMAIS la
 * réponse reçue. Elle a pu être contaminée par une injection du contenu de
 * page — les libellés sont précisément la surface par laquelle la page parle
 * au modèle —, et la recopier dans la relance réinjecterait l'attaque. Tout ce
 * qui sort d'ici vient du CONTRAT : les identifiants énumérés sont attribués
 * par le moteur, jamais lus dans une réponse.
 */
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { RAISON_ACTION_INCONNUE, RAISON_DECISION_INVALIDE } from './index.js';
import type { ConstatInvalidite } from './schema-profil.js';

/**
 * Ajv dédié : le schéma d'une décision est construit à la volée depuis
 * l'énumération du moment (un objet neuf à chaque point de décision), il n'a
 * pas de `$id` et n'a donc rien à faire dans le cache partagé des schémas de
 * fichiers.
 */
const ajv = new Ajv({ allErrors: true, strict: true });

/** Les deux champs produits par le modèle. La provenance est apposée en code, jamais demandée. */
const CHAMPS_DEMANDES = ['actionId', 'raison'] as const;

/** Défaut STRUCTUREL d'un identifiant élu hors de l'énumération. */
export const DEFAUT_ACTION_INCONNUE = 'valeurHorsEnumeration';

/** Les deux champs produits par le modèle, une fois validés. */
export interface DecisionDemandee {
  actionId: string;
  /** Prose TERMINALE : journalisée, lue par rien (même statut que `natureLibre`). */
  raison: string | null;
}

export type ResultatValidationDecision =
  | { valide: true; valeur: DecisionDemandee }
  | { valide: false; constats: ConstatInvalidite[] };

export interface ValidateurDecision {
  /** Le schéma COMPLET, vérifié par Ajv au retour. */
  schemaValidation: Record<string, unknown>;
  /** Le schéma RESTREINT, envoyé au modèle comme contrat de sortie structurée. */
  schemaContratModele: Record<string, unknown>;
  /** Les identifiants admis, dans leur ordre canonique : le prompt les affiche. */
  identifiants: readonly string[];
  valider(texteReponse: string): ResultatValidationDecision;
}

/**
 * Le schéma de VALIDATION. L'énumération des identifiants EST le contrat :
 * aucune valeur d'action ne vit en code ni en config (constitution §2), elle
 * est construite à chaque décision par le moteur.
 */
export function schemaValidationDecision(identifiants: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_DEMANDES],
    properties: {
      actionId: { type: 'string', enum: [...identifiants] },
      raison: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  };
}

/**
 * Le schéma envoyé au MODÈLE. Il est ici identique au schéma de validation :
 * `type`, `enum`, `anyOf`, `properties`, `required` et `additionalProperties`
 * appartiennent tous au sous-ensemble accepté par les sorties structurées —
 * le contrat d'une décision n'a besoin d'aucune contrainte fine (ni motif, ni
 * borne numérique). Les deux fonctions restent DISTINCTES malgré tout : elles
 * n'ont pas la même raison de changer, et les confondre est exactement le
 * défaut que la brique 4a a payé.
 */
export function schemaContratModeleDecision(identifiants: readonly string[]): Record<string, unknown> {
  return schemaValidationDecision(identifiants);
}

/**
 * Validateur d'une élection.
 *
 * Une énumération VIDE est traitée à part : on ne compile pas un `enum: []`
 * (Ajv le refuse, et le contrat n'aurait de toute façon aucune valeur
 * admissible). Demander une décision sans action à proposer est un défaut de
 * l'appelant ; le validateur le dit structurellement plutôt que de laisser
 * remonter une exception de compilation de schéma au milieu d'un scan.
 */
export function creerValidateurDecision(identifiants: readonly string[]): ValidateurDecision {
  const schemaValidation = schemaValidationDecision(identifiants);
  const schemaContratModele = schemaContratModeleDecision(identifiants);
  const proprietesAutorisees = CHAMPS_DEMANDES.join(', ');

  if (identifiants.length === 0) {
    return {
      schemaValidation,
      schemaContratModele,
      identifiants: [],
      valider: () => ({
        valide: false,
        constats: [{ champ: 'actionId', defaut: DEFAUT_ACTION_INCONNUE, attendu: 'aucune action énumérée' }],
      }),
    };
  }

  const valideForme = ajv.compile(schemaValidation) as ValidateFunction<DecisionDemandee>;

  return {
    schemaValidation,
    schemaContratModele,
    identifiants: [...identifiants],
    valider(texteReponse) {
      let analyse: unknown;
      try {
        analyse = JSON.parse(texteReponse);
      } catch {
        // Réponse non analysable (prose, bloc de code, génération tronquée).
        // On ne dit PAS ce qui a été reçu.
        return { valide: false, constats: [{ champ: '', defaut: 'reponseNonJson', attendu: 'un unique objet JSON' }] };
      }
      if (!valideForme(analyse)) {
        return { valide: false, constats: enConstats(valideForme.errors, proprietesAutorisees, identifiants) };
      }
      return { valide: true, valeur: analyse };
    },
  };
}

/**
 * Raison technique STABLE d'une invalidité, une fois les relances épuisées.
 *
 * Deux causes très différentes partagent le symptôme « la réponse ne valide
 * pas » : le modèle a élu hors du menu, ou il n'a pas respecté la forme. Les
 * confondre ferait accuser l'élection quand la vraie cause est un JSON coupé —
 * un diagnostic faux est cru (APPRENTISSAGES n°6). L'élection hors menu prime,
 * parce que c'est elle qui a une portée de sécurité.
 */
export function raisonInvaliditeDecision(constats: readonly ConstatInvalidite[]): string {
  const horsMenu = constats.some(
    (constat) => constat.champ === 'actionId' && constat.defaut === DEFAUT_ACTION_INCONNUE,
  );
  return horsMenu ? RAISON_ACTION_INCONNUE : RAISON_DECISION_INVALIDE;
}

/**
 * Traduit les erreurs Ajv en constats STRUCTURELS. Comme au profilage, les
 * champs d'Ajv qui proviennent de la RÉPONSE sont ignorés : `data`,
 * `params.additionalProperty` (un nom de propriété inventé par le modèle, donc
 * influençable par la page) et tout `instancePath` étranger au contrat.
 */
function enConstats(
  erreurs: ErrorObject[] | null | undefined,
  proprietesAutorisees: string,
  identifiants: readonly string[],
): ConstatInvalidite[] {
  const constats = new Map<string, ConstatInvalidite>();
  for (const erreur of erreurs ?? []) {
    const constat = enConstat(erreur, proprietesAutorisees, identifiants);
    constats.set(`${constat.champ}|${constat.defaut}`, constat);
  }
  const liste = [...constats.values()];
  return liste.length > 0 ? liste : [{ champ: '', defaut: 'horsContrat', attendu: `les champs ${proprietesAutorisees}` }];
}

function enConstat(
  erreur: ErrorObject,
  proprietesAutorisees: string,
  identifiants: readonly string[],
): ConstatInvalidite {
  const champ = champSur(erreur);
  switch (erreur.keyword) {
    case 'required':
      return { champ: champRequis(erreur), defaut: 'champManquant' };
    case 'enum':
      // Les identifiants viennent du MOTEUR : les rappeler ne réinjecte rien.
      return { champ, defaut: DEFAUT_ACTION_INCONNUE, attendu: identifiants.join(', ') };
    case 'additionalProperties':
      return { champ: '', defaut: 'proprieteInconnue', attendu: `exactement les champs ${proprietesAutorisees}` };
    default:
      return { champ, defaut: 'typeInvalide' };
  }
}

/** Le champ désigné, s'il appartient au contrat ; sinon la racine. */
function champSur(erreur: ErrorObject): string {
  const nom = erreur.instancePath.replace(/^\//, '');
  return (CHAMPS_DEMANDES as readonly string[]).includes(nom) ? nom : '';
}

/** Le nom manquant vient de `required`, donc du CONTRAT : il est sûr. */
function champRequis(erreur: ErrorObject): string {
  const params = erreur.params as { missingProperty?: unknown };
  const nom = typeof params.missingProperty === 'string' ? params.missingProperty : '';
  return (CHAMPS_DEMANDES as readonly string[]).includes(nom) ? nom : '';
}
