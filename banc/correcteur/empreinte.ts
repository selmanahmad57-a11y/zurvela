/**
 * L'EMPREINTE D'UN SCÉNARIO — l'oracle d'équivalence du cahier P2-4
 * (contrat 1).
 *
 * Le risque de P2-4 n'est celui d'aucun cahier précédent : **une
 * optimisation peut changer un RÉSULTAT sans changer un seul VERDICT**. Un
 * rejeu sélectionné qui saute la mauvaise candidate, un budget réalloué qui
 * explore moins : chaque verdict pris isolément reste correct, et le scan
 * n'est plus le même. Aucune colonne de la scorecard ne s'allume.
 *
 * ## LA FRONTIÈRE — identité contre effort
 *
 * Première version de ce module : une seule empreinte, qui fondait deux
 * grandeurs de natures OPPOSÉES. Son premier usage réel l'a montré — elle
 * rougissait parce que le moteur avait observé un défaut deux fois au lieu
 * d'une, alors qu'aucun verdict, aucune gravité, aucune section n'avait
 * bougé. Un oracle ainsi fait interdit TOUTE optimisation de budget,
 * c'est-à-dire tout le reste du cahier.
 *
 * - **IDENTITÉ** — ce que le rapport dit DU SITE : l'existence de
 *   l'anomalie, sa description, sa catégorie, sa gravité, son verdict, son
 *   motif, son groupe de cause, ses localisations, et les sections
 *   publiées. Une optimisation n'a JAMAIS le droit d'y toucher.
 * - **EFFORT** — ce que le rapport dit DE NOUS : combien de fois nous
 *   avons observé, combien nous avons écarté, combien nous n'avons pas pu
 *   vérifier, combien de recouvrements nous avons dû pousser, et ce que
 *   cela a coûté. Une optimisation de budget le change PAR DÉFINITION :
 *   rejouer mieux, c'est observer différemment.
 *
 * Le critère n'est pas « est-ce imprimé dans le rapport » — les trois
 * comptes déclarés le sont tous les trois. C'est : **cette grandeur
 * décrit-elle le SITE, ou nous ?** Le client ne lit pas « j'ai observé ce
 * défaut deux fois au lieu d'une » ; il lit « ce défaut existe ». La
 * frontière est celle que le projet défend depuis P2-2 (l'effet visible) et
 * P2-3 (l'acte se juge à son effet).
 *
 * Elle vit en CODE et non en config, et c'est délibéré : un réglage qui
 * pourrait faire glisser une gravité du côté effort ferait taire l'oracle
 * sans qu'aucune revue le voie (constitution §2, les invariants en code).
 *
 * Rien de la PROSE n'entre dans l'empreinte : elle vient d'un modèle et
 * varie sans que le moteur ait changé. Seuls entrent les faits que le code
 * pose.
 */
import { createHash } from 'node:crypto';
import type { VerdictConfirmation } from '../../core/types.js';
import type { ResultatScenario } from '../types.js';

/**
 * Le seul verdict d'écartement qui ne juge PAS le signal : il dit que nous
 * n'avons pas pu finir. Le type le pose déjà ainsi — « la limite de mon
 * automatisation », délibérément distincte de `non-reproduite`
 * (`core/types.ts`, `VerdictConfirmation`). Une écartée de ce verdict
 * appartient donc à l'effort ; toute autre écartée porte un JUGEMENT sur le
 * signal, et c'est ce jugement qui protège le différenciateur n°1.
 */
const VERDICT_SANS_JUGEMENT: VerdictConfirmation = 'limite-automatisation';

interface AnomaliePublieE {
  description: string;
  categorie: string;
  graviteEstimee: string;
  verdict?: string;
  motif?: string;
  groupe?: string;
  localisations?: unknown[];
  observations?: unknown[];
}

