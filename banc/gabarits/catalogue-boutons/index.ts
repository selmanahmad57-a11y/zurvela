/**
 * Gabarit n°4 « catalogue-boutons » : huit pages de vingt articles, chacun
 * avec un formulaire réduit à un bouton. Le site sain n'a rien à signaler ;
 * son intérêt est ce qu'il COÛTE à une politique qui remplirait tout ce qui
 * se présente (cahier P2-1, contrat 3). L'API du panier existe pour la forme :
 * le banc explore ce gabarit sous `soumission: aucune`, comme la campagne.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_PANIER, PAGE_ACCUEIL, PAGES_SUITE, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const catalogueBoutons: Gabarit = {
  nom: 'catalogue-boutons',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/page-1.html',
    ...Object.fromEntries(PAGES_SUITE.map((chemin) => [chemin, `pages/page-${chemin.split('/').at(-1) ?? ''}.html`])),
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_PANIER,
  traiterApi,
  bugs,
};
