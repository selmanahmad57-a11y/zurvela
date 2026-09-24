/**
 * DÉTECTION MÉCANIQUE de la langue d'une prose — pour le BANC, et lui seul.
 *
 * ── POURQUOI ELLE EXISTE ────────────────────────────────────────────────────
 *
 * Le cahier de la brique 5 exige que la langue du rapport soit vérifiée « par
 * détection mécanique ». Sans elle, le contrôle de langue comparait
 * `RapportBusiness.langue` — une étiquette que le moteur RECOPIE depuis la
 * demande — à cette même demande : utile pour prouver qu'un paramètre de scan
 * n'est pas muet, incapable de voir le seul échec qui compte. Les formulations
 * de statut viennent de tables de code, donc elles sont dans la bonne langue
 * quoi qu'il arrive ; les SIX CHAMPS DE PROSE, les seuls que le modèle écrive,
 * n'étaient examinés par personne. Le critère « rapport intégralement FR »
 * était signé par une vérification qui ne pouvait pas échouer.
 *
 * ── CE QU'ELLE MESURE, ET CE QU'ELLE NE MESURE PAS ──────────────────────────
 *
 * Elle compte des MOTS-OUTILS — articles, prépositions, conjonctions,
 * auxiliaires : une classe fermée, fréquente dans toute prose et muette sur le
 * sujet du texte. Elle mesure donc une LANGUE, jamais une qualité : noter une
 * prose serait noter une opinion, et ce module n'en note aucune. La table vit
 * en configuration, comme la liste noire d'actions destructives — un motif de
 * langue naturelle ne vit jamais dans le code (constitution §2).
 *
 * ── ELLE A LE DROIT DE NE PAS SAVOIR ────────────────────────────────────────
 *
 * Trop peu de mots reconnus, ou deux langues trop proches : la détection rend
 * `null`. L'appelant traite ce cas comme un contrôle FAUX, jamais comme un
 * contrôle qui passe — un contrôle qu'on ne peut pas faire n'est pas un
 * contrôle réussi (METHODE §2). C'est ce qui l'empêche de devenir, à son tour,
 * une vérification incapable d'échouer.
 */
import { readFile } from 'node:fs/promises';
import { depuisRacine } from '../outils/racine.js';
import { chargerSchema, valider } from '../outils/schema.js';
import type { RapportBusiness } from '../../core/types.js';

export interface ConfigDetectionLangue {
  tokensMin: number;
  margeMin: number;
  /** Par code de langue : ses mots-outils. */
  motsOutils: Record<string, string[]>;
}

export const FICHIER_DETECTION_LANGUE = depuisRacine('config', 'detection-langue.json');

export async function chargerDetectionLangue(fichier: string = FICHIER_DETECTION_LANGUE): Promise<ConfigDetectionLangue> {
  const [schema, contenu] = await Promise.all([
    chargerSchema(depuisRacine('config', 'detection-langue.schema.json')),
    readFile(fichier, 'utf8'),
  ]);
  return valider<ConfigDetectionLangue>(schema, JSON.parse(contenu), 'config/detection-langue.json');
}

/**
 * Découpe en mots, sans connaître aucune langue : toute suite de lettres
 * Unicode est un mot. `\p{L}` plutôt qu'un intervalle latin — une prose peut
 * être accentuée, et « été » ne doit pas devenir « t ».
 */
const MOT = /\p{L}+/gu;

export interface ScoreLangue {
  /** Langue la mieux notée, ou `null` quand la détection refuse de trancher. */
  langue: string | null;
  /** Mots-outils reconnus par langue : publié pour que l'échec soit lisible. */
  scores: Record<string, number>;
  /** Mots-outils reconnus, toutes langues confondues. */
  total: number;
  /** Identifiant technique stable de la cause d'un refus ; absent quand la détection tranche. */
  raison?: string;
}

/** Trop peu de mots-outils reconnus : la prose est trop courte pour se prononcer. */
export const RAISON_PROSE_TROP_COURTE = 'prose-trop-courte';
/** Deux langues trop proches : l'écart n'atteint pas la marge exigée. */
export const RAISON_LANGUES_EX_AEQUO = 'langues-ex-aequo';

/**
 * La langue d'une prose, ou `null` si la détection ne tranche pas.
 *
 * Aucune normalisation savante : minuscules et découpage en mots. Les
 * mots-outils sont comparés en minuscules, et un mot qui appartient à deux
 * langues (« a », « on », « son »…) compte pour les deux — c'est la MARGE qui
 * fait la décision, pas la pureté des listes.
 */
export function detecterLangue(prose: string, config: ConfigDetectionLangue): ScoreLangue {
  const mots = (prose.toLowerCase().match(MOT) ?? []).slice();
  const scores: Record<string, number> = {};
  for (const [langue, outils] of Object.entries(config.motsOutils)) {
    const ensemble = new Set(outils.map((mot) => mot.toLowerCase()));
    scores[langue] = mots.filter((mot) => ensemble.has(mot)).length;
  }

  const classement = Object.entries(scores).sort((gauche, droite) => droite[1] - gauche[1]);
  const total = Object.values(scores).reduce((somme, score) => somme + score, 0);
  const premier = classement[0];
  const second = classement[1];

  if (premier === undefined || total < config.tokensMin) {
    return { langue: null, scores, total, raison: RAISON_PROSE_TROP_COURTE };
  }
  if (second !== undefined && premier[1] - second[1] < config.margeMin) {
    return { langue: null, scores, total, raison: RAISON_LANGUES_EX_AEQUO };
  }
  return { langue: premier[0], scores, total };
}

/**
 * La prose du rapport découpée en BLOCS DÉTECTABLES : un bloc par section (ses
 * quatre champs réunis), plus un bloc pour les deux champs globaux.
 *
 * Pourquoi la SECTION et pas le champ. Un titre fait cinq mots : pris seul, il
 * n'atteint jamais le minimum de jetons de la détection, qui répondrait
 * « indécidable » sur presque tous les champs — un contrôle qui ne tranche
 * jamais ne contrôle rien. La section réunit assez de texte pour être tranchée,
 * et c'est exactement l'unité où une rédaction dérape : le mode de panne
 * réaliste n'est pas le basculement du rapport entier, c'est une section
 * écrite dans l'autre langue.
 *
 * Les formulations de statut sont ABSENTES de ces blocs — elles viennent de
 * tables de code, donc elles sont dans la bonne langue quoi qu'il arrive, et
 * les inclure ferait passer le contrôle sur du texte que le modèle n'a pas
 * écrit.
 */
export function blocsProseDe(rapportBusiness: RapportBusiness): string[] {
  const globaux = [rapportBusiness.synthese, rapportBusiness.ligneMethode].filter((champ) => champ !== '').join(' ');
  const sections = rapportBusiness.sections.map((section) =>
    [section.titre, section.constat, section.impact, section.actionSuggeree].filter((champ) => champ !== '').join(' '),
  );
  return [globaux, ...sections].filter((bloc) => bloc !== '');
}

/** La prose entière, pour la détection D'ENSEMBLE. */
export function proseDe(rapportBusiness: RapportBusiness): string {
  return blocsProseDe(rapportBusiness).join(' ');
}
