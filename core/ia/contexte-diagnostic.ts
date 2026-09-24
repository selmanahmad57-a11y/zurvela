/**
 * Normalisation DÉTERMINISTE du contexte d'un diagnostic.
 *
 * Même raison d'être que `etat-decision.ts` pour la navigation, et elle est
 * double par construction : le contexte normalisé est à la fois ce que le
 * prompt AFFICHE et ce que la clé de cassette HACHE. Les deux doivent être la
 * même chose, sans quoi une réponse figée pourrait être rejouée sur un prompt
 * différent de celui qui l'a produite — la bonne réponse du mauvais prompt.
 *
 * ── POURQUOI CE MODULE BORNE ALORS QUE L'APPELANT A DÉJÀ BORNÉ ──────────────
 *
 * `ContexteDiagnostic.extraits` est documenté « déjà tronqués ». La borne est
 * pourtant REFAITE ici, et ce n'est pas une redondance : une borne de sécurité
 * ne doit pas dépendre de la discipline de son appelant. C'est exactement la
 * correction que la revue de la brique 4b a imposée à la navigation, où seul
 * le libellé était borné pendant que le chemin d'un lien traversait intact.
 *
 * ── POURQUOI UN JOURNAL SE BORNE COMME UNE PAGE ─────────────────────────────
 *
 * Le journal transporte des chaînes issues de la page : libellés, messages
 * d'erreur, adresses, sélecteurs. Un journal n'est pas plus fiable parce que
 * c'est nous qui l'avons écrit — nous y avons recopié ce que la page a dit
 * (constitution §3 : la chaîne de méfiance couvre les données DÉRIVÉES). La
 * clé du groupe et la description technique sont dans le même cas : elles sont
 * calculées par le moteur, à partir de ce que la page a fourni.
 *
 * On borne la TAILLE et la FORME, jamais le contenu : un extrait qui donne un
 * ordre reste un extrait à lire, et c'est le rappel système qui le dit.
 */
import type { ConfigDiagnostic } from '../scanner/config.js';
import { hacherEntree } from './cle.js';
import type { ContexteDiagnostic } from './index.js';
import { AVIS_ADMIS } from './schema-diagnostic.js';

/** Le contexte réduit à ce que le modèle en voit, borné et mis à plat. */
export interface ContexteDiagnosticNormalise {
  groupe: string;
  description: string;
  extraits: string[];
}

/**
 * Le bloc de données est écrit LIGNE À LIGNE, et chaque ligne dit d'où vient
 * quoi. Un extrait qui contiendrait un séparateur écrirait donc ses propres
 * lignes : il pourrait fabriquer une section entière, voire une fausse consigne
 * présentée comme une ligne de structure. Même raisonnement qu'aux prompts de
 * profilage et de navigation.
 *
 * LA CLASSE EST ICI PLUS LARGE QUE CHEZ EUX, et la divergence est délibérée
 * plutôt que subie. CR, LF et les séparateurs Unicode de ligne et de
 * paragraphe ne sont pas les seuls caractères qu'un rendu traite comme une
 * fin de ligne : VT (U+000B), FF (U+000C) et NEL (U+0085) le sont aussi. Les
 * cinq copies de cette classe qui vivent ailleurs dans le dépôt
 * (`core/scanner/profilage.ts`, `core/scanner/exploration/enumeration.ts`,
 * `prompts/profilage/v1.ts`, `prompts/navigation/v1.ts` et `v2.ts`) ne les
 * couvrent pas encore : les élargir toucherait des prompts LIVRÉS, sous
 * lesquels des cassettes et des mesures existent, ce qui impose un incrément
 * de version (constitution §6) et une remise à l'épreuve de toutes les
 * charges dans toutes les langues (APPRENTISSAGES n°8) — un chantier
 * transversal, pas un ajustement de cette brique. La divergence est donc
 * écrite ici, en toutes lettres, pour qu'elle se referme par élargissement et
 * jamais par rétrécissement.
 */
