/**
 * W03 mesure-tardive-au-rejeu : l'accueil charge un script de MESURE
 * D'AUDIENCE depuis la seconde origine — une balise que la page ne rappelle
 * jamais. La seconde origine le sert normalement pendant l'exploration, puis
 * tombe en panne au-delà des `visitesAvantPanne` premières visites de
 * l'accueil : c'est-à-dire PENDANT LE REJEU d'un autre défaut de la même
 * page, jamais avant.
 *
 * Il croise les deux contrats que rien ne croisait (APPRENTISSAGES n°25) :
 * la DÉCOUVERTE de P2-1 (contrat 8) et le TIERS SANS EFFET de P2-2
 * (contrat 1). Sur le réel, cette rencontre a publié vingt-deux sections
 * « service extérieur » à automationexercise et quatorze à expandtesting :
 * la doctrine filtrait les candidates du scan, et les découvertes du rejeu
 * entraient par l'autre porte.
 *
 * Attendu : un SILENCE vérifié, comme W01, mais pris par l'AUTRE porte. Le
 * moteur doit voir le tiers tomber pendant le rejeu — une candidate de
 * découverte existe, marquée sans effet — et l'écarter d'office au verdict
 * `sans-effet`. Rien n'appelle ce script : aucune erreur JavaScript, aucun
 * effet visible. S'il disparaissait pour une mauvaise raison (panne jamais
 * survenue, page jamais rejouée), l'attendu serait RATÉ : le banc vérifie le
 * silence, pas l'absence.
 *
 * Seul, il n'est jamais constatable — sans un autre défaut à rejouer, la
 * page n'est plus jamais rechargée et la panne n'arrive pas. D'où
 * `seulementEnCombinaison`, et la combinaison W02 + W03 déclarée en config.
 */
import type { BugInjectable, ContexteBug, ReponseHttp } from '../../../types.js';
import { insererAvantFermeture } from '../../../outils/transformations.js';
import { CHEMIN_MESURE_TIERCE, PAGE_ACCUEIL } from '../structure.js';

const CLE_VISITES = 'visitesAccueilW03';

/** Le corps servi tant que la seconde origine répond : une balise qui ne fait rien. */
const CORPS_MESURE = 'window.__mesure=1;';

function lireSeuil(parametres: Record<string, unknown>): number {
  const seuil = parametres['visitesAvantPanne'];
  if (typeof seuil !== 'number' || !Number.isInteger(seuil) || seuil < 0) {
    throw new Error(`W03 : le paramètre visitesAvantPanne doit être un entier ≥ 0 (reçu : ${String(seuil)})`);
  }
  return seuil;
}

function visites(contexte: ContexteBug): number {
  return Number(contexte.etat[CLE_VISITES] ?? 0);
}

export const W03: BugInjectable = {
  id: 'W03',
  nom: 'mesure-tardive-au-rejeu',
  // Catégorie, gravité et verdict d'un tiers SANS EFFET : jamais publié.
  categorie: 'fonctionnel',
  gravite: 'mineur',
  verdictAttendu: 'sans-effet',
  seulementEnCombinaison: true,
  pages: [PAGE_ACCUEIL],
  besoinOrigineTierce: true,
  validerParametres(parametres) {
    lireSeuil(parametres);
  },
  // Le compte se tient sur les requêtes de PAGE, jamais au démarrage : la
  // vérification des pages au démarrage du serveur ne doit pas consommer une
  // visite (même raison qu'en D02).
  noterVisite(chemin, contexte) {
    if (chemin === PAGE_ACCUEIL) {
      contexte.etat[CLE_VISITES] = visites(contexte) + 1;
    }
  },
  transformerHtml(html, chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return html;
    }
    if (contexte.origineTierce === null) {
      throw new Error('W03 : aucune origine tierce fournie alors que le bug la déclare nécessaire');
    }
    // Chargée, jamais rappelée : son échec ne peut produire aucune erreur.
    const balise = `<script src="${contexte.origineTierce}${CHEMIN_MESURE_TIERCE}" async></script>`;
    return insererAvantFermeture(html, 'body', balise);
  },
  servirTiers(chemin, _requete, contexte): ReponseHttp | null {
    if (chemin !== CHEMIN_MESURE_TIERCE) {
      return null;
    }
    if (visites(contexte) > lireSeuil(contexte.parametres)) {
      return { statut: 503, entetes: { 'content-type': 'text/html; charset=utf-8' }, corps: '<h1>503</h1>' };
    }
    return { statut: 200, entetes: { 'content-type': 'text/javascript; charset=utf-8' }, corps: CORPS_MESURE };
  },
};
