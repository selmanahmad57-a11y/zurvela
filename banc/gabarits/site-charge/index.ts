/**
 * Gabarit n°9 « site-charge » (cahier P2-4, contrat 5) : huit rayons et un
 * accueil, servis lentement, chacun appelant plusieurs ressources absentes
 * à des adresses distinctes.
 *
 * Il existe pour une seule raison : METTRE LE BUDGET DE CONFIRMATION SOUS
 * TENSION, de façon DÉTERMINISTE et GRATUITE. Les trois sites qui bloquent
 * la mesure du bruit (automationexercise, demoqa, expandtesting) explorent
 * différemment à chaque passage et coûtent cinq minutes le scan : régler le
 * budget de rejeu sur eux, ce serait régler sur une cible qui bouge
 * (APPRENTISSAGES n°32) et payer chaque itération. Ici, la mise au point
 * est reproductible et ne coûte rien.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Gabarit, ReponseHttp, RequeteApi } from '../../types.js';
import { bugs } from './bugs/index.js';
import { CHEMIN_API_CONTACT, PAGES_RAYON, PAGE_ACCUEIL, PREFIXE_STATIQUE } from './structure.js';

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8' };

async function traiterApi(_requete: RequeteApi, contexte: { langue: string; delaiReponseMs: number }): Promise<ReponseHttp> {
  if (contexte.delaiReponseMs > 0) {
    await new Promise<void>((resoudre) => setTimeout(resoudre, contexte.delaiReponseMs));
  }
  return { statut: 200, entetes: { ...ENTETES_JSON }, corps: JSON.stringify({ ok: true }) };
}

export const siteCharge: Gabarit = {
  nom: 'site-charge',
  dossierSite: path.join(path.dirname(fileURLToPath(import.meta.url)), 'site'),
  routesPages: {
    [PAGE_ACCUEIL]: 'pages/accueil.html',
    // Toutes les pages de rayon partagent un modèle : c'est leur NOMBRE qui
    // compte, pas leur contenu.
    ...Object.fromEntries(PAGES_RAYON.map((chemin) => [chemin, 'pages/rayon.html'])),
  },
  prefixeStatique: PREFIXE_STATIQUE,
  dossierStatique: 'statique',
  dossierLocales: 'locales',
  cheminApiFormulaire: CHEMIN_API_CONTACT,
  traiterApi,
  bugs,
};
