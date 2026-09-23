/**
 * Normalisation DÉTERMINISTE de l'état énuméré d'un point de décision.
 *
 * Ce module a une seule raison d'être, et elle est double par construction :
 * l'état normalisé est à la fois ce que le prompt AFFICHE et ce que la clé de
 * cassette HACHE. Les deux doivent être la même chose, sans quoi une cassette
 * pourrait être rejouée sur un prompt différent de celui qui l'a produite —
 * la bonne réponse du mauvais prompt.
 *
 * Trois sources de dérive silencieuse sont fermées ici :
 *  - l'ORDRE DES ACTIONS : l'énumérateur peut les produire dans l'ordre du DOM
 *    ou dans celui d'une file ; on les range par identifiant, une fois pour
 *    toutes. L'ordre d'affichage cesse d'être une propriété du code appelant ;
 *  - l'ORDRE DES CLÉS des repères techniques, même raison ;
 *  - la TRONCATURE de TOUTE chaîne issue de la page, appliquée ici et pas
 *    seulement à l'affichage : ce qui n'est pas montré ne doit pas entrer dans
 *    la clé.
 *
 * Sur ce dernier point, la revue de la brique 4b a corrigé une asymétrie
 * dangereuse : seul le LIBELLÉ était borné, alors que le chemin d'une URL, la
 * cible d'un formulaire, la page courante, l'historique et le champ libre du
 * profil viennent tout autant de la page — et entraient sans aucune borne. Un
 * lien dont le `href` est neuf cents caractères de prose impérative écrivait
 * donc, dans le bloc non fiable, neuf cents caractères que rien ne limitait,
 * à côté d'un libellé coupé à cent vingt. La borne s'applique désormais à
 * toute valeur de chaîne du bloc, sans exception : on borne la TAILLE et la
 * FORME, jamais le contenu (constitution §3).
 *
 * L'ordre de l'HISTORIQUE, lui, n'est PAS canonisé : il est chronologique,
 * donc porteur de sens. Deux historiques d'ordre différent sont deux états
 * différents, et c'est correct qu'ils aient deux clés.
 *
 * Ce qui n'entre PAS dans l'état normalisé : `ActionProposee.action`, l'action
 * réelle. Le modèle ne la voit jamais (règle centrale : il élit, il ne désigne
 * pas), donc elle ne change pas le prompt, donc elle n'a rien à faire dans la
 * clé. C'est le moteur, et lui seul, qui retraduit l'identifiant élu en acte.
 */
import type { EtatDecisionEnumere, TypeAction } from '../types.js';
import { hacherEntree, normaliserUrlPourCle } from './cle.js';
import type { ConfigNavigation } from './config-navigation.js';

/** Une action telle qu'elle est MONTRÉE : un identifiant, des repères, un libellé. */
export interface ActionNormalisee {
  id: string;
  type: TypeAction;
  /** Repères techniques, rangés par clé : `[['balise', 'a'], ['chemin', '/panier']]`. */
  reperes: [string, string][];
  libelle: string | null;
}

/** Le profil réduit à ce que le modèle en voit : l'estampille de provenance ne l'intéresse pas. */
export interface ProfilMontre {
  typeSite: string;
  natureLibre: string | null;
  langue: string;
  confiance: number;
}

export interface EtatNormalise {
  page: string;
  viewport: string;
  profil: ProfilMontre | null;
  actions: ActionNormalisee[];
  historique: { type: TypeAction; page: string }[];
  nbPagesVisitees: number;
  pagesRestantes: number;
}

/** Comparaison par unités de code : indépendante de toute locale, donc reproductible partout. */
function parIdentifiant(gauche: ActionNormalisee, droite: ActionNormalisee): number {
  if (gauche.id === droite.id) return 0;
  return gauche.id < droite.id ? -1 : 1;
}

/**
 * Borne commune à toute chaîne venue de la page. Le réglage est celui de
 * l'exploration (`exploration.libelleMaxChars`) : une seule borne pour tout le
 * bloc non fiable, parce qu'un second réglage laisserait croire qu'il existe
 * une surface moins dangereuse qu'une autre — et c'est précisément la
 * croyance qui avait laissé les repères sans borne.
 */
function borne(valeur: string, maxChars: number): string {
  return valeur.slice(0, Math.max(0, maxChars));
}

