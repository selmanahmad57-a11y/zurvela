/**
 * Contrat de sortie du profilage : un schéma DÉRIVÉ de `config/profilage.json`
 * (constitution §2 — le code ne connaît aucun type de site) et sa validation
 * Ajv.
 *
 * Trois responsabilités qu'il ne faut pas confondre :
 *  - la VÉRIFICATION locale (`schemaValidationProfil`) : la forme complète,
 *    motif de langue et bornes de confiance comprises, passée à Ajv au retour ;
 *  - le CONTRAT envoyé au modèle (`schemaContratModele`) : le même contrat
 *    restreint au sous-ensemble de JSON Schema que les sorties structurées
 *    acceptent. Envoyer le premier à la place du second, c'était soit un refus
 *    de la requête, soit un contrat « fermé » qui ne ferme rien ;
 *  - les INVARIANTS du produit (une confiance ne dépasse jamais 1, la valeur
 *    d'échappement s'accompagne d'une description libre) : en code, parce
 *    qu'une borne que le produit ne doit jamais franchir n'est pas un réglage.
 *
 * SÉCURITÉ (constitution §3) : un constat d'invalidité ne reproduit JAMAIS la
 * donnée reçue. La réponse du modèle a pu être contaminée par une injection
 * du contenu de page ; la recopier dans la relance réinjecterait l'attaque.
 * Tout ce qui sort d'ici vient du CONTRAT, jamais de la réponse.
 */
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { ConfigProfilage } from '../scanner/config.js';

/**
 * Ajv dédié : le schéma du profil est construit à la volée depuis la config
 * (un objet neuf par client), il n'a pas de `$id` et n'a donc rien à faire
 * dans le cache partagé des schémas de fichiers.
 */
const ajv = new Ajv({ allErrors: true, strict: true });

/**
 * Champs que le MODÈLE produit. L'estampille de provenance
 * (`versionPrompt`, `modele`, `apresRelance`) n'est jamais demandée au
 * modèle : elle est apposée en code, sinon elle serait falsifiable par le
 * contenu de la page.
 */
const CHAMPS_DEMANDES = ['typeSite', 'natureLibre', 'langue', 'confiance'] as const;

/**
 * Forme d'une étiquette de langue (BCP 47) : standard technique universel,
 * donc en code (constitution §2 : le code peut connaître LE WEB). Sans elle,
 * `langue` serait une porte de sortie en texte libre dans un contrat censé
 * être fermé.
 */
const MOTIF_BCP47 = '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$';

/**
 * Résumé opérationnel d'une invalidité, pour le journal. STRUCTUREL : il ne
 * contient que des noms de champs du contrat et des mots-clés de défaut,
 * jamais la réponse fautive. Partagé par le profilage (4a) et la décision de
 * navigation (4b) — même règle, mêmes raisons.
 */
export function resumerConstats(version: string, constats: readonly ConstatInvalidite[]): string {
  const details = constats.map((constat) => `${constat.champ === '' ? 'reponse' : constat.champ}:${constat.defaut}`);
  return `${version} ${details.join(' ')}`;
}

/** Un défaut STRUCTUREL de la réponse : issu du contrat, jamais de la donnée reçue. */
export interface ConstatInvalidite {
  /** Champ du contrat concerné ; chaîne vide pour la réponse entière. */
  champ: string;
  /** Nature du défaut (mot-clé de schéma ou invariant du contrat). */
  defaut: string;
  /** Ce que le CONTRAT attendait — jamais ce qui a été reçu. */
  attendu?: string;
}

export type ResultatValidation =
  | { valide: true; valeur: ProfilDemande }
  | { valide: false; constats: ConstatInvalidite[] };

/** Les quatre champs produits par le modèle, une fois validés. */
export interface ProfilDemande {
  typeSite: string;
  natureLibre: string | null;
  langue: string;
  confiance: number;
}

export interface ValidateurProfil {
  /** Le schéma COMPLET, vérifié par Ajv au retour (bornes et motif compris). */
  schemaValidation: Record<string, unknown>;
  /** Le schéma RESTREINT, envoyé au modèle comme contrat de sortie structurée. */
  schemaContratModele: Record<string, unknown>;
  /** Valide un TEXTE brut de réponse (JSON attendu). */
  valider(texteReponse: string): ResultatValidation;
}

/**
 * Mots-clés de JSON Schema admis par les sorties structurées. La liste est
 * EXPLICITE et vérifiée par un test récursif : c'est l'apprentissage n°5
 * appliqué au contrat de sortie — un schéma que rien n'exécute avant le
 * premier appel réel n'est pas vérifié, et le typecheck ne peut rien en dire
 * (tout est `Record<string, unknown>`).
 *
 * Notablement ABSENTS, parce que la documentation les donne comme non
 * supportés : `minimum`, `maximum`, `multipleOf`, `pattern`, `minLength`,
 * `maxLength`. Et `type` doit être une CHAÎNE : la forme tableau
 * (`['string', 'null']`) n'appartient pas au sous-ensemble, où l'union
 * s'écrit `anyOf`.
 */
export const MOTS_CLES_CONTRAT_MODELE = [
  'type',
  'enum',
  'const',
  'anyOf',
  'allOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  '$ref',
  '$defs',
] as const;

/**
 * Le schéma de VALIDATION, dérivé du vocabulaire de config. Étendre
 * `typesSite` dans `config/profilage.json` suffit : aucune ligne de code ne
 * change.
 *
 * Il décrit la FORME seule (pas la cohérence entre `typeSite` et
 * `natureLibre`, invariant vérifié en code juste après), et il porte les
 * contraintes fines — motif BCP 47, bornes de la confiance. Elles restent
 * ICI, du côté qui VÉRIFIE : c'est la vérification locale qui borne une
 * confiance déclarée, et elle ne délègue rien au serveur.
 */
