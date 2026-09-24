/**
 * LE PONT DES VOCABULAIRES — traduction explicite, jamais symétrie.
 *
 * Le modèle parle de CAUSES (`AvisCause` : outil, site, indetermine), le
 * protocole parle de DÉCISIONS (`VerdictConfirmation` : confirmée,
 * intermittente, non reproduite, limite d'automatisation, basse confiance).
 * Les deux vocabulaires ont trois et cinq valeurs, ils ne se recouvrent pas,
 * et les aligner par ressemblance de noms serait une fausse symétrie : « le
 * site est en cause » ne veut pas dire « l'anomalie est confirmée ».
 *
 * Ce module est le SEUL endroit du dépôt où un `AvisCause` devient un
 * `VerdictConfirmation`. Un test de garde parcourt le dépôt et le vérifie :
 * la table est unique, ou elle n'est pas une table.
 *
 * TROIS LIGNES, UN SEUL VERDICT RENDU. Le codomaine de la table est réduit à
 * `limite-automatisation` : quel que soit l'avis, le groupe reste ÉCARTÉ.
 * C'est structurel, pas une politique — un avis ne promeut jamais un verdict
 * (A5 : le doute ne monte jamais la confiance). Le jour où l'on voudra
 * retenir sur avis, ce sera par une RE-EXÉCUTION supplémentaire déclenchée
 * par l'avis — une preuve achetée, pas une opinion crue — et c'est une
 * brique future, pas un ajustement de cette table.
 *
 * | avis          | verdict rendu          | effet                                   |
 * | ------------- | ---------------------- | --------------------------------------- |
 * | `outil`       | limite-automatisation  | inchangé de fait ; le motif dit que l'avis l'a confirmé |
 * | `indetermine` | limite-automatisation  | le silence DEMEURE mais il est MOTIVÉ — c'est la différence entre se taire et n'avoir rien à dire |
 * | `site`        | limite-automatisation  | le groupe reste écarté ET une DÉCOUVERTE est émise, confiance minorée |
 */
import type { AvisCause } from '../../ia/index.js';
import type { VerdictConfirmation } from '../../types.js';

/**
 * Le seul verdict que la table sait rendre. Nommé pour que le test de
 * l'invariant le lise plutôt que de le recopier : un invariant recopié dans
 * son propre test ne prouve rien.
 */
export const VERDICT_DU_PONT: VerdictConfirmation = 'limite-automatisation';

/** L'avis a confirmé la limite d'automatisation : le silence est désormais imputé. */
export const MOTIF_DIAGNOSTIC_OUTIL = 'diagnostic-outil';
/**
 * Le diagnostic a AVOUÉ son ignorance. Le silence demeure, mais il est motivé :
 * on sait désormais que la question a été posée et qu'elle est restée ouverte.
 */
export const MOTIF_DIAGNOSTIC_INDETERMINE = 'diagnostic-indetermine';
/**
 * Avis « cause site » : le groupe reste écarté. Le motif le DIT, plutôt que
 * de laisser croire que l'avis a été ignoré — une opinion ne remonte pas un
 * verdict, et la trace doit porter les deux moitiés de la phrase.
 */
export const MOTIF_DIAGNOSTIC_SITE_ECARTE = 'diagnostic-site-groupe-ecarte';
/** Motif de la DÉCOUVERTE émise sur un avis « cause site » (troisième état épistémique). */
export const MOTIF_DECOUVERTE_DIAGNOSTIC_SITE = 'diagnostic-site';

/** Ce que la table rend : un verdict, son motif, et l'éventuelle découverte à émettre. */
export interface TraductionAvis {
  verdict: VerdictConfirmation;
  /** Identifiant technique stable, jamais de prose. */
  motif: string;
  /**
   * Découverte à publier EN PLUS du verdict — uniquement sur un avis « site ».
   * `facteurConfiance` est STRICTEMENT inférieur à 1 (invariant du schéma de
   * `config/diagnostic.json`) : un avis n'est pas une preuve.
   */
  decouverte?: { facteurConfiance: number; motif: string };
}

export interface BornesTraduction {
  /** `diagnostic.facteurConfianceDecouverte` : borné `exclusiveMinimum: 0` / `exclusiveMaximum: 1` par le schéma. */
  facteurConfianceDecouverte: number;
}

/**
 * Traduit un avis de cause en décision de protocole.
 *
 * La fonction ne reçoit PAS le verdict brut du groupe, et c'est délibéré :
 * si elle le recevait, quelqu'un finirait par écrire « sauf quand le verdict
 * brut était déjà X ». Une table qui dépend de l'état qu'elle traduit n'est
 * plus une table, c'est une politique diffuse.
 */
export function traduireAvis(avis: AvisCause, bornes: BornesTraduction): TraductionAvis {
  switch (avis) {
    case 'outil':
      return { verdict: VERDICT_DU_PONT, motif: MOTIF_DIAGNOSTIC_OUTIL };
    case 'indetermine':
      return { verdict: VERDICT_DU_PONT, motif: MOTIF_DIAGNOSTIC_INDETERMINE };
    case 'site':
      return {
        verdict: VERDICT_DU_PONT,
        motif: MOTIF_DIAGNOSTIC_SITE_ECARTE,
        decouverte: {
          facteurConfiance: bornes.facteurConfianceDecouverte,
          motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE,
        },
      };
  }
}

/**
 * Confiance d'une découverte émise sur avis : la confiance d'ORIGINE du
 * détecteur, minorée.
 *
 * Les deux bornes ne sont pas des ceintures de sécurité décoratives : le
 * facteur vient de la configuration, et une config est un réglage — les
 * bornes, elles, sont des INVARIANTS. Le schéma les exprime
 * (`exclusiveMinimum: 0`, `exclusiveMaximum: 1`), le code les tient aussi,
 * parce qu'une confiance qui monte sur une opinion serait la violation exacte
 * que toute la brique existe pour empêcher.
 *
 * LES DEUX CÔTÉS, et pas seulement le haut. Cette fonction est le SEUL
 * producteur d'`Anomalie.confiance` du protocole qui ne passe pas par
 * `calibrer()` : la découverte sur avis porte la confiance d'origine minorée,
 * jamais la confiance calibrée. Elle contourne donc le plancher que
 * `calibration.ts` déclare pour tous les autres chemins
 * (`CONFIANCE_PLANCHER` / `CONFIANCE_PLAFOND`, « une config fautive ne peut
 * pas faire sortir une confiance de [0, 1] »). Et le facteur n'arrive pas
 * toujours de la config : `AvisDiagnostic.decouverte.facteurConfiance` est un
 * champ d'interface que n'importe quelle implémentation d'`AutoDiagnostic`
 * remplit — `traduireAvis` n'en est qu'un des remplisseurs. Un facteur
 * négatif publierait une confiance négative ; la borne basse le refuse ici,
 * là où la borne haute est déjà refusée.
 */
export function confianceMinoree(confianceOrigine: number, facteur: number): number {
  return Math.max(0, Math.min(confianceOrigine, confianceOrigine * facteur));
}
