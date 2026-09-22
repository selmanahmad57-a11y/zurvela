/**
 * D-IMAGE : image cassée → `image-cassee`. Couvre V01.
 *
 * Deux signaux physiques, l'un OU l'autre suffit :
 * - l'image est « complete » mais n'a aucune dimension naturelle
 *   (largeur ET hauteur nulles : le navigateur n'a rien pu décoder) ;
 * - sa ressource a répondu en erreur (≥ 400) ou la requête a échoué.
 *
 * Une image SANS source (`src` absent ou vide : chargement différé par
 * script, réservation de place) n'a demandé aucune ressource : rien n'a pu
 * casser, elle est ignorée (`ressource` vide dans le signal).
 *
 * Note : une image décodée sans dimension intrinsèque (certains SVG sans
 * `width`/`height`) déclenche aussi la première règle, même avec une réponse
 * 200 : c'est le signal physique voulu par le cahier, et c'est au protocole
 * de confirmation (brique 3) d'en juger — pas à ce détecteur de lire le
 * contenu.
 *
 * Paliers de confiance, par force du signal : les DEUX signaux réunis
 * (aucune dimension ET ressource en échec) ne laissent aucune autre lecture ;
 * un seul peut s'expliquer autrement (SVG sans dimension intrinsèque, échec
 * d'une variante non affichée). Valeurs en config.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { construireCandidate, trouverAction } from './commun.js';

export const NOM_DETECTEUR_IMAGE = 'd-image';
export const DESCRIPTION_IMAGE_CASSEE = 'image-cassee';

/** Premier statut des classes « erreur » (RFC 9110). */
const STATUT_ERREUR = 400;

function estRessourceEnEchec(signal: Signal): signal is Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' }> {
  return signal.type === 'requete-echouee' || (signal.type === 'reponse-reseau' && signal.statut >= STATUT_ERREUR);
}

export function creerDetecteurImage(config: ConfigScanner['detecteurs']['image']): Detecteur {
  return {
    nom: NOM_DETECTEUR_IMAGE,
    dependDuViewport: false,
    detecter(signaux, contexte) {
      // Index des ressources en échec, par URL : les preuves réseau d'une image.
      const echecsParRessource = new Map<string, Signal[]>();
      for (const signal of signaux) {
        if (estRessourceEnEchec(signal)) {
          const liste = echecsParRessource.get(signal.urlRessource) ?? [];
          liste.push(signal);
          echecsParRessource.set(signal.urlRessource, liste);
        }
      }

      const candidates: AnomalieCandidate[] = [];
      for (const signal of signaux) {
        if (signal.type !== 'etat-image' || signal.ressource === '') {
          continue;
        }
        const sansDimension = signal.complete && signal.largeurNaturelle === 0 && signal.hauteurNaturelle === 0;
        const echecs = echecsParRessource.get(signal.ressource) ?? [];
        if (!sansDimension && echecs.length === 0) {
          continue;
        }
        const signalDouble = sansDimension && echecs.length > 0;
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_IMAGE,
              description: DESCRIPTION_IMAGE_CASSEE,
              categorie: 'visuel',
              gravite: config.gravite,
              confiance: signalDouble ? config.confianceSignalDouble : config.confianceSignalSimple,
              page: signal.page,
              viewport: signal.viewport,
              dependDuViewport: false,
              action: trouverAction(contexte.parcours, signal.actionId),
              element: signal.element,
              preuves: [signal, ...echecs],
            },
            contexte,
          ),
        );
      }
      return candidates;
    },
  };
}
