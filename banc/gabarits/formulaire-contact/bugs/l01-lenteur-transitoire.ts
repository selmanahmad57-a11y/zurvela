/**
 * L01 lenteur-transitoire : les `nbPremieresRequetesLentes` premières
 * soumissions de la vie du scénario répondent après `delaiReponseMs` ; les
 * suivantes répondent immédiatement. Contenu de la réponse intact.
 *
 * Déterministe (compteur par scénario, aucun aléa). Second faux positif
 * simulé : détecté en scan, puis ÉCARTÉ par le protocole (verdict attendu
 * `non-reproduite`), la mesure agrégée des re-exécutions passant sous le
 * seuil de lenteur.
 */
import type { BugInjectable } from '../../../types.js';
import { PAGE_CONTACT } from '../structure.js';
import { rangRequete } from './compteur.js';

function lireEntier(parametres: Record<string, unknown>, nom: string, minimum: number): number {
  const valeur = parametres[nom];
  if (typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur < minimum) {
    throw new Error(`L01 : le paramètre ${nom} doit être un entier ≥ ${minimum} (reçu : ${String(valeur)})`);
  }
  return valeur;
}

function lireParametres(parametres: Record<string, unknown>): { nbLentes: number; delaiMs: number } {
  return {
    nbLentes: lireEntier(parametres, 'nbPremieresRequetesLentes', 1),
    delaiMs: lireEntier(parametres, 'delaiReponseMs', 0),
  };
}

export const L01: BugInjectable = {
  id: 'L01',
  nom: 'lenteur-transitoire',
  categorie: 'performance',
  gravite: 'important',
  pages: [PAGE_CONTACT],
  // Constatable UNIQUEMENT en soumettant le formulaire : sous interaction
  // restreinte, ce bug est hors de portée et n'a pas d'attendu.
  exigeSoumission: true,
  verdictAttendu: 'non-reproduite',
  validerParametres(parametres) {
    lireParametres(parametres);
  },
  async transformerReponseApi(reponse, _requete, contexte) {
    const { nbLentes, delaiMs } = lireParametres(contexte.parametres);
    if (rangRequete(contexte) > nbLentes) {
      return reponse;
    }
    await contexte.attendre(delaiMs);
    return reponse;
  },
};