const SEPARATEURS_DE_LIGNE = /[\r\n\v\f\u0085\u2028\u2029]+/g;

/** Aplatit une valeur sur une ligne, puis la borne. */
function surUneLigne(valeur: string, maxChars: number): string {
  return valeur.replace(SEPARATEURS_DE_LIGNE, ' ').slice(0, Math.max(0, maxChars));
}

/**
 * Les extraits retenus : au plus `extraitsMaxParGroupe` entrées, et au plus
 * `extraitsMaxChars` caractères CUMULÉS sur l'ensemble du bloc — ce que la
 * description du réglage annonce (« troncature du bloc d'extraits »).
 *
 * Les entrées sont prises DEPUIS LE DÉBUT, dans l'ordre reçu. Choisir la fin
 * serait une SÉLECTION déguisée en borne : le module qui possède le journal
 * sait quelles entrées portent le signal, ce module-ci ne sait que compter des
 * caractères. Il coupe donc à la fin d'une liste déjà ordonnée, et ne
 * réordonne rien.
 */
function extraitsBornes(extraits: readonly string[], config: ConfigDiagnostic): string[] {
  const retenus: string[] = [];
  let budget = Math.max(0, config.extraitsMaxChars);
  for (const extrait of extraits.slice(0, Math.max(0, config.extraitsMaxParGroupe))) {
    if (budget <= 0) break;
    const montre = surUneLigne(extrait, budget);
    budget -= montre.length;
    retenus.push(montre);
  }
  return retenus;
}

/**
 * Normalise le contexte reçu. Aucune valeur n'est réordonnée : l'ordre du
 * journal est chronologique, donc porteur de sens — deux journaux d'ordre
 * différent sont deux contextes différents, et c'est correct qu'ils aient deux
 * clés. (C'est l'inverse de l'énumération d'actions de la navigation, dont
 * l'ordre est une propriété du code appelant et se canonise.)
 */
export function normaliserContexteDiagnostic(
  contexte: ContexteDiagnostic,
  config: ConfigDiagnostic,
): ContexteDiagnosticNormalise {
  return {
    groupe: surUneLigne(contexte.groupe, config.extraitsMaxChars),
    description: surUneLigne(contexte.description, config.extraitsMaxChars),
    extraits: extraitsBornes(contexte.extraits, config),
  };
}

/**
 * Empreinte de ce qui compose le PROMPT et l'APPEL, au-delà du fichier de
 * prompt lui-même.
 *
 * `VERSION` ne protège que `prompts/diagnostic/v1.ts`. Or deux autres sources
 * composent l'appel sans y figurer :
 *  - les BORNES de config, qui décident de ce que le modèle voit ;
 *  - le VOCABULAIRE des avis, qui vit en code (`AVIS_ADMIS`) et qui est écrit
 *    en toutes lettres dans les instructions ET dans le contrat de sortie.
 *    Ajouter un quatrième avis changerait le prompt et le schéma sans changer
 *    une ligne du fichier de prompt : une clé aveugle à ce vocabulaire
 *    rejouerait une réponse produite sous un AUTRE contrat.
 *
 * `relancesMax`, `facteurConfianceDecouverte`, `groupesMax` et `actif` en sont
 * ABSENTS : ils ne composent ni le prompt ni l'appel, et les inclure périmerait
 * tout le parc au premier réglage d'une tolérance ou d'un plafond de scan.
 */
export function empreinteContratDiagnostic(config: ConfigDiagnostic): string {
  return hacherEntree([config.extraitsMaxChars, config.extraitsMaxParGroupe, config.maxTokensReponse, [...AVIS_ADMIS]]);
}

/**
 * Sérialisation du contexte normalisé pour le hachage : un TABLEAU à ordre
 * fixe, jamais un objet — l'ordre des clés d'un objet est une propriété du
 * code qui le construit, donc une source de dérive silencieuse.
 */
export function entreeCleDepuisContexteDiagnostic(contexte: ContexteDiagnosticNormalise): readonly unknown[] {
  return [contexte.groupe, contexte.description, [...contexte.extraits]];
}
