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
 *
 * DEUX VOIES, deux régimes de confiance. Une réponse REÇUE a une durée vraie,
 * graduée par les paliers ci-dessus. Une requête ENCORE EN ATTENTE à la
 * fermeture de la fenêtre d'effet n'a PAS de durée vraie : son `attenteMs` est
 * borné par la fenêtre (elle n'a jamais fini), donc le ratio attente/seuil est
 * plafonné et NE PEUT PAS la grader — la grader par là ferait sortir la
 * lenteur la plus grave (celle qui ne finit jamais) sous le palier haut, et
 * ferait dépendre sa confiance de l'instant où la requête a démarré dans la
 * fenêtre, un artefact d'observation. « Ne finit pas dans la fenêtre » est une
 * NATURE, pas une quantité : c'est un signal de gravité fort qui porte une
 * confiance DÉDIÉE (`confianceEnAttente`), découplée des paliers. La preuve de
 * reproduction reste au protocole (une attente n'est jamais confirmée sans
 * rejeu) : la confiance haute dit la gravité, pas la certitude du défaut.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner, PalierConfiance } from '../config.js';
import { construireCandidate, declencheurDe, localiserRessource, trouverAction } from './commun.js';

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

export function creerDetecteurLenteur(config: ConfigScanner['detecteurs']['lenteur']): Detecteur {
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
        // Voie « en attente » : confiance dédiée, découplée du ratio que la
        // fenêtre plafonne. Voie « reçue » : graduée par les paliers.
        const confiance =
          requete.type === 'requete-en-attente'
            ? config.confianceEnAttente
            : palierPour(paliersTries, duree / config.seuilMs)?.confiance;
        // Config sans aucun palier (interdite par le schéma) : rien à affirmer.
        if (confiance === undefined) {
          continue;
        }
        // UNE LENTEUR TIERCE N'EST PAS UNE CANDIDATE (cahier P2-2, contrat 5).
        // Le propriétaire ne peut pas accélérer le serveur d'un tiers ; et un
        // tiers lent vu par le robot déclaré n'est pas forcément lent pour le
        // visiteur (APPRENTISSAGES n°19). S'il casse la page, c'est son EFFET
        // qui se constate (contrat 1), pas sa durée.
        if (!requete.interne) {
          continue;
        }
        const action = trouverAction(contexte.parcours, requete.actionId);
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_LENTEUR,
              description: DESCRIPTION_LENTE,
              categorie: 'performance',
              gravite: config.gravite,
              confiance,
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