export function schemaValidationProfil(config: ConfigProfilage): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_DEMANDES],
    properties: {
      typeSite: { type: 'string', enum: [...config.typesSite] },
      natureLibre: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      langue: { type: 'string', pattern: MOTIF_BCP47 },
      // 0 et 1 sont les bornes d'une probabilité : un invariant, pas un réglage.
      confiance: { type: 'number', minimum: 0, maximum: 1 },
    },
  };
}

/**
 * Le schéma envoyé au MODÈLE (`output_config.format`). Même contrat, restreint
 * au sous-ensemble que les sorties structurées acceptent.
 *
 * Confondre les deux usages avait deux conséquences, et aucune n'était
 * visible : le schéma partait avec un `enum` sans `type` (refusé), et avec
 * `pattern`, `minimum`, `maximum` — soit une requête rejetée, soit un contrat
 * « fermé » dont les contraintes ne sont pas appliquées côté serveur. Les
 * contraintes retirées ne disparaissent pas : elles restent dites en toutes
 * lettres dans le contrat de sortie TEXTUEL du prompt, et vérifiées par Ajv au
 * retour.
 */
export function schemaContratModele(config: ConfigProfilage): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_DEMANDES],
    properties: {
      typeSite: { type: 'string', enum: [...config.typesSite] },
      natureLibre: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      langue: { type: 'string' },
      confiance: { type: 'number' },
    },
  };
}

export function creerValidateurProfil(config: ConfigProfilage): ValidateurProfil {
  const schemaValidation = schemaValidationProfil(config);
  const valideForme = ajv.compile(schemaValidation) as ValidateFunction<ProfilDemande>;
  const proprietesAutorisees = CHAMPS_DEMANDES.join(', ');

  return {
    schemaValidation,
    schemaContratModele: schemaContratModele(config),
    valider(texteReponse) {
      let analyse: unknown;
      try {
        analyse = JSON.parse(texteReponse);
      } catch {
        // Réponse non analysable (prose, bloc de code, génération tronquée par
        // `maxTokensReponse`). On ne dit PAS ce qui a été reçu.
        return { valide: false, constats: [{ champ: '', defaut: 'reponseNonJson', attendu: 'un unique objet JSON' }] };
      }
      if (!valideForme(analyse)) {
        return { valide: false, constats: enConstats(valideForme.errors, proprietesAutorisees, config) };
      }
      const coherence = constatCoherence(analyse, config);
      if (coherence !== null) return { valide: false, constats: [coherence] };
      return { valide: true, valeur: analyse };
    },
  };
}

/**
 * INVARIANT de contrat : la valeur d'échappement s'accompagne d'une
 * description libre non vide, et toute autre valeur l'interdit. Une
 * échappatoire vide ne nourrit pas l'extension du vocabulaire — elle rend
 * juste le « je ne sais pas » gratuit.
 */
function constatCoherence(profil: ProfilDemande, config: ConfigProfilage): ConstatInvalidite | null {
  const echappement = profil.typeSite === config.valeurEchappement;
  const decrit = typeof profil.natureLibre === 'string' && profil.natureLibre.trim() !== '';
  if (echappement && !decrit) {
    return {
      champ: 'natureLibre',
      defaut: 'coherenceEchappement',
      attendu: `une description non vide lorsque typeSite vaut « ${config.valeurEchappement} »`,
    };
  }
  if (!echappement && profil.natureLibre !== null) {
    return {
      champ: 'natureLibre',
      defaut: 'coherenceEchappement',
      attendu: `null lorsque typeSite ne vaut pas « ${config.valeurEchappement} »`,
    };
  }
  return null;
}

/**
 * Traduit les erreurs Ajv en constats STRUCTURELS.
 *
 * Trois champs d'Ajv sont volontairement ignorés parce qu'ils proviennent de
 * la réponse et non du contrat : `data`, `params.additionalProperty` (un nom
 * de propriété INVENTÉ par le modèle, donc influençable par la page) et tout
 * `instancePath` qui ne désigne pas un champ connu du contrat.
 */
function enConstats(
  erreurs: ErrorObject[] | null | undefined,
  proprietesAutorisees: string,
  config: ConfigProfilage,
): ConstatInvalidite[] {
  const constats = new Map<string, ConstatInvalidite>();
  for (const erreur of erreurs ?? []) {
    const constat = enConstat(erreur, proprietesAutorisees, config);
    constats.set(`${constat.champ}|${constat.defaut}`, constat);
  }
  const liste = [...constats.values()];
  return liste.length > 0 ? liste : [{ champ: '', defaut: 'horsContrat', attendu: `les champs ${proprietesAutorisees}` }];
}

function enConstat(erreur: ErrorObject, proprietesAutorisees: string, config: ConfigProfilage): ConstatInvalidite {
  const champ = champSur(erreur);
  switch (erreur.keyword) {
    case 'required':
      return { champ: champRequis(erreur), defaut: 'champManquant' };
    case 'enum':
      return { champ, defaut: 'valeurHorsEnumeration', attendu: config.typesSite.join(', ') };
    case 'additionalProperties':
      return { champ: '', defaut: 'proprieteInconnue', attendu: `exactement les champs ${proprietesAutorisees}` };
    case 'pattern':
      return { champ, defaut: 'formeInvalide', attendu: 'une étiquette de langue BCP 47' };
    case 'minimum':
    case 'maximum':
      return { champ, defaut: 'horsBornes', attendu: 'un nombre entre 0 et 1' };
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
