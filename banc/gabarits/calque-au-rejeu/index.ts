/**
 * Gabarit n°6 « calque-au-rejeu » (clôture de P2-1, dette n°20) : un accueil
 * à trois offres et trois pages d'offre. Sain, il n'a rien à signaler. Sous
 * D01 + D02, le rejeu de l'image cassée de l'accueil fait voir un calque que
 * l'exploration n'a jamais vu : la seule façon DÉTERMINISTE d'éprouver au
 * banc les découvertes au rejeu, qu'aucune cible vivante ne rend deux fois
 * pareilles (expandtesting : 40, 20 puis 36 découvertes le même jour).
 * L'API de contact existe pour la forme.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_CONTACT, PAGES_OFFRE, PAGE_ACCUEIL, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const calqueAuRejeu: Gabarit = {
  nom: 'calque-au-rejeu',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    ...Object.fromEntries(PAGES_OFFRE.map((chemin) => [chemin, `pages/offre-${chemin.split('/').at(-1) ?? ''}.html`])),
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_CONTACT,
  traiterApi,
  bugs,
};
