/**
 * Contrat de sortie de la RÉDACTION : un schéma dérivé de l'énumération des
 * sections, et sa validation Ajv.
 *
 * C'est ici que la règle maîtresse de la brique 5 devient MÉCANIQUE, par deux
 * verrous indépendants :
 *
 *  1. **L'ÉNUMÉRATION.** Le moteur attribue les identifiants de section ; le
 *     contrat n'accepte que ceux-là, exactement une fois chacun, dans l'ordre.
 *     Le modèle ne peut donc ni inventer une section, ni en omettre une, ni en
 *     dupliquer une : la bijection entre les sections rédigées et les
 *     anomalies retenues n'est pas vérifiée après coup, elle est impossible à
 *     rompre. C'est la brique 4b appliquée à la rédaction.
 *
 *  2. **L'ABSENCE DE CHIFFRE.** Aucun champ de prose ne peut contenir un
 *     chiffre. Le modèle n'a déjà aucun champ où écrire un fait — pas de
 *     gravité, pas de statut, pas de compte — mais il pourrait en glisser un
 *     dans une phrase, et un rapport qui afficherait deux chiffres
 *     contradictoires détruirait la confiance dans les deux. Ce verrou-ci est
 *     le seul des deux que le modèle puisse réellement faire tomber : c'est
 *     donc le seul qui MESURE quelque chose.
 *
 * ── CE QUE LE VERROU DES CHIFFRES N'ATTRAPE PAS, ET QUI EST DIT ─────────────
 *
 * Il attrape les chiffres écrits en chiffres, dans toutes les écritures
 * Unicode (`\p{Nd}`). Il n'attrape PAS un nombre écrit en toutes lettres
 * (« deux pages ») : aucune expression régulière ne le ferait dans toutes les
 * langues, et une garde qui prétendrait le faire serait fausse dans la
 * plupart. Le prompt l'interdit explicitement ; la revue le lit. Une garde
 * partielle est utile tant qu'elle ne se fait pas passer pour totale.
 *
 * SÉCURITÉ (constitution §3) : un constat d'invalidité ne reproduit JAMAIS la
 * réponse reçue. Elle a pu être contaminée par un chemin d'URL rédigé pour
 * nous parler, et la recopier dans la relance réinjecterait l'attaque. Tout ce
 * qui sort d'ici vient du CONTRAT.
 */
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { ProseSection, Redaction } from './index.js';
import type { ConstatInvalidite } from './schema-profil.js';

/**
 * Ajv dédié : le schéma d'une rédaction est construit à la volée depuis
 * l'énumération des sections du scan, il n'a pas de `$id` et n'a rien à faire
 * dans le cache partagé des schémas de fichiers.
 */
const ajv = new Ajv({ allErrors: true, strict: true });

/**
 * Les champs de PROSE demandés au modèle, dans l'ordre du contrat.
 *
 * Ils vivent ici parce qu'ils composent à la fois le prompt, le schéma de
 * sortie et l'empreinte de contrat de la clé de cassette : trois copies
 * dériveraient, et c'est la copie oubliée qui porterait le champ manquant.
 */
export const CHAMPS_PROSE_SECTION = ['titre', 'constat', 'impact', 'actionSuggeree'] as const;
export const CHAMPS_PROSE_GLOBAUX = ['synthese', 'ligneMethode'] as const;

/** Champs d'une entrée de section : l'identifiant élu, puis la prose. */
const CHAMPS_SECTION = ['sectionId', ...CHAMPS_PROSE_SECTION] as const;
/** Champs de l'objet racine. */
const CHAMPS_RACINE = [...CHAMPS_PROSE_GLOBAUX, 'sections'] as const;

/** Défaut STRUCTUREL d'un identifiant de section hors énumération. */
export const DEFAUT_SECTION_INCONNUE = 'valeurHorsEnumeration';
/** Défaut STRUCTUREL d'une prose qui porte un chiffre : le fait que le modèle n'a pas le droit d'écrire. */
export const DEFAUT_PROSE_CHIFFREE = 'proseChiffree';
/** Défaut STRUCTUREL d'une prose vide : un champ rendu vide n'est pas une rédaction. */
export const DEFAUT_PROSE_VIDE = 'proseVide';
/** Défaut STRUCTUREL d'une bijection rompue (section manquante, dupliquée ou hors ordre). */
export const DEFAUT_SECTIONS_NON_BIJECTIVES = 'sectionsNonBijectives';

/**
 * Tout chiffre DÉCIMAL, dans n'importe quelle écriture Unicode. `\p{Nd}`
 * plutôt que `[0-9]` : un rapport peut être rédigé en arabe ou en hindi, et
 * une garde qui ne connaîtrait que les chiffres latins serait une garde qui
 * s'éteint précisément dans les langues où personne ne la relira.
 */
const CHIFFRE = /\p{Nd}/u;

export type ResultatValidationRedaction =
  | { valide: true; valeur: Redaction }
  | { valide: false; constats: ConstatInvalidite[] };

