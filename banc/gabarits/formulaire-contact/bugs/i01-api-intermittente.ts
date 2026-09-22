/**
 * I01 api-intermittente : la soumission échoue en 500 une requête sur
 * `requetesParEchec` — la 1ʳᵉ échoue, la 2ᵉ passe, la 3ᵉ échoue…
 *
 * Déterministe (compteur par scénario, aucun aléa). Verdict attendu :
 * `intermittente`, anomalie RETENUE — un défaut qui frappe une requête sur
 * deux est un vrai défaut.
 */
import type { BugInjectable } from '../../../types.js';
import { PAGE_CONTACT } from '../structure.js';
import { rangRequete } from './compteur.js';

/** Panne serveur (standard technique universel). */
const STATUT_ECHEC = 500;

/** Une périodicité de 1 ferait échouer zéro requête : le bug ne serait plus injecté. */
const PERIODE_MINIMALE = 2;

function lirePeriode(parametres: Record<string, unknown>): number {
  const periode = parametres['requetesParEchec'];
  if (typeof periode !== 'number' || !Number.isInteger(periode) || periode < PERIODE_MINIMALE) {
    throw new Error(`I01 : le paramètre requetesParEchec doit être un entier ≥ ${PERIODE_MINIMALE} (reçu : ${String(periode)})`);
  }
  return periode;
}

export const I01: BugInjectable = {
  id: 'I01',
  nom: 'api-intermittente',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_CONTACT],
  verdictAttendu: 'intermittente',
  validerParametres(parametres) {
    lirePeriode(parametres);
  },
  async transformerReponseApi(reponse, _requete, contexte) {
    const periode = lirePeriode(contexte.parametres);
    if (rangRequete(contexte) % periode !== 1) {
      return reponse;
    }
    return { ...reponse, statut: STATUT_ECHEC, corps: JSON.stringify({ ok: false }) };
  },
};
