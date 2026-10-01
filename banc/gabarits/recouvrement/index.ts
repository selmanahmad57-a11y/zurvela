/**
 * Gabarit n°8 « recouvrement » (cahier P2-3, contrat 6) : une boutique à
 * trois produits et un panier. Sain, rien ne recouvre rien.
 *
 * Il porte les deux faces du contrat 1 — Q01 à Q04 sont écartés par un
 * geste neutre et ne publient RIEN ; Q05 et Q06 ne cèdent à aucun geste et
 * sont publiés — et, parmi la première face, UN GESTE PAR GABARIT : retirer
 * un geste de la liste de config doit faire échouer son cas et lui seul,
 * sans quoi la liste serait verte sans qu'on sache lequel de ses gestes
 * porte (METHODE §10, extension sur la redondance).
 *
 * Q05 et Q06 portent aussi le contrat 2 : deux calques identiques, l'un sur
 * la soumission d'un formulaire (`bloquant`), l'autre sur un lien de pied de
 * page (`mineur`). Q07 porte le contrat 4.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_CONTACT, PAGE_ACCUEIL, PAGE_PANIER, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const recouvrement: Gabarit = {
  nom: 'recouvrement',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    [PAGE_PANIER]: 'pages/panier.html',
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_CONTACT,
  traiterApi,
  bugs,
};
