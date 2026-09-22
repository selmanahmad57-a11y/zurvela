/**
 * Étape CONFIRMATION, implémentation « passe-plat » : le logement du
 * protocole anti-faux-positifs (brique 3). Ici, toute candidate est retenue
 * telle quelle, confiance inchangée, sans appel IA (coût 0).
 */
import type { ProtocoleConfirmation } from '../../types.js';

export const NOM_PROTOCOLE_PASSE_PLAT = 'passe-plat';

export const protocolePassePlat: ProtocoleConfirmation = {
  nom: NOM_PROTOCOLE_PASSE_PLAT,
  async confirmer(candidates, contexte) {
    contexte.journaliser('confirmation.passe-plat', { nbCandidates: candidates.length, nbRetenues: candidates.length });
    return { retenues: [...candidates], ecartees: [], coutApi: 0 };
  },
};
