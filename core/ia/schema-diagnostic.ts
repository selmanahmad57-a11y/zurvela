/**
 * Contrat de sortie d'un diagnostic : un schéma FERMÉ sur les trois avis, et
 * sa validation Ajv.
 *
 * Même partage des rôles qu'au profilage et à la navigation, et pour les mêmes
 * raisons :
 *  - `schemaValidationDiagnostic` VÉRIFIE localement, au retour ;
 *  - `schemaContratModeleDiagnostic` est envoyé au modèle, restreint au
 *    sous-ensemble de JSON Schema qu'acceptent les sorties structurées.
 *
 * ── `indetermine` N'EST PAS UNE ERREUR ──────────────────────────────────────
 *
 * Il est une valeur du contrat, au même rang que les deux autres : le schéma
 * ne le distingue pas, la validation ne le pénalise pas, et aucune branche de
 * ce module ne le nomme. C'est volontaire et c'est le cœur de la brique — un
 * diagnostic qui répond toujours `outil` ou `site` devant un journal
 * indécidable fabrique de la certitude, exactement ce que le produit ne doit
 * jamais faire devant un commerçant. Une garde qui traiterait l'aveu comme un
 * défaut transformerait la bonne réponse en panne.
 *
 * ── SÉCURITÉ (constitution §3) ──────────────────────────────────────────────
 *
 * Un constat d'invalidité ne reproduit JAMAIS la réponse reçue. Elle a pu être
 * contaminée par une injection venue du journal — qui transporte des chaînes
 * de la page —, et la recopier dans la relance réinjecterait l'attaque. Tout
 * ce qui sort d'ici vient du CONTRAT : les trois avis sont écrits en code,
 * jamais lus dans une réponse.
 */
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { AvisCause } from './index.js';
import type { ConstatInvalidite } from './schema-profil.js';

/**
 * Ajv dédié : le schéma du diagnostic n'a pas de `$id` et n'a rien à faire
 * dans le cache partagé des schémas de fichiers.
 */
const ajv = new Ajv({ allErrors: true, strict: true });

/**
 * Table EXHAUSTIVE des avis. Écrite en `Record<AvisCause, …>` et non en
 * tableau : le compilateur exige alors une entrée par valeur de l'union, donc
 * un quatrième avis ajouté au contrat CASSE la compilation ICI — à l'endroit
 * précis où il doit être traité (schéma, prompt, table de traduction) plutôt
 * que de se glisser dans le produit en étant partout ignoré.
 *
 * La valeur porte le rang d'affichage : il fixe l'ordre des instructions, du
 * contrat de sortie et de l'énumération du schéma, en une seule source. Un
 * ordre qui se déciderait à trois endroits dériverait, et la clé de cassette
 * — qui hache le texte du prompt à travers son empreinte de contrat — en
 * porterait la dérive.
 */
const RANG_AVIS: Record<AvisCause, number> = { outil: 0, site: 1, indetermine: 2 };

/** Les avis admis, dans l'ordre canonique. SEULE source de cette liste. */
export const AVIS_ADMIS: readonly AvisCause[] = (Object.keys(RANG_AVIS) as AvisCause[]).sort(
  (gauche, droite) => RANG_AVIS[gauche] - RANG_AVIS[droite],
);

/**
 * L'AVEU, nommé une fois.
 *
 * Il est nommé parce que le prompt doit pouvoir en parler : rendre l'aveu
 * honorable demande de le désigner en toutes lettres, et le désigner par sa
 * position dans la liste serait un piège à la première réorganisation.
 *
 * Il n'est nommé QUE pour cela. Aucune logique de ce dépôt ne compare un avis
 * à cette constante, et c'est éprouvé : `indetermine` est une valeur du
 * contrat comme les deux autres, jamais un cas particulier, jamais une erreur.
 * Le jour où une branche de code aurait besoin de le distinguer, c'est la
 * table de traduction — et elle seule — qui le ferait, en le traduisant comme
 * elle traduit les deux autres.
 */
export const AVIS_AVEU: AvisCause = 'indetermine';

/** Les deux champs produits par le modèle. La provenance est apposée en code, jamais demandée. */
const CHAMPS_DEMANDES = ['avis', 'justification'] as const;

/** Défaut STRUCTUREL d'un avis rendu hors des trois valeurs du contrat. */
export const DEFAUT_AVIS_HORS_ENUMERATION = 'valeurHorsEnumeration';

/** Défaut STRUCTUREL d'une justification vide : un avis sans motif ne motive rien. */
export const DEFAUT_JUSTIFICATION_VIDE = 'justificationVide';

/** Les deux champs produits par le modèle, une fois validés. */
export interface DiagnosticDemande {
  avis: AvisCause;
  /** Prose TERMINALE : journalisée, lue par rien (même statut que `natureLibre`). */
  justification: string;
}

export type ResultatValidationDiagnostic =
  | { valide: true; valeur: DiagnosticDemande }
  | { valide: false; constats: ConstatInvalidite[] };

