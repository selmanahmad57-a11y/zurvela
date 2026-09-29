/**
 * Gabarit n°5 « site-lent » : un accueil qui lie douze pages de contenu.
 * Sain, il est instantané et sans défaut. Sous L02, chaque page coûte, et la
 * première visite d'une page dépasse le seuil de lenteur : c'est le site qui
 * fait mesurer la répartition de l'échéance (cahier P2-1, contrat 2) et la
 * mesure au rejeu (contrat 4). L'API de contact existe pour la forme.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_CONTACT, PAGES_CONTENU, PAGE_ACCUEIL, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const siteLent: Gabarit = {
  nom: 'site-lent',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    ...Object.fromEntries(PAGES_CONTENU.map((chemin) => [chemin, `pages/contenu-${chemin.split('/').at(-1) ?? ''}.html`])),
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_CONTACT,
  traiterApi,
  bugs,
};
