/**
 * W01 police-refusee-au-robot : l'accueil charge sa police de titre depuis
 * une seconde origine, qui la sert à un NAVIGATEUR (avec l'en-tête CORS qu'une
 * police exige) mais la REFUSE au robot déclaré — même corps, sans l'en-tête.
 * Le navigateur du robot bloque alors la police en `net::ERR_FAILED` : le
 * mécanisme exact de Google Fonts sur trois sites de la campagne
 * (APPRENTISSAGES n°19). Le titre s'affiche dans une police système : AUCUN
 * effet visible.
 *
 * Attendu : un SILENCE vérifié (cahier P2-2, contrat 1, D2). Le moteur doit
 * voir le tiers en échec — une candidate existe, marquée sans effet — et
 * l'écarter d'office au verdict `sans-effet`. Si la candidate disparaissait
 * (police jamais chargée, compte à zéro), l'attendu serait RATÉ : le banc
 * vérifie le silence, pas l'absence.
 */
import type { BugInjectable, ReponseHttp } from '../../../types.js';
import { insererAvantFermeture } from '../../../outils/transformations.js';
import { CHEMIN_POLICE_TIERCE, PAGE_ACCUEIL } from '../structure.js';

function lireEnTeteRobot(parametres: Record<string, unknown>): string {
  const enTete = parametres['enTeteRobot'];
  if (typeof enTete !== 'string' || enTete === '') {
    throw new Error(`W01 : le paramètre enTeteRobot doit être un nom d'en-tête HTTP non vide (reçu : ${String(enTete)})`);
  }
  return enTete.toLowerCase();
}

/** Le corps servi : une police factice. Seul l'en-tête CORS change selon qui demande. */
const CORPS_POLICE = 'wOF2';

export const W01: BugInjectable = {
  id: 'W01',
  nom: 'police-refusee-au-robot',
  // Catégorie, gravité et verdict d'un tiers SANS EFFET : jamais publié.
  categorie: 'fonctionnel',
  gravite: 'mineur',
  verdictAttendu: 'sans-effet',
  pages: [PAGE_ACCUEIL],
  besoinOrigineTierce: true,
  validerParametres(parametres) {
    lireEnTeteRobot(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    if (contexte.origineTierce === null) {
      throw new Error('W01 : aucune origine tierce fournie alors que le bug la déclare nécessaire');
    }
    const style = `<style>@font-face{font-family:"TitreTiers";src:url("${contexte.origineTierce}${CHEMIN_POLICE_TIERCE}") format("woff2")}h1{font-family:"TitreTiers",serif}</style>`;
    return insererAvantFermeture(html, 'head', style);
  },
  servirTiers(chemin, requete, contexte): ReponseHttp | null {
    if (chemin !== CHEMIN_POLICE_TIERCE) {
      return null;
    }
    const robot = requete.entetes[lireEnTeteRobot(contexte.parametres)] !== undefined;
    return {
      statut: 200,
      entetes: robot ? { 'content-type': 'font/woff2' } : { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' },
      corps: CORPS_POLICE,
    };
  },
};
