/**
 * AUTO-DIAGNOSTIC : « défaut du site, ou limite de mon automatisation ? ».
 *
 * C'est le LOGEMENT de la brique 4+ (comme la confirmation était le logement
 * de la brique 3) : l'interface `AutoDiagnostic` est le point d'extension,
 * l'implémentation de cette brique est purement MÉCANIQUE et ne coûte rien
 * (aucun appel IA, coût banc toujours 0,00 €).
 *
 * Règle mécanique unique, et la plus utile : quand une partie des tentatives
 * a échoué pour une cause d'outillage et qu'aucune tentative exploitable n'a
 * rien reproduit, le silence n'est pas une preuve d'innocence du site — le
 * rejeu n'a pas vraiment eu lieu. On ne dit donc pas « non reproduite », on
 * dit « limite d'automatisation ».
 *
 * Le protocole n'applique l'avis que s'il CHANGE le verdict : un groupe déjà
 * jugé `limite-automatisation` garde son motif, plus précis.
 */
import type { AutoDiagnostic } from '../../types.js';
import { estExploitable } from './verdict.js';

export const NOM_AUTO_DIAGNOSTIC_MECANIQUE = 'auto-diagnostic-mecanique';
export const MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE = 'rejeu-partiellement-impossible';

export const autoDiagnosticMecanique: AutoDiagnostic = {
  nom: NOM_AUTO_DIAGNOSTIC_MECANIQUE,
  diagnostiquer(resultat) {
    const inexploitable = resultat.tentatives.some((tentative) => !estExploitable(tentative));
    const reproduite = resultat.tentatives.some((tentative) => estExploitable(tentative) && tentative.reproduite);
    if (inexploitable && !reproduite) {
      return Promise.resolve({
        verdict: 'limite-automatisation' as const,
        motif: MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE,
        coutApi: 0,
      });
    }
    return Promise.resolve(null);
  },
};