/** Ce qui, d'une anomalie publiée, décrit le SITE. */
function identiteAnomalie(a: AnomaliePublieE): string {
  return [a.description, a.categorie, a.graviteEstimee, a.verdict ?? '', a.motif ?? '', a.groupe ?? ''].join('|');
}

/**
 * Les localisations sont ÉNUMÉRÉES, jamais comptées.
 *
 * Un compte confond deux choses opposées : une anomalie qui GAGNE une
 * localisation (le même défaut, enfin vu sur mobile) sortait comme une
 * perte suivie d'un gain, parce que la chaîne « …|1 » disparaissait au
 * profit de « …|2 ». Pire, un compte est AVEUGLE au cas vraiment grave :
 * un défaut qui passe de desktop à mobile sans changer de nombre ne bouge
 * pas d'un caractère. Énumérer attrape les deux.
 */
function localisationsDe(a: AnomaliePublieE): string[] {
  const identite = identiteAnomalie(a);
  return (a.localisations ?? []).map((l) => {
    const place = l as { urlOuEtape?: string; viewport?: string; element?: { selecteur?: string } };
    return `localisation:${identite}|${place.urlOuEtape ?? ''}|${place.viewport ?? ''}|${place.element?.selecteur ?? ''}`;
  });
}

function anomalies(resultat: ResultatScenario): AnomaliePublieE[] {
  return (resultat.rapport?.anomalies ?? []) as unknown as AnomaliePublieE[];
}

function ecarteesDe(resultat: ResultatScenario): { verdict?: string; raison: string; cle?: string }[] {
  return (resultat.rapport?.ecartees ?? []) as unknown as { verdict?: string; raison: string; cle?: string }[];
}

function libelleEcartee(e: { verdict?: string; raison: string; cle?: string }): string {
  return `${e.verdict ?? ''}|${e.raison}|${e.cle ?? ''}`;
}

/**
 * CE QUE LE RAPPORT DIT DU SITE. Égalité EXIGÉE : toute divergence ici est
 * un changement de résultat, quel qu'en soit le gain de vitesse.
 *
 * Ordre STABLE : deux runs ne produisent pas forcément leurs anomalies dans
 * le même ordre, et un ordre différent n'est pas un résultat différent.
 */
export function elementsIdentite(resultat: ResultatScenario): string[] {
  const publiees = anomalies(resultat).map(identiteAnomalie).sort();
  const places = anomalies(resultat).flatMap(localisationsDe).sort();
  const jugees = ecarteesDe(resultat)
    .filter((e) => e.verdict !== VERDICT_SANS_JUGEMENT)
    .map(libelleEcartee)
    .sort();
  const sections = (resultat.rapportBusiness?.sections ?? [])
    .map((s) => `${s.categorie}|${s.gravite}|${s.statut}|${s.groupe ?? ''}`)
    .sort();
  return [
    ...publiees.map((a) => `anomalie:${a}`),
    ...places,
    ...jugees.map((e) => `ecartee:${e}`),
    ...sections.map((s) => `section:${s}`),
  ];
}

/**
 * CE QUE LE RAPPORT DIT DE NOUS. Affiché, jamais bloquant : c'est
 * exactement ce qu'une optimisation de budget a le devoir de changer. Mais
 * affiché quand même — un effort qui s'effondre sans que l'identité bouge
 * est le signe qu'on a cessé de chercher, et cela se lit.
 *
 * Les durées, les coûts et le nombre de tentatives n'y figurent pas : ils
 * se mesurent ailleurs, et les mêler ici ferait rougir le second tableau à
 * chaque run sans rien apprendre.
 */
