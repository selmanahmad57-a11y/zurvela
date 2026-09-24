/**
 * Étape DÉTECTION du pipeline : les détecteurs interprètent les signaux
 * bruts en candidates, puis les candidates sont dédoublonnées.
 *
 * Clé de dédoublonnage : `detecteur|categorie|chemin de page|selecteur`
 * (+ `|viewport` pour un détecteur qui dépend du viewport). La première
 * candidate est conservée ; les preuves des suivantes lui sont ajoutées.
 *
 * La fusion n'efface JAMAIS où l'anomalie a été vue : chaque candidate
 * retenue porte ses `observations`, la liste des viewports fusionnés sans
 * doublon, dans l'ordre de première apparition. Une anomalie vue sur un seul
 * viewport reste ainsi distinguable (« mobile uniquement »), et une candidate
 * non fusionnée porte une liste d'un élément.
 *
 * Elle n'efface pas davantage la FORCE du signal : comme les preuves et les
 * observations, la confiance retenue est la plus haute des candidates
 * fusionnées. La candidate finale détient les preuves de toutes, donc celles
 * du palier le plus haut ; garder la confiance de la première ferait dépendre
 * le score de l'ordre de passage des viewports plutôt que des faits.
 */
import type { AnomalieCandidate, ContexteDetection, Detecteur, Observation, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { cheminDePage } from './commun.js';
import { creerDetecteurEchecMuet } from './d-echec-muet.js';
import { creerDetecteurHttp } from './d-http.js';
import { creerDetecteurImage } from './d-image.js';
import { creerDetecteurInerte } from './d-inerte.js';
import { creerDetecteurLenteur } from './d-lenteur.js';
import { creerDetecteurRecouvrement } from './d-recouvrement.js';

export { cheminDePage } from './commun.js';
export { creerDetecteurEchecMuet } from './d-echec-muet.js';
export { creerDetecteurHttp } from './d-http.js';
export { creerDetecteurImage } from './d-image.js';
export { creerDetecteurInerte } from './d-inerte.js';
export { creerDetecteurLenteur } from './d-lenteur.js';
export { creerDetecteurRecouvrement } from './d-recouvrement.js';

const SEPARATEUR_CLE = '|';

export function cleDedoublonnage(candidate: AnomalieCandidate, dependDuViewport: boolean): string {
  const parties = [candidate.detecteur, candidate.categorie, cheminDePage(candidate.urlOuEtape), candidate.element?.selecteur ?? ''];
  if (dependDuViewport) {
    parties.push(candidate.viewport ?? candidate.reproduction.viewport.nom);
  }
  return parties.join(SEPARATEUR_CLE);
}

/**
 * Viewports où une candidate a été observée. Ceux qu'elle porte déjà si elle
 * a été fusionnée (le dédoublonnage est ainsi idempotent), sinon le sien :
 * son nom explicite s'il dépend du viewport, celui de sa reproduction sinon.
 */
function viewportsObserves(candidate: AnomalieCandidate): string[] {
  const observations = candidate.observations;
  if (observations !== undefined && observations.length > 0) {
    return observations.map((observation) => observation.viewport);
  }
  return [candidate.viewport ?? candidate.reproduction.viewport.nom];
}

/** Ajoute à `cible` les viewports de `source` qu'elle ne porte pas déjà, dans l'ordre de première apparition. */
function fusionnerObservations(cible: AnomalieCandidate, source: AnomalieCandidate): void {
  const observations: Observation[] = cible.observations ?? [];
  const connus = new Set<string>(observations.map((observation) => observation.viewport));
  for (const viewport of viewportsObserves(source)) {
    if (!connus.has(viewport)) {
      connus.add(viewport);
      observations.push({ viewport });
    }
  }
  cible.observations = observations;
}

/** Ajoute à `cible` les preuves de `source` qu'elle ne porte pas déjà (même objet signal). */
function fusionnerPreuves(cible: AnomalieCandidate, source: AnomalieCandidate): void {
  const connues = new Set<Signal>(cible.preuves);
  for (const preuve of source.preuves) {
    if (!connues.has(preuve)) {
      connues.add(preuve);
      cible.preuves.push(preuve);
    }
  }
}

export function dedoublonner(candidates: AnomalieCandidate[], dependDuViewport: boolean): AnomalieCandidate[] {
  const parCle = new Map<string, AnomalieCandidate>();
  for (const candidate of candidates) {
    const cle = cleDedoublonnage(candidate, dependDuViewport);
    const existante = parCle.get(cle);
    if (existante === undefined) {
      parCle.set(cle, {
        ...candidate,
        preuves: [...candidate.preuves],
        observations: viewportsObserves(candidate).map((viewport) => ({ viewport })),
      });
    } else {
      fusionnerPreuves(existante, candidate);
      fusionnerObservations(existante, candidate);
      existante.confiance = Math.max(existante.confiance, candidate.confiance);
    }
  }
  return [...parCle.values()];
}

/** Exécute chaque détecteur sur l'ensemble des signaux et dédoublonne ses candidates. */
export function detecter(signaux: Signal[], contexte: ContexteDetection, detecteurs: Detecteur[]): AnomalieCandidate[] {
  return detecteurs.flatMap((detecteur) => dedoublonner(detecteur.detecter(signaux, contexte), detecteur.dependDuViewport));
}

/** Les six détecteurs de la brique, dans l'ordre du cahier des charges, réglés par la config. */
export function creerDetecteurs(config: ConfigScanner['detecteurs']): Detecteur[] {
  return [
    creerDetecteurHttp(config.http, config.tiers),
    creerDetecteurInerte(config.inerte),
    creerDetecteurEchecMuet(config.echecMuet),
    creerDetecteurLenteur(config.lenteur, config.tiers),
    creerDetecteurImage(config.image),
    creerDetecteurRecouvrement(config.recouvrement),
  ];
}
