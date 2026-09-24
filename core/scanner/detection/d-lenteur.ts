/**
 * D-LENTEUR : une requête liée à une action dont la durée dépasse le seuil
 * de config (réponse reçue tardivement, ou encore en attente à la fin de la
 * fenêtre d'effet) → `reponse-lente`. Couvre R01.
 *
 * Une durée exactement égale au seuil n'est pas lente : le seuil est la
 * dernière valeur acceptable.
 *
 * Paliers de confiance, par force du signal : plus la durée dépasse le seuil,
 * moins la lenteur peut tenir à un aléa de mesure. Le palier retenu est celui
 * de plus grand `ratioMin` satisfait par `durée / seuil` ; les paliers sont
 * triés à la construction, l'ordre du fichier de config n'étant pas un
 * contrat.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner, PalierConfiance } from '../config.js';
import { construireCandidate, declencheurDe, localiserRessource, trouverAction } from './commun.js';
import { DESCRIPTION_TIERCE_EN_ECHEC } from './d-http.js';

export const NOM_DETECTEUR_LENTEUR = 'd-lenteur';
export const DESCRIPTION_LENTE = 'reponse-lente';

type SignalRequete = Extract<Signal, { type: 'reponse-reseau' | 'requete-en-attente' }>;

function estRequete(signal: Signal): signal is SignalRequete {
  return signal.type === 'reponse-reseau' || signal.type === 'requete-en-attente';
}

function dureeObservee(signal: SignalRequete): number | null {
  return signal.type === 'reponse-reseau' ? signal.dureeMs : signal.attenteMs;
}

/**
 * Palier applicable à un ratio, parmi des paliers triés par `ratioMin`
 * croissant : le dernier satisfait, ou le plus bas si aucun ne l'est (le
 * détecteur a déjà jugé la requête lente, il lui faut une confiance).
 */
function palierPour(paliersTries: PalierConfiance[], ratio: number): PalierConfiance | undefined {
  let retenu = paliersTries[0];
  for (const palier of paliersTries) {
    if (ratio >= palier.ratioMin) {
      retenu = palier;
    }
  }
  return retenu;
}

/**
 * Durée la plus longue parmi les preuves d'une candidate : le dédoublonnage
 * fusionne les preuves de plusieurs viewports, la mesure retenue est alors
 * la pire observée — la même logique que la confiance maximale.
 */
function dureeMax(candidate: AnomalieCandidate): number | undefined {
  let mesure: number | undefined;
  for (const preuve of candidate.preuves) {
    if (!estRequete(preuve)) {
      continue;
    }
    const duree = dureeObservee(preuve);
    if (duree !== null && (mesure === undefined || duree > mesure)) {
      mesure = duree;
    }
  }
  return mesure;
}

export function creerDetecteurLenteur(
  config: ConfigScanner['detecteurs']['lenteur'],
  configTiers: ConfigScanner['detecteurs']['tiers'],
): Detecteur {
  const paliersTries = [...config.paliers].sort((a, b) => a.ratioMin - b.ratioMin);
  return {
    nom: NOM_DETECTEUR_LENTEUR,
    dependDuViewport: false,
    // Détecteur GRADUÉ : la durée observée est la mesure brute que le
    // protocole de confirmation agrège sur ses re-exécutions, et `seuilMesure`
    // ce à quoi il la compare. Le protocole ne sait rien de la lenteur ; le
    // détecteur ne sait rien de la re-exécution.
    mesureDe: dureeMax,
    seuilMesure: config.seuilMs,
    detecter(signaux, contexte) {
      const candidates: AnomalieCandidate[] = [];
      for (const requete of signaux) {
        if (!estRequete(requete) || requete.actionId === undefined) {
          continue;
        }
        const duree = dureeObservee(requete);
        if (duree === null || duree <= config.seuilMs) {
          continue;
        }
        const palier = palierPour(paliersTries, duree / config.seuilMs);
        // Config sans aucun palier (interdite par le schéma) : rien à affirmer.
        if (palier === undefined) {
          continue;
        }
        const action = trouverAction(contexte.parcours, requete.actionId);
        // UNE LENTEUR TIERCE N'EST PAS LA LENTEUR DU SITE. Le propriétaire ne
        // peut pas accélérer le serveur d'un tiers ; lui présenter cela comme
        // une performance « importante » de SON site l'envoie corriger ce
        // qu'il ne contrôle pas. Il peut en revanche retirer le widget, donc
        // il mérite de le savoir — à part, et en mineur.
        const tierce = !requete.interne;
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_LENTEUR,
              description: tierce ? DESCRIPTION_TIERCE_EN_ECHEC : DESCRIPTION_LENTE,
              categorie: tierce ? configTiers.categorie : 'performance',
              gravite: tierce ? configTiers.gravite : config.gravite,
              confiance: tierce ? configTiers.confiance : palier.confiance,
              page: requete.page,
              viewport: requete.viewport,
              dependDuViewport: false,
              action,
              element: declencheurDe(action) ?? localiserRessource(requete),
              preuves: [requete],
            },
            contexte,
          ),
        );
      }
      return candidates;
    },
  };
}