export interface ValidateurRedaction {
  /** Le schéma COMPLET, vérifié par Ajv au retour. */
  schemaValidation: Record<string, unknown>;
  /** Le schéma RESTREINT, envoyé au modèle comme contrat de sortie structurée. */
  schemaContratModele: Record<string, unknown>;
  /** Les identifiants admis, dans leur ordre canonique : le prompt les affiche. */
  identifiants: readonly string[];
  valider(texteReponse: string): ResultatValidationRedaction;
}

function proprietesSection(identifiants: readonly string[]): Record<string, unknown> {
  const prose = Object.fromEntries(CHAMPS_PROSE_SECTION.map((champ) => [champ, { type: 'string' }]));
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_SECTION],
    properties: { sectionId: { type: 'string', enum: [...identifiants] }, ...prose },
  };
}

/**
 * Le schéma de VALIDATION. `minItems`/`maxItems` fixent le nombre exact de
 * sections attendues : la bijection est déjà à moitié tenue par le schéma, et
 * l'autre moitié — chaque identifiant une fois et une seule — est vérifiée
 * juste après, parce que `uniqueItems` porterait sur des objets entiers et ne
 * dirait rien des identifiants.
 */
export function schemaValidationRedaction(identifiants: readonly string[]): Record<string, unknown> {
  const globaux = Object.fromEntries(CHAMPS_PROSE_GLOBAUX.map((champ) => [champ, { type: 'string' }]));
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_RACINE],
    properties: {
      ...globaux,
      sections: {
        type: 'array',
        minItems: identifiants.length,
        maxItems: identifiants.length,
        items: proprietesSection(identifiants),
      },
    },
  };
}

/**
 * Le schéma envoyé au MODÈLE — un SOUS-ENSEMBLE du schéma de validation, et
 * c'est ici que la distinction entre les deux cesse d'être théorique.
 *
 * Trois contraintes du schéma de validation n'appartiennent pas au
 * sous-ensemble accepté par les sorties structurées, et chacune est rejetée en
 * 400 par l'API :
 *  - `minItems` et `maxItems` sur le tableau des sections ;
 *  - `pattern`, qui aurait pu porter l'interdiction des chiffres.
 *
 * Ce qui RESTE dans le contrat du modèle est la moitié qui compte pour la
 * sécurité : l'`enum` des identifiants de section. Le modèle ne peut toujours
 * pas en inventer un. Ce qu'il peut encore faire — en omettre, en dupliquer,
 * les permuter, écrire un chiffre — est refusé au RETOUR, par
 * `constatsBijection` et `constatsProse`, avec relance structurelle puis
 * rapport sans prose.
 *
 * La brique 4a avait payé ce défaut en confondant les deux schémas ; la
 * brique 5 vient de le repayer en les recopiant l'un depuis l'autre. Les deux
 * fonctions restent DISTINCTES parce qu'elles n'ont pas la même raison de
 * changer : l'une décrit ce que le produit accepte, l'autre ce que le
 * fournisseur sait exprimer.
 */
export function schemaContratModeleRedaction(identifiants: readonly string[]): Record<string, unknown> {
  const globaux = Object.fromEntries(CHAMPS_PROSE_GLOBAUX.map((champ) => [champ, { type: 'string' }]));
  return {
    type: 'object',
    additionalProperties: false,
    required: [...CHAMPS_RACINE],
    properties: {
      ...globaux,
      sections: { type: 'array', items: proprietesSection(identifiants) },
    },
  };
}

export function creerValidateurRedaction(identifiants: readonly string[]): ValidateurRedaction {
  const schemaValidation = schemaValidationRedaction(identifiants);
  const schemaContratModele = schemaContratModeleRedaction(identifiants);
  const proprietesAutorisees = CHAMPS_RACINE.join(', ');

  // Aucune section à rédiger : on ne compile pas un `enum: []` (Ajv le refuse)
  // et il n'y a rien à demander. L'appelant ne doit pas appeler le modèle pour
  // un rapport sans anomalie — la garde le dit structurellement plutôt que de
  // laisser remonter une exception de compilation au milieu d'un scan.
  if (identifiants.length === 0) {
    return {
      schemaValidation,
      schemaContratModele,
      identifiants: [],
      valider: () => ({
        valide: false,
        constats: [{ champ: 'sections', defaut: DEFAUT_SECTION_INCONNUE, attendu: 'aucune section énumérée' }],
      }),
    };
  }

  const valideForme = ajv.compile(schemaValidation) as ValidateFunction<Redaction>;

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
      const constats = [...constatsBijection(analyse, identifiants), ...constatsProse(analyse)];
      return constats.length > 0 ? { valide: false, constats } : { valide: true, valeur: analyse };
    },
  };
}

/**
 * BIJECTION : chaque identifiant énuméré une fois et une seule, dans l'ordre.
 *
 * L'ordre compte autant que la présence. Il est celui du rapport — gravité
 * décroissante — et c'est celui dans lequel les faits ont été montrés : une
 * réponse qui le permute écrirait la prose d'une section en face des faits
 * d'une autre. Le schéma ne sait pas l'exprimer ; le code, si.
 */
