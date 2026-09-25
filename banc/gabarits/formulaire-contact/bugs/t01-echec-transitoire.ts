/**
 * T01 echec-transitoire : les `nbPremieresRequetesEnEchec` premières
 * soumissions de la vie du scénario échouent en 500 ; toutes les suivantes
 * réussissent.
 *
 * Déterministe (compteur par scénario, aucun aléa). C'est le FAUX POSITIF
 * SIMULÉ : le scan doit le détecter, puis le protocole de confirmation doit
 * l'ÉCARTER (verdict attendu `non-reproduite`). Le banc compte cette mise à
 * l'écart comme une réussite.
 */
import type { BugInjectable } from '../../../types.js';
import { PAGE_CONTACT } from '../structure.js';
import { rangRequete } from './compteur.js';

/** Panne serveur (standard technique universel). */
const STATUT_ECHEC = 500;

function lireNombreEnEchec(parametres: Record<string, unknown>): number {
  const nombre = parametres['nbPremieresRequetesEnEchec'];
  if (typeof nombre !== 'number' || !Number.isInteger(nombre) || nombre < 1) {
    throw new Error(`T01 : le paramètre nbPremieresRequetesEnEchec doit être un entier ≥ 1 (reçu : ${String(nombre)})`);
  }
  return nombre;
}

export const T01: BugInjectable = {
  id: 'T01',
  nom: 'echec-transitoire',
  categorie: 'fonctionnel',
  gravite: 'bloquant',
  pages: [PAGE_CONTACT],
  // Constatable UNIQUEMENT en soumettant le formulaire : sous interaction
  // restreinte, ce bug est hors de portée et n'a pas d'attendu.
  exigeSoumission: true,
  verdictAttendu: 'non-reproduite',
  validerParametres(parametres) {
    lireNombreEnEchec(parametres);
  },
  async transformerReponseApi(reponse, _requete, contexte) {
    if (rangRequete(contexte) > lireNombreEnEchec(contexte.parametres)) {
      return reponse;
    }
    return { ...reponse, statut: STATUT_ECHEC, corps: JSON.stringify({ ok: false }) };
  },
};
