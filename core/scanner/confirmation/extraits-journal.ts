/**
 * LES EXTRAITS DE JOURNAL montrés au diagnostic — et les détails des entrées
 * de journal correspondantes du protocole.
 *
 * Les deux vivent ICI, dans le même module, et c'est la raison d'être du
 * fichier : le diagnostic est mesuré sur un CORPUS de journaux, et un corpus
 * dont le format s'éloigne de ce que le pipeline produit mesurerait le modèle
 * sur une langue qu'il ne parlera jamais en production — la bonne réponse au
 * mauvais document. Tant que `protocole.ts` et `reexecution.ts` journalisent
 * par ces fonctions et que les extraits sont construits par elles, les deux
 * ne peuvent pas diverger sans que le compilateur le voie.
 *
 * CHAÎNE DE MÉFIANCE (constitution §3, données DÉRIVÉES). Ces lignes sont des
 * données NON FIABLES. Un journal n'est pas plus fiable parce que c'est nous
 * qui l'avons écrit : nous y avons recopié ce que la page a dit — la clé de
 * groupe porte un sélecteur CSS venu du DOM, `urlOuEtape` une URL venue des
 * liens de la page. C'est pour cela que les extraits sont BORNÉS (nombre
 * d'entrées et nombre de caractères, tous deux en config) et balisés comme
 * contenu par le prompt.
 */
import type { ContreEpreuve, GroupeCause, ResultatGroupe, TentativeReexecution } from '../../types.js';
import type { ConfigConfirmation } from '../config.js';

/** Types d'entrées de journal qui composent un extrait (identifiants stables). */
export const TYPE_JOURNAL_GROUPE = 'confirmation.groupe';
export const TYPE_JOURNAL_TENTATIVE = 'confirmation.tentative';
export const TYPE_JOURNAL_CONTRE_EPREUVE = 'confirmation.contre-epreuve';

/** Les seuls types d'entrées qu'un extrait peut porter, dans l'ordre où ils apparaissent. */
export const TYPES_EXTRAITS: readonly string[] = [TYPE_JOURNAL_GROUPE, TYPE_JOURNAL_TENTATIVE, TYPE_JOURNAL_CONTRE_EPREUVE];

/**
 * Marque de troncature d'un extrait. Identifiant technique, pas de la prose :
 * elle dit au lecteur (humain ou modèle) que la ligne est incomplète, ce qui
 * est une information de provenance — un extrait coupé en silence ferait
 * conclure sur ce qu'il ne montre pas.
 */
export const MARQUE_TRONCATURE = '[tronque]';

export interface BornesExtraits {
  /** `diagnostic.extraitsMaxParGroupe` : nombre maximal d'entrées retenues. */
  extraitsMaxParGroupe: number;
  /** `diagnostic.extraitsMaxChars` : plafond de caractères de l'ensemble du bloc. */
  extraitsMaxChars: number;
}

/**
 * Les plafonds de temps du rejeu, tels qu'ils étaient au moment où le groupe
 * a été re-exécuté.
 *
 * Ils entrent dans le journal — donc dans les extraits — parce qu'UNE DURÉE
 * SANS SON BUDGET NE VEUT RIEN DIRE. « 15 118 ms » ne dit rien ; « 15 118 ms
 * contre un plafond de chargement de 15 000 » dit que l'attente est allée
 * jusqu'au bout, ce qui est exactement la différence entre un robot qui
 * renonce et un serveur qui ne répond pas. Le lecteur humain du journal a le
 * même besoin que le diagnostic : c'est un manque du journal, découvert en le
 * mesurant, pas une commodité pour le modèle.
 */
export type BudgetsRejeu = Pick<ConfigConfirmation['rejeu'], 'chargementPageMs' | 'actionMs'>;

/**
 * Détails de l'entrée `confirmation.groupe`.
 *
 * Elle porte ce que le groupe EST (clé, détecteur, confiance, viewports) et
 * ce qui a été rejoué (URL, description technique, action déclenchante,
 * nombre d'actions préalables). Les quatre derniers champs sont entrés dans
 * le journal avec la brique 4c : sans eux, un lecteur du journal — et le
 * diagnostic, qui n'a que ce journal — voit combien de fois un rejeu a
 * échoué sans jamais savoir ce qu'il rejouait.
 */
export function detailsGroupe(groupe: GroupeCause, viewportRejeu: string, budgets: BudgetsRejeu): Record<string, unknown> {
  const { reproduction } = groupe.representant;
  return {
    cle: groupe.cle,
    confiance: groupe.confiance,
    nbMembres: groupe.membres.length,
    viewports: groupe.observations.map((observation) => observation.viewport),
    detecteur: groupe.representant.detecteur,
    viewportRejeu,
    urlOuEtape: groupe.representant.urlOuEtape,
    description: groupe.representant.description,
    action: reproduction.action === null ? null : reproduction.action.action.type,
    nbPrealables: reproduction.actionsPrealables.length,
    budgetChargementMs: budgets.chargementPageMs,
    budgetActionMs: budgets.actionMs,
  };
}

