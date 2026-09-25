/**
 * I01 api-intermittente : la soumission échoue en 500 une requête sur
 * `requetesParEchec` — la 1ʳᵉ échoue, la 2ᵉ passe, la 3ᵉ échoue…
 *
 * Déterministe (compteur par scénario, aucun aléa). Verdict attendu :
 * `intermittente`, anomalie RETENUE — un défaut qui frappe une requête sur
 * deux est un vrai défaut.
 *
 * ── GRAVITÉ : `bloquant`, CORRIGÉ LE 2026-09-25 ─────────────────────────────
 *
 * Ce bug déclarait `important` depuis la brique 1, et personne ne l'avait
 * jamais confronté : `AttenduBug.gravite` était dérivé par le manifeste et
 * comparé par RIEN (APPRENTISSAGES n°4, variante sur la clé d'appariement).
 * Le premier constat du contrôle de gravité a relevé les quatre scénarios
 * portant I01, et lui seul.
 *
 * C'est l'ATTENDU qui avait tort, pas le moteur. Tous les autres échecs
 * fonctionnels de soumission du gabarit — F01, F02, T01, S05 — sont
 * `bloquant`, et la règle du moteur est explicite : un 5xx lié à une
 * soumission est son signal le plus fort (`detecteurs.http.gravite5xxSoumission`).
 *
 * L'INTERMITTENCE N'EST PAS UNE MOINDRE GRAVITÉ : ce sont deux axes, et le
 * rapport les publie séparément. La gravité dit ce qui arrive QUAND cela
 * arrive — le visiteur ne peut pas vous joindre —, le statut dit à quelle
 * fréquence — « se produit par intermittence ». Les fondre dégraderait la
 * gravité d'un défaut qui, le jour où il frappe, bloque entièrement.
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
  gravite: 'bloquant',
  pages: [PAGE_CONTACT],
  // Constatable UNIQUEMENT en soumettant le formulaire : sous interaction
  // restreinte, ce bug est hors de portée et n'a pas d'attendu.
  exigeSoumission: true,
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
