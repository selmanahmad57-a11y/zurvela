/**
 * D-HTTP : réponses serveur en erreur.
 * - statut ≥ 500 → `reponse-5xx` (bloquant si la réponse est liée à une
 *   soumission, important sinon) ;
 * - statut 404 sur une ressource interne → `ressource-interne-404`, catégorie
 *   selon le type de ressource (config).
 *
 * Paliers de confiance, par force du signal : un 5xx survenu PENDANT une
 * soumission est le constat le plus sûr du moteur (l'action et l'erreur sont
 * liées par la fenêtre d'observation) ; un 5xx de chargement l'est moins ; un
 * 404 sur une ressource interne moins encore (une ressource peut être
 * légitimement retirée). Valeurs en config, calibrées par la brique 3.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { construireCandidate, declencheurDe, estSoumission, localiserRessource, trouverAction } from './commun.js';

export const NOM_DETECTEUR_HTTP = 'd-http';
export const DESCRIPTION_5XX = 'reponse-5xx';
export const DESCRIPTION_404_INTERNE = 'ressource-interne-404';

/** Premier statut de la classe « erreur serveur » (RFC 9110). */
const STATUT_ERREUR_SERVEUR = 500;
const STATUT_INTROUVABLE = 404;

type SignalReponse = Extract<Signal, { type: 'reponse-reseau' }>;

export function creerDetecteurHttp(config: ConfigScanner['detecteurs']['http']): Detecteur {
  return {
    nom: NOM_DETECTEUR_HTTP,
    dependDuViewport: false,
    detecter(signaux, contexte) {
      const candidates: AnomalieCandidate[] = [];
      for (const signal of signaux) {
        if (signal.type !== 'reponse-reseau') {
          continue;
        }
        if (signal.statut >= STATUT_ERREUR_SERVEUR) {
          candidates.push(candidate5xx(signal));
        } else if (signal.statut === STATUT_INTROUVABLE && signal.interne) {
          candidates.push(candidate404(signal));
        }
      }
      return candidates;

      function candidate5xx(signal: SignalReponse): AnomalieCandidate {
        const action = trouverAction(contexte.parcours, signal.actionId);
        const soumission = estSoumission(action);
        return construireCandidate(
          {
            detecteur: NOM_DETECTEUR_HTTP,
            description: DESCRIPTION_5XX,
            categorie: config.categorieParDefaut,
            gravite: soumission ? config.gravite5xxSoumission : config.gravite5xx,
            confiance: soumission ? config.confiance5xxSoumission : config.confiance5xx,
            page: signal.page,
            viewport: signal.viewport,
            dependDuViewport: false,
            action,
            // Le bouton cliqué désigne l'élément en cause ; sans déclencheur
            // (soumission implicite, chargement de page), la ressource elle-même.
            element: declencheurDe(action) ?? localiserRessource(signal),
            preuves: [signal],
          },
          contexte,
        );
      }

      function candidate404(signal: SignalReponse): AnomalieCandidate {
        return construireCandidate(
          {
            detecteur: NOM_DETECTEUR_HTTP,
            description: DESCRIPTION_404_INTERNE,
            categorie: config.categorieParTypeRessource[signal.typeRessource] ?? config.categorieParDefaut,
            gravite: config.gravite404,
            confiance: config.confiance404,
            page: signal.page,
            viewport: signal.viewport,
            dependDuViewport: false,
            action: trouverAction(contexte.parcours, signal.actionId),
            element: localiserRessource(signal),
            preuves: [signal],
          },
          contexte,
        );
      }
    },
  };
}