/** Repères rangés par clé, CLÉS ET VALEURS bornées : elles viennent de la page. */
function reperesRanges(reperes: Record<string, string>, maxChars: number): [string, string][] {
  return Object.entries(reperes)
    .map(([cle, valeur]): [string, string] => [borne(cle, maxChars), borne(valeur, maxChars)])
    .sort(([gauche], [droite]) => (gauche < droite ? -1 : gauche > droite ? 1 : 0));
}

/**
 * Les `historiqueMaxActions` actions les PLUS RÉCENTES.
 *
 * Le zéro est traité à part : `slice(-0)` vaut `slice(0)`, c'est-à-dire le
 * tableau entier — un réglage à zéro montrerait donc tout l'historique au lieu
 * de rien. Le schéma autorise zéro ; la borne doit le respecter.
 */
function historiqueRecent(
  historique: readonly { type: TypeAction; page: string }[],
  maximum: number,
  maxChars: number,
): { type: TypeAction; page: string }[] {
  if (maximum <= 0) return [];
  return historique
    .slice(-maximum)
    .map((entree) => ({ type: entree.type, page: borne(normaliserUrlPourCle(entree.page), maxChars) }));
}

export function normaliserEtatDecision(etat: EtatDecisionEnumere, config: ConfigNavigation): EtatNormalise {
  const maxChars = config.libelleMaxChars;
  return {
    page: borne(normaliserUrlPourCle(etat.page), maxChars),
    viewport: etat.viewport,
    profil:
      etat.profil === null
        ? null
        : {
            typeSite: borne(etat.profil.typeSite, maxChars),
            // `natureLibre` est, de l'aveu du contrat de profilage, le SEUL
            // champ du profil influençable mot à mot par le contenu de la
            // page. Il était le seul du bloc non fiable à n'avoir aucune
            // borne, et son unique plafond était `profilage.maxTokensReponse`
            // — le réglage d'un AUTRE module, qu'un jour on relèverait sans
            // voir le lien avec la surface d'injection de la navigation.
            natureLibre: etat.profil.natureLibre === null ? null : borne(etat.profil.natureLibre, maxChars),
            langue: borne(etat.profil.langue, maxChars),
            confiance: etat.profil.confiance,
          },
    actions: etat.actions
      .map((action) => ({
        id: action.id,
        type: action.type,
        reperes: reperesRanges(action.reperes, maxChars),
        libelle: action.libelle === null ? null : borne(action.libelle, maxChars),
      }))
      .sort(parIdentifiant),
    historique: historiqueRecent(etat.historique, config.historiqueMaxActions, maxChars),
    nbPagesVisitees: etat.nbPagesVisitees,
    pagesRestantes: etat.pagesRestantes,
  };
}

/** Les identifiants énumérés, dans l'ordre canonique : le contrat de sortie en est dérivé. */
export function identifiantsEnumeres(etat: EtatNormalise): string[] {
  return etat.actions.map((action) => action.id);
}

/**
 * Empreinte des réglages qui composent le PROMPT et l'APPEL de décision.
 *
 * Même raisonnement qu'au profilage : une clé aveugle à ces valeurs rejouerait
 * une réponse produite sous un autre contrat. `libelleMaxChars` et
 * `historiqueMaxActions` sont déjà appliqués à l'état normalisé, donc
 * redondants la plupart du temps — mais pas toujours : abaisser
 * `historiqueMaxActions` sur une page sans historique ne change rien à l'état
 * et change pourtant le prompt de toutes les autres. On prend la lecture la
 * moins flatteuse (APPRENTISSAGES n°4).
 *
 * `relancesMax` en est ABSENT : il ne compose ni le prompt ni l'appel, et
 * l'inclure périmerait tout le parc au premier réglage d'une tolérance.
 */
export function empreinteContratNavigation(config: ConfigNavigation): string {
  return hacherEntree([config.libelleMaxChars, config.historiqueMaxActions, config.maxTokensReponse]);
}

/**
 * Sérialisation de l'état normalisé pour le hachage : un TABLEAU à ordre fixe,
 * jamais un objet.
 */
export function entreeCleDepuisEtat(etat: EtatNormalise): readonly unknown[] {
  return [
    etat.page,
    etat.viewport,
    etat.profil === null
      ? null
      : [etat.profil.typeSite, etat.profil.natureLibre, etat.profil.langue, etat.profil.confiance],
    etat.actions.map((action) => [action.id, action.type, action.reperes, action.libelle]),
    etat.historique.map((entree) => [entree.type, entree.page]),
    etat.nbPagesVisitees,
    etat.pagesRestantes,
  ];
}
