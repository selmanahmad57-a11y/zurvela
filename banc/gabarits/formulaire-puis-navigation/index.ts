/**
 * Gabarit n°3 « formulaire-puis-navigation » : accueil, page d'inscription
 * avec un formulaire (que la déterministe remplit sans le soumettre), et un
 * catalogue atteint ENSUITE — la page où le défaut se voit. Le site sain
 * tient en trois pages ; son seul intérêt est l'ordre des actions qu'il
 * impose : remplir, puis naviguer (cahier P2-1, contrat 1).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHAMPS_INSCRIPTION, CHEMIN_API_INSCRIPTION, PAGE_ACCUEIL, PAGE_CATALOGUE, PAGE_INSCRIPTION, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

function corpsValide(corps: RequeteApi['corps']): boolean {
  if (corps === null) {
    return false;
  }
  return CHAMPS_INSCRIPTION.every((champ) => {
    const valeur = corps[champ];
    return typeof valeur === 'string' && valeur.trim() !== '';
  });
}

async function traiterApi(requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  const ok = corpsValide(requete.corps);
  return { statut: ok ? 200 : 400, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok }) };
}

export const formulairePuisNavigation: Gabarit = {
  nom: 'formulaire-puis-navigation',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    [PAGE_INSCRIPTION]: 'pages/inscription.html',
    [PAGE_CATALOGUE]: 'pages/catalogue.html',
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_INSCRIPTION,
  traiterApi,
  bugs,
};
