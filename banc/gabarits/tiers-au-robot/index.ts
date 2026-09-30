/**
 * Gabarit n°7 « tiers-au-robot » (cahier P2-2, contrat 6) : un accueil de
 * commerce et une page d'atelier. Sain, il ne dépend d'aucune seconde origine.
 * W01 et W02 lui en donnent une, et éprouvent le contrat 1 dans ses DEUX
 * sens : un tiers qui échoue sans effet visible doit être tu (W01), un tiers
 * qui échoue en cassant la page doit être publié (W02). L'API de contact
 * existe pour la forme.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_CONTACT, PAGE_ACCUEIL, PAGE_ATELIER, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const tiersAuRobot: Gabarit = {
  nom: 'tiers-au-robot',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    [PAGE_ATELIER]: 'pages/atelier.html',
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_CONTACT,
  traiterApi,
  bugs,
};
