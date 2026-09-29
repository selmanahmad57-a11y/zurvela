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
 *
 * Depuis le cahier P2-1 (contrat 8), cet état est porté par le VERDICT
 * lui-même (`decouverte`, jamais `confirmee`) et borne la GRAVITÉ : une
 * découverte ne peut pas ouvrir un rapport en « Bloquant ». Tant que le rejeu
 * ne marchait pas, le défaut était invisible ; dès qu'il a marché,
 * expandtesting a publié quarante découvertes `confirmee`, dont six sections
 * « Bloquant » pour une seule iframe publicitaire jamais re-testée.
 */
import type { Anomalie, AnomalieCandidate, Gravite, GroupeCause } from '../../types.js';
import { consolider, identiteCause, identiteHorsViewport } from './consolidation.js';

/** Motif de la retenue d'une découverte (identifiant technique stable). */
export const MOTIF_CONSTATEE_AU_REJEU = 'constatee-au-rejeu';

/**
 * La gravité la plus haute qu'une découverte peut porter. INVARIANT, donc en
 * code et non en config : « Bloquant » est une affirmation — « le parcours
 * s'arrête là » — et une affirmation exige un re-test qui lui soit propre.
 * Aucune valeur de réglage ne doit pouvoir la rouvrir.
 */
export const GRAVITE_MAX_DECOUVERTE: Gravite = 'important';

/** L'échelle des gravités, de la moindre à la plus haute. */
const ECHELLE_GRAVITE: readonly Gravite[] = ['mineur', 'important', 'bloquant'];

/** La gravité publiable d'une découverte : celle du détecteur, bornée par `GRAVITE_MAX_DECOUVERTE`. */
export function graviteDecouverte(gravite: Gravite): Gravite {
  return ECHELLE_GRAVITE.indexOf(gravite) > ECHELLE_GRAVITE.indexOf(GRAVITE_MAX_DECOUVERTE) ? GRAVITE_MAX_DECOUVERTE : gravite;
}

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
 * L'anomalie publiée d'une découverte : le représentant, sa confiance de
 * détecteur intacte, sa gravité BORNÉE, son verdict `decouverte`, son motif
 * (`constatee-au-rejeu`) et la clé de son groupe de découverte. Le verdict
 * dit, dans le rapport technique lui-même, que rien ne l'a re-confirmée ; le
 * motif distingue les deux familles (rejeu, diagnostic) pour le rapport.
 */
export function anomalieDecouverte(groupe: GroupeCause): Anomalie {
  return {
    ...groupe.representant,
    graviteEstimee: graviteDecouverte(groupe.representant.graviteEstimee),
    confiance: groupe.confiance,
    verdict: 'decouverte',
    motif: MOTIF_CONSTATEE_AU_REJEU,
    groupe: groupe.cle,
    localisations: groupe.localisations,
    observations: groupe.observations,
  };
}
