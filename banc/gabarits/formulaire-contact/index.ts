/**
 * Gabarit n°1 « formulaire-contact » : mini-site d'entreprise fictive
 * (accueil, contact avec formulaire, confirmation) + backend de formulaire
 * sain + registre des bugs injectables.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import {
  CHAMPS_FORMULAIRE,
  CHEMIN_API_FORMULAIRE,
  PAGE_ACCUEIL,
  PAGE_CONFIRMATION,
  PAGE_CONTACT,
  PREFIXE_STATIQUE,
} from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

/** Un champ est valide s'il est présent et non vide après trim — aucune validation de format ni de langue. */
function corpsValide(corps: RequeteApi['corps']): boolean {
  if (corps === null) {
    return false;
  }
  return CHAMPS_FORMULAIRE.every((champ) => {
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

export const formulaireContact: Gabarit = {
  nom: 'formulaire-contact',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    [PAGE_CONTACT]: 'pages/contact.html',
    [PAGE_CONFIRMATION]: 'pages/confirmation.html',
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_FORMULAIRE,
  traiterApi,
  bugs,
  /**
   * Ce que l'IA doit dire de ce site : une vitrine d'entreprise avec un
   * formulaire de contact. `langue: null` = celle du scénario — le site est
   * intégralement traduit, un gabarit servi en `en` doit être profilé `en`,
   * et un écart entre les deux langues serait un biais à voir (Mur 3).
   *
   * Porté par le GABARIT et non par un bug : c'est une propriété du site.
   * `typeSite` est une valeur du vocabulaire de `config/profilage.json` ; le
   * banc n'en connaît aucune, il recopie ce que le gabarit déclare.
   */
  profilAttendu: { typeSite: 'vitrine-contact', langue: null },
};