export function elementsEffort(resultat: ResultatScenario): string[] {
  const observations = anomalies(resultat)
    .map((a) => `observations:${identiteAnomalie(a)}=${a.observations?.length ?? 0}`)
    .sort();
  const nonVerifiees = ecarteesDe(resultat)
    .filter((e) => e.verdict === VERDICT_SANS_JUGEMENT)
    .map((e) => `non-verifiee:${libelleEcartee(e)}`)
    .sort();
  return [
    // La note du BANC, pas un contenu de rapport : le banc la fait déjà
    // respecter de son côté, l'oracle n'a pas à la juger une seconde fois.
    `statut=${resultat.statut}`,
    ...observations,
    ...nonVerifiees,
    `declare:nbEcartes=${resultat.rapportBusiness?.nbEcartes ?? 'null'}`,
    `declare:nbNonVerifies=${resultat.rapportBusiness?.nbNonVerifies ?? 'null'}`,
    `declare:nbRecouvrementsEcartes=${resultat.rapportBusiness?.nbRecouvrementsEcartes ?? 0}`,
  ];
}

/** L'empreinte d'IDENTITÉ : un hash de ce que le rapport dit du site. */
export function empreinteIdentite(resultat: ResultatScenario): string {
  return createHash('sha256').update(elementsIdentite(resultat).join('\n'), 'utf8').digest('hex').slice(0, 16);
}

/** Ce qu'une exécution avait et que l'autre n'a plus, et l'inverse. */
export interface EcartElements {
  perdus: string[];
  apparus: string[];
}

export interface DivergenceEmpreinte {
  scenarioId: string;
  /** Les deux sens de l'identité : perdre est une faute, gagner est une question. */
  identite: EcartElements;
  /** Le second tableau : il s'affiche, il ne bloque pas. */
  effort: EcartElements;
}

function ecart(avant: string[], apres: string[]): EcartElements {
  const ensembleApres = new Set(apres);
  const ensembleAvant = new Set(avant);
  return {
    perdus: avant.filter((e) => !ensembleApres.has(e)),
    apparus: apres.filter((e) => !ensembleAvant.has(e)),
  };
}

function vide(e: EcartElements): boolean {
  return e.perdus.length === 0 && e.apparus.length === 0;
}

/**
 * Compare deux exécutions scénario par scénario, identité et effort
 * séparément.
 *
 * Un scénario présent d'un seul côté est une divergence, jamais un silence.
 */
export function comparerEmpreintes(
  reference: readonly ResultatScenario[],
  optimise: readonly ResultatScenario[],
): DivergenceEmpreinte[] {
  const parId = new Map(optimise.map((r) => [r.scenarioId, r]));
  const divergences: DivergenceEmpreinte[] = [];
  for (const avant of reference) {
    const apres = parId.get(avant.scenarioId);
    const identite = ecart(elementsIdentite(avant), apres === undefined ? [] : elementsIdentite(apres));
    const effort = ecart(elementsEffort(avant), apres === undefined ? [] : elementsEffort(apres));
    if (!vide(identite) || !vide(effort)) {
      divergences.push({ scenarioId: avant.scenarioId, identite, effort });
    }
    parId.delete(avant.scenarioId);
  }
  for (const [scenarioId, apres] of parId) {
    divergences.push({
      scenarioId,
      identite: { perdus: [], apparus: elementsIdentite(apres) },
      effort: { perdus: [], apparus: elementsEffort(apres) },
    });
  }
  return divergences;
}

/**
 * LE VERDICT DE L'ORACLE, en un seul endroit pour qu'il ne se négocie pas
 * au cas par cas.
 *
 * Perdre une identité est l'erreur cardinale du projet : c'est le seul
 * ÉCHEC. En gagner une n'est pas une équivalence pour autant — c'est une
 * question, et elle s'affiche assez fort pour qu'on y réponde par écrit ;
 * mais l'oracle n'est pas seul à la garder, puisqu'une anomalie gagnée à
 * tort est un FAUX POSITIF, que le banc compte et punit déjà.
 */
export function identitesPerdues(divergences: readonly DivergenceEmpreinte[]): number {
  return divergences.reduce((somme, d) => somme + d.identite.perdus.length, 0);
}

export function identitesApparues(divergences: readonly DivergenceEmpreinte[]): number {
  return divergences.reduce((somme, d) => somme + d.identite.apparus.length, 0);
}
