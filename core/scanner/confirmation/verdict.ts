/**
 * VERDICT (3e étape du protocole) : de la matrice des re-exécutions à un
 * statut énuméré et MOTIVÉ. Aucune prose : le motif est un identifiant
 * technique stable, lisible par le banc comme par le rapport.
 *
 * La distinction cardinale de la brique : une re-exécution qui ÉCHOUE
 * (navigateur, délai, sélecteur perdu) n'est pas une anomalie qui ne se
 * reproduit pas. C'est la catégorie que l'étude des 85 % de bruit confond
 * avec un défaut du site ; elle a ici son verdict à elle.
 *
 * Détecteur GRADUÉ (celui qui expose `mesureDe`/`seuilMesure`, D-LENTEUR
 * aujourd'hui) : le protocole ne sait rien de la lenteur, il agrège une
 * mesure opaque et la compare au seuil que le détecteur lui donne. Sous le
 * seuil, l'anomalie n'est pas reproduite, quel que soit le comptage.
 */
import type { CauseEchecRejeu, TentativeReexecution, VerdictConfirmation } from '../../types.js';
import type { ConfigConfirmation } from '../config.js';

/** Motifs de verdict (identifiants techniques stables, jamais de prose). */
export const MOTIF_REJEU_IMPOSSIBLE = 'rejeu-impossible';
export const MOTIF_REPRODUITE = 'reproduite';
export const MOTIF_REPRODUCTION_PARTIELLE = 'reproduction-partielle';
export const MOTIF_JAMAIS_REPRODUITE = 'jamais-reproduite';
export const MOTIF_MESURE_SOUS_SEUIL = 'mesure-sous-seuil';
export const MOTIF_CONFIANCE_SUFFISANTE = 'confiance-suffisante';
export const MOTIF_ECHEANCE_ATTEINTE = 'echeance-atteinte';

/**
 * Une tentative dit quelque chose du SITE si elle s'est déroulée, ou si son
 * échec est imputable au site lui-même (`reseau-site` : le serveur s'est tu,
 * c'est un constat). Un rejeu que l'outil n'a pas su mener — ou dont on ne
 * sait pas à qui la faute — n'autorise aucune conclusion.
 */
export function estExploitable(tentative: { echecOutillage: boolean; causeEchec?: CauseEchecRejeu }): boolean {
  return !tentative.echecOutillage || tentative.causeEchec === 'reseau-site';
}

export interface Jugement {
  verdict: VerdictConfirmation;
  motif: string;
  /** Reproduites / tentatives exploitables ; null si aucune tentative exploitable. */
  tauxReproduction: number | null;
  /** Agrégat des mesures brutes, pour un détecteur gradué seulement. */
  mesureAgregee?: number;
}

export interface OptionsJugement {
  /** Part des tentatives exploitables qui doit reproduire pour `confirmee`. */
  tauxRequis: number;
  agregation: ConfigConfirmation['agregationMesures'];
  /** Seuil du détecteur gradué ; absent pour un détecteur binaire. */
  seuilMesure?: number;
}

/**
 * Agrégat des mesures brutes selon la politique de config. Médiane d'un
 * nombre pair de mesures : moyenne des deux valeurs centrales (définition
 * usuelle, pas un seuil métier).
 */
export function agreger(mesures: number[], mode: ConfigConfirmation['agregationMesures']): number | undefined {
  if (mesures.length === 0) {
    return undefined;
  }
  if (mode === 'max') {
    return Math.max(...mesures);
  }
  if (mode === 'moyenne') {
    return mesures.reduce((somme, mesure) => somme + mesure, 0) / mesures.length;
  }
  const triees = [...mesures].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haute = triees[milieu];
  const basse = triees[milieu - 1];
  if (haute === undefined) {
    return undefined;
  }
  return triees.length % 2 === 1 || basse === undefined ? haute : (basse + haute) / 2;
}

/** Verdict brut d'un groupe, avant auto-diagnostic et calibration. */
export function juger(tentatives: TentativeReexecution[], options: OptionsJugement): Jugement {
  const exploitables = tentatives.filter(estExploitable);
  if (exploitables.length === 0) {
    return { verdict: 'limite-automatisation', motif: MOTIF_REJEU_IMPOSSIBLE, tauxReproduction: null };
  }
  const mesures = exploitables
    .map((tentative) => tentative.mesureMs)
    .filter((mesure): mesure is number => mesure !== undefined);
  const mesureAgregee = agreger(mesures, options.agregation);
  const taux = exploitables.filter((tentative) => tentative.reproduite).length / exploitables.length;
  const mesure = mesureAgregee === undefined ? {} : { mesureAgregee };

  // Détecteur gradué : la mesure agrégée prime sur le comptage. Une anomalie
  // re-constatée mais redescendue sous le seuil n'est plus une anomalie.
  if (mesureAgregee !== undefined && options.seuilMesure !== undefined && mesureAgregee <= options.seuilMesure) {
    return { verdict: 'non-reproduite', motif: MOTIF_MESURE_SOUS_SEUIL, tauxReproduction: taux, ...mesure };
  }
  if (taux >= options.tauxRequis) {
    return { verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: taux, ...mesure };
  }
  if (taux > 0) {
    // Un bug sur deux requêtes est un bug : l'anomalie est RETENUE, marquée intermittente.
    return { verdict: 'intermittente', motif: MOTIF_REPRODUCTION_PARTIELLE, tauxReproduction: taux, ...mesure };
  }
  return { verdict: 'non-reproduite', motif: MOTIF_JAMAIS_REPRODUITE, tauxReproduction: taux, ...mesure };
}