/** Détails de l'entrée `confirmation.tentative` : une tentative de re-exécution, telle qu'elle s'est passée. */
export function detailsTentative(cle: string, tentative: TentativeReexecution): Record<string, unknown> {
  return {
    cle,
    numero: tentative.numero,
    viewport: tentative.viewport,
    reproduite: tentative.reproduite,
    echecOutillage: tentative.echecOutillage,
    ...(tentative.causeEchec === undefined ? {} : { causeEchec: tentative.causeEchec }),
    ...(tentative.erreur === undefined ? {} : { erreur: tentative.erreur }),
    ...(tentative.mesureMs === undefined ? {} : { mesureMs: tentative.mesureMs }),
    dureeMs: tentative.dureeMs,
    // JUSQU'OÙ le rejeu est allé et CE QU'IL A VU. Sans ces chiffres, une
    // tentative en échec dit qu'elle a échoué et ne dit pas si le site a
    // seulement été interrogé — or c'est la question même du protocole.
    ...(tentative.observations === undefined ? {} : { observations: tentative.observations }),
  };
}

/** Détails de l'entrée `confirmation.contre-epreuve` : la même action rejouée dans l'AUTRE viewport. */
export function detailsContreEpreuve(cle: string, contreEpreuve: ContreEpreuve): Record<string, unknown> {
  return { cle, ...contreEpreuve };
}

/**
 * Longueur de la marque de troncature. Nommée pour que la réserve de place
 * soit lisible là où elle est prise : la marque est AJOUTÉE après la coupe,
 * donc le budget doit la couvrir, sinon la borne suivante la rognerait — et
 * couperait en silence exactement ce qui existe pour signaler la coupe.
 */
const LONGUEUR_MARQUE = MARQUE_TRONCATURE.length;

/** Une ligne d'extrait : le type de l'entrée, puis ses détails sérialisés — la forme même du journal. */
export function formaterExtrait(type: string, details: unknown): string {
  return `${type} ${JSON.stringify(details)}`;
}

/**
 * Les extraits d'un groupe, bornés.
 *
 * Deux bornes, deux raisons distinctes. `extraitsMaxParGroupe` borne le
 * NOMBRE d'entrées (un groupe pathologique ne doit pas faire exploser un
 * appel) ; `extraitsMaxChars` borne la TAILLE du bloc non fiable (une clé de
 * groupe est un sélecteur venu du DOM, donc de longueur non contrôlée par
 * nous). La dernière entrée retenue est tronquée plutôt que supprimée, et la
 * troncature est MARQUÉE : couper en silence ferait conclure sur ce que
 * l'extrait ne montre pas.
 */
export function extraitsDuGroupe(resultat: ResultatGroupe, bornes: BornesExtraits, budgets: BudgetsRejeu): string[] {
  const lignes: string[] = [
    formaterExtrait(
      TYPE_JOURNAL_GROUPE,
      detailsGroupe(resultat.groupe, resultat.groupe.representant.reproduction.viewport.nom, budgets),
    ),
  ];
  for (const tentative of resultat.tentatives) {
    lignes.push(formaterExtrait(TYPE_JOURNAL_TENTATIVE, detailsTentative(resultat.groupe.cle, tentative)));
  }
  if (resultat.contreEpreuve !== undefined) {
    lignes.push(formaterExtrait(TYPE_JOURNAL_CONTRE_EPREUVE, detailsContreEpreuve(resultat.groupe.cle, resultat.contreEpreuve)));
  }
  return bornerExtraits(lignes.slice(0, Math.max(0, bornes.extraitsMaxParGroupe)), bornes.extraitsMaxChars);
}

/** Borne la taille TOTALE du bloc ; la ligne qui déborde est tronquée et marquée. */
export function bornerExtraits(lignes: readonly string[], maxChars: number): string[] {
  const bornees: string[] = [];
  let restant = maxChars;
  for (const ligne of lignes) {
    if (restant <= 0) {
      break;
    }
    if (ligne.length <= restant) {
      bornees.push(ligne);
      restant -= ligne.length;
      continue;
    }
    // La marque compte DANS le budget : `bornerExtraits` promet un total de
    // `maxChars` au plus, et une borne qui déborde de sa propre marque n'est
    // pas une borne. Si la place ne suffit pas même pour la marque, la ligne
    // est abandonnée : mieux vaut une entrée de moins qu'une entrée muette
    // sur le fait qu'elle est incomplète.
    if (restant > LONGUEUR_MARQUE) {
      bornees.push(`${ligne.slice(0, restant - LONGUEUR_MARQUE)}${MARQUE_TRONCATURE}`);
    }
    restant = 0;
  }
  return bornees;
}
