/**
 * R01 api-lente : la soumission répond après `delaiReponseMs` (défaut dans
 * config/banc.json, surchargeable par le scénario), contenu intact.
 */
import type { BugInjectable } from '../../../types.js';
import { PAGE_CONTACT } from '../structure.js';

function lireDelai(parametres: Record<string, unknown>): number {
  const delai = parametres['delaiReponseMs'];
  if (typeof delai !== 'number' || !Number.isFinite(delai) || delai < 0) {
    throw new Error(`R01 : le paramètre delaiReponseMs doit être un nombre fini ≥ 0 (reçu : ${String(delai)})`);
  }
  return delai;
}

export const R01: BugInjectable = {
  id: 'R01',
  nom: 'api-lente',
  categorie: 'performance',
  gravite: 'important',
  pages: [PAGE_CONTACT],
  validerParametres(parametres) {
    lireDelai(parametres);
  },
  async transformerReponseApi(reponse, _requete, contexte) {
    const delai = lireDelai(contexte.parametres);
    await contexte.attendre(delai);
    return reponse;
  },
};