export interface ValidateurDiagnostic {
  /** Le schéma COMPLET, vérifié par Ajv au retour. */
  schemaValidation: Record<string, unknown>;
  /** Le schéma RESTREINT, envoyé au modèle comme contrat de sortie structurée. */
  schemaContratModele: Record<string, unknown>;
  valider(texteReponse: string): ResultatValidationDiagnostic;
}

/**
 * Le schéma de VALIDATION. L'énumération EST le contrat : le modèle n'a aucun
 * champ où écrire une quatrième cause, ni une nuance, ni un degré. Il n'y a
 * pas de champ de confiance non plus — un avis n'est pas une preuve, et lui
 * demander de chiffrer sa propre certitude fabriquerait un nombre que rien ne
 * mesure. Le doute reste visible autrement : par `apresRelance` dans la
 * provenance, et par le facteur de minoration appliqué en aval.
 */
export function schemaValidationDiagnostic(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_DEMANDES],
    properties: {
      avis: { type: 'string', enum: [...AVIS_ADMIS] },
      justification: { type: 'string' },
    },
  };
}

/**
 * Le schéma envoyé au MODÈLE. Identique au schéma de validation : `type`,
 * `enum`, `properties`, `required` et `additionalProperties` appartiennent
 * tous au sous-ensemble accepté par les sorties structurées.
 *
 * Les deux fonctions restent DISTINCTES malgré tout : elles n'ont pas la même
 * raison de changer, et les confondre est exactement le défaut que la brique
 * 4a a payé. L'invariant de justification non vide, lui, ne peut pas voyager
 * dans le schéma du modèle (`minLength` n'appartient pas au sous-ensemble) :
 * il est dit en toutes lettres dans le contrat textuel du prompt et vérifié
 * ici, au retour.
 */
export function schemaContratModeleDiagnostic(): Record<string, unknown> {
  return schemaValidationDiagnostic();
}

export function creerValidateurDiagnostic(): ValidateurDiagnostic {
  const schemaValidation = schemaValidationDiagnostic();
  const valideForme = ajv.compile(schemaValidation) as ValidateFunction<DiagnosticDemande>;
  const proprietesAutorisees = CHAMPS_DEMANDES.join(', ');

  return {
    schemaValidation,
    schemaContratModele: schemaContratModeleDiagnostic(),
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
        return { valide: false, constats: enConstats(valideForme.errors, proprietesAutorisees) };
      }
      const vide = constatJustification(analyse);
      if (vide !== null) return { valide: false, constats: [vide] };
      return { valide: true, valeur: analyse };
    },
  };
}

/**
 * INVARIANT de contrat : la justification n'est jamais vide.
 *
 * Il s'applique aux TROIS avis de la même façon — ce n'est pas une pénalité
 * sur l'aveu. Mais c'est sur l'aveu qu'il compte le plus : toute la valeur
 * d'un `indetermine` est de rendre le silence MOTIVÉ, et un `indetermine` sans
 * phrase rend un silence exactement aussi muet que celui d'avant la brique.
 * C'est le même geste que l'échappatoire du profilage, qui exige sa
 * description : une porte de sortie gratuite est une porte de sortie qu'on
 * prend par paresse.
 */
function constatJustification(diagnostic: DiagnosticDemande): ConstatInvalidite | null {
  if (diagnostic.justification.trim() !== '') return null;
  return {
    champ: 'justification',
    defaut: DEFAUT_JUSTIFICATION_VIDE,
    attendu: 'une phrase non vide, quel que soit l’avis rendu',
  };
}

/**
 * Traduit les erreurs Ajv en constats STRUCTURELS. Comme ailleurs, les champs
 * d'Ajv qui proviennent de la RÉPONSE sont ignorés : `data`,
 * `params.additionalProperty` (un nom de propriété inventé par le modèle, donc
 * influençable par le journal) et tout `instancePath` étranger au contrat.
 */
function enConstats(erreurs: ErrorObject[] | null | undefined, proprietesAutorisees: string): ConstatInvalidite[] {
  const constats = new Map<string, ConstatInvalidite>();
  for (const erreur of erreurs ?? []) {
    const constat = enConstat(erreur, proprietesAutorisees);
    constats.set(`${constat.champ}|${constat.defaut}`, constat);
  }
  const liste = [...constats.values()];
  return liste.length > 0 ? liste : [{ champ: '', defaut: 'horsContrat', attendu: `les champs ${proprietesAutorisees}` }];
}

function enConstat(erreur: ErrorObject, proprietesAutorisees: string): ConstatInvalidite {
  const champ = champSur(erreur);
  switch (erreur.keyword) {
    case 'required':
      return { champ: champRequis(erreur), defaut: 'champManquant' };
    case 'enum':
      // Les trois avis viennent du CONTRAT : les rappeler ne réinjecte rien.
      return { champ, defaut: DEFAUT_AVIS_HORS_ENUMERATION, attendu: AVIS_ADMIS.join(', ') };
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
