/**
 * D-ECHEC-MUET : une soumission dont LA requête échoue (statut ≥ 400 ou
 * requête échouée) sans que la page ne réagisse — aucune mutation du DOM
 * dans la zone du formulaire APRÈS la réponse en échec, et pas de
 * navigation → `echec-muet`. Couvre F02.
 *
 * Seules les requêtes capables de porter une soumission comptent (types de
 * ressource en config : document, xhr, fetch) : un pixel de suivi en 404 ou
 * un beacon tiers bloqué pendant la fenêtre n'est pas l'échec du formulaire.
 * La réaction de la page est jugée STRUCTURELLEMENT (mutations dans la zone
 * du formulaire, comptées par l'observateur), jamais par son texte.
 *
 * Confiance : base UNIQUE (config), sans palier. L'échec réseau est certain,
 * mais la moitié du constat est une ABSENCE de réaction visible : une page
 * qui affiche son erreur hors de la zone du formulaire serait comptée à tort.
 * C'est, avec D-INERTE, le constat le plus fragile du moteur ; la brique 3 le
 * calibrera en rejouant la soumission.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { construireCandidate, elementDe } from './commun.js';

export const NOM_DETECTEUR_ECHEC_MUET = 'd-echec-muet';
export const DESCRIPTION_ECHEC_MUET = 'echec-muet';

/** Premier statut des classes « erreur » (client puis serveur, RFC 9110). */
const STATUT_ERREUR = 400;

type SignalEchec = Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' }>;

function estEchecLie(signal: Signal, actionId: string, typesRequete: string[]): signal is SignalEchec {
  if (signal.actionId !== actionId) {
    return false;
  }
  if (signal.type !== 'requete-echouee' && signal.type !== 'reponse-reseau') {
    return false;
  }
  if (!typesRequete.includes(signal.typeRessource)) {
    return false;
  }
  return signal.type === 'requete-echouee' || signal.statut >= STATUT_ERREUR;
}

export function creerDetecteurEchecMuet(config: ConfigScanner['detecteurs']['echecMuet']): Detecteur {
  return {
    nom: NOM_DETECTEUR_ECHEC_MUET,
    dependDuViewport: false,
    detecter(signaux, contexte) {
      const candidates: AnomalieCandidate[] = [];
      for (const action of contexte.parcours.actions) {
        if (action.action.type !== 'soumettre' || action.resultat !== 'ok') {
          continue;
        }
        const lies = signaux.filter((signal) => signal.actionId === action.id);
        const echecs = lies.filter((signal): signal is SignalEchec => estEchecLie(signal, action.id, config.typesRequete));
        if (echecs.length === 0 || lies.some((signal) => signal.type === 'navigation')) {
          continue;
        }
        // La page a « répondu » si sa zone bouge après le PREMIER échec ;
        // les mutations antérieures (désactivation du bouton…) ne comptent pas.
        const instantEchec = Math.min(...echecs.map((signal) => Date.parse(signal.horodatage)));
        const reaction = lies.some(
          (signal) => signal.type === 'mutation-dom' && signal.nbZone > 0 && Date.parse(signal.horodatage) > instantEchec,
        );
        if (reaction) {
          continue;
        }
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_ECHEC_MUET,
              description: DESCRIPTION_ECHEC_MUET,
              categorie: 'fonctionnel',
              gravite: config.gravite,
              confiance: config.confiance,
              page: action.page,
              viewport: action.viewport,
              dependDuViewport: false,
              action,
              element: elementDe(action),
              preuves: echecs,
            },
            contexte,
          ),
        );
      }
      return candidates;
    },
  };
}
