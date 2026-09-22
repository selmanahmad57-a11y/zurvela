/**
 * DÉCOUVERTES : ce que les re-exécutions constatent EN PLUS de ce qu'elles
 * venaient vérifier.
 *
 * Une re-exécution ouvre une page et l'observe ; elle peut donc tomber sur
 * une anomalie qui n'appartient à aucun groupe d'origine — le cas extrême
 * étant le site devenu injoignable entre le scan et la confirmation. Se
 * taire parce que la panne est survenue trop tard serait le pire des faux
 * négatifs : le moteur se tairait au moment de la panne totale.
 *
 * TROISIÈME ÉTAT ÉPISTÉMIQUE, ni confirmé ni écarté : **constaté une fois**.
 * La découverte porte la confiance de son détecteur, SANS aucun facteur de
 * calibration — elle n'a pas été re-confirmée, et le rapport business devra
 * le dire au client dans ces termes (« détecté pendant la vérification, non
 * re-testé »). La re-confirmation récursive est hors périmètre.
 */
import type { Anomalie, AnomalieCandidate, GroupeCause } from '../../types.js';
import { consolider, identiteCause, identiteHorsViewport } from './consolidation.js';

/** Motif de la retenue d'une découverte (identifiant technique stable). */
export const MOTIF_CONSTATEE_AU_REJEU = 'constatee-au-rejeu';

/**
 * Identités déjà connues du scan : la clé de chaque groupe ET la même clé
 * privée de son viewport. La seconde est indispensable — une candidate
 * relevée pendant la CONTRE-ÉPREUVE est constatée dans l'autre viewport,
 * donc sous une autre clé : sans elle, la symétrie inattendue (déjà jugée
 * par la contre-épreuve) serait comptée une seconde fois en découverte.
 */
export function identitesConnues(groupes: GroupeCause[]): Set<string> {
  const identites = new Set<string>();
  for (const groupe of groupes) {
    identites.add(groupe.cle);
    for (const membre of groupe.membres) {
      identites.add(identiteCause(membre));
      identites.add(identiteHorsViewport(membre));
    }
  }
  return identites;
}

/** Une candidate du rejeu est une découverte si sa cause n'était connue sous aucune forme. */
export function estDecouverte(candidate: AnomalieCandidate, identitesOrigine: Set<string>): boolean {
  return !identitesOrigine.has(identiteCause(candidate)) && !identitesOrigine.has(identiteHorsViewport(candidate));
}

/**
 * Groupes de découvertes : les candidates inconnues relevées pendant les
 * rejeux, consolidées ENTRE ELLES comme n'importe quelles candidates (une
 * page injoignable rejouée deux fois est une seule découverte).
 */
export function collecterDecouvertes(candidatesRejeu: AnomalieCandidate[], groupesOrigine: GroupeCause[]): GroupeCause[] {
  const identites = identitesConnues(groupesOrigine);
  return consolider(candidatesRejeu.filter((candidate) => estDecouverte(candidate, identites)));
}

/**
 * L'anomalie retenue d'une découverte : le représentant, sa confiance de
 * détecteur intacte, son motif (`constatee-au-rejeu`) et la clé de son
 * groupe de découverte — c'est ce motif qui dit, dans le rapport lui-même,
 * que son statut n'est pas celui d'une anomalie re-confirmée.
 */
export function anomalieDecouverte(groupe: GroupeCause): Anomalie {
  return {
    ...groupe.representant,
    confiance: groupe.confiance,
    verdict: 'confirmee',
    motif: MOTIF_CONSTATEE_AU_REJEU,
    groupe: groupe.cle,
    localisations: groupe.localisations,
    observations: groupe.observations,
  };
}