function constatsBijection(redaction: Redaction, identifiants: readonly string[]): ConstatInvalidite[] {
  const rendus = redaction.sections.map((section) => section.sectionId);
  const conforme = rendus.length === identifiants.length && rendus.every((id, rang) => id === identifiants[rang]);
  return conforme
    ? []
    : [
        {
          champ: 'sections',
          defaut: DEFAUT_SECTIONS_NON_BIJECTIVES,
          // Les identifiants viennent du CONTRAT (le moteur les a attribués) :
          // les rappeler ne réinjecte rien.
          attendu: `exactement ces identifiants, une fois chacun et dans cet ordre : ${identifiants.join(', ')}`,
        },
      ];
}

/**
 * INVARIANTS de prose, appliqués à TOUS les champs de prose de la même façon :
 * jamais vide, jamais de chiffre.
 *
 * Un seul constat par défaut rencontré, et non un par champ fautif : le but
 * d'un constat est de faire corriger, pas de dresser un inventaire — et une
 * liste qui grandit avec le nombre de sections finirait par occuper la relance
 * entière.
 */
function constatsProse(redaction: Redaction): ConstatInvalidite[] {
  const valeurs: { champ: string; valeur: string }[] = [
    ...CHAMPS_PROSE_GLOBAUX.map((champ) => ({ champ, valeur: redaction[champ] })),
    ...redaction.sections.flatMap((section) => CHAMPS_PROSE_SECTION.map((champ) => ({ champ, valeur: section[champ] }))),
  ];
  const constats: ConstatInvalidite[] = [];
  if (valeurs.some((entree) => entree.valeur.trim() === '')) {
    constats.push({ champ: '', defaut: DEFAUT_PROSE_VIDE, attendu: 'chaque champ de prose non vide' });
  }
  // Les CHAMPS fautifs sont nommés — leurs NOMS, jamais leur contenu. Un
  // constat qui ne dit pas où est le défaut fait relancer à l'aveugle, et
  // laisse celui qui lit le journal deviner. Les noms de champs viennent du
  // contrat, pas de la réponse : les citer ne réinjecte rien.
  const chiffres = [...new Set(valeurs.filter((entree) => CHIFFRE.test(entree.valeur)).map((entree) => entree.champ))];
  if (chiffres.length > 0) {
    constats.push({
      champ: chiffres.join(', '),
      defaut: DEFAUT_PROSE_CHIFFREE,
      attendu: 'aucun chiffre dans la prose : les nombres sont posés par le moteur, à côté du texte',
    });
  }
  return constats;
}

/** Vrai si la valeur porte un chiffre décimal. Exportée pour être éprouvée directement. */
export function porteUnChiffre(valeur: string): boolean {
  return CHIFFRE.test(valeur);
}

/**
 * Traduit les erreurs Ajv en constats STRUCTURELS. Comme ailleurs, les champs
 * d'Ajv qui proviennent de la RÉPONSE sont ignorés : `data`,
 * `params.additionalProperty` (un nom de propriété inventé par le modèle) et
 * tout `instancePath` étranger au contrat.
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

const CHAMPS_CONNUS: readonly string[] = [...CHAMPS_RACINE, ...CHAMPS_SECTION];

function enConstat(erreur: ErrorObject, proprietesAutorisees: string, identifiants: readonly string[]): ConstatInvalidite {
  const champ = champSur(erreur);
  switch (erreur.keyword) {
    case 'required':
      return { champ: champRequis(erreur), defaut: 'champManquant' };
    case 'enum':
      return { champ: 'sectionId', defaut: DEFAUT_SECTION_INCONNUE, attendu: identifiants.join(', ') };
    case 'minItems':
    case 'maxItems':
      return {
        champ: 'sections',
        defaut: DEFAUT_SECTIONS_NON_BIJECTIVES,
        attendu: `exactement ${identifiants.length} section(s)`,
      };
    case 'additionalProperties':
      return { champ: '', defaut: 'proprieteInconnue', attendu: `exactement les champs ${proprietesAutorisees}` };
    default:
      return { champ, defaut: 'typeInvalide' };
  }
}

/**
 * Le champ désigné, s'il appartient au contrat ; sinon la racine. Le chemin
 * d'une erreur de section (`/sections/0/titre`) est réduit à son DERNIER
 * segment : le rang vient de la réponse, et un rang recopié serait une donnée
 * du modèle réinjectée dans la relance.
 */
function champSur(erreur: ErrorObject): string {
  const nom = erreur.instancePath.split('/').at(-1) ?? '';
  return CHAMPS_CONNUS.includes(nom) ? nom : '';
}

/** Le nom manquant vient de `required`, donc du CONTRAT : il est sûr. */
function champRequis(erreur: ErrorObject): string {
  const params = erreur.params as { missingProperty?: unknown };
  const nom = typeof params.missingProperty === 'string' ? params.missingProperty : '';
  return CHAMPS_CONNUS.includes(nom) ? nom : '';
}

/** Type-guard local : une entrée de section validée porte bien la forme attendue. */
export type SectionValidee = ProseSection;
