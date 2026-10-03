/**
 * LE PALIER DE PERSISTANCE D'UN RECOUVREMENT (cahier P2-6).
 *
 * Le protocole pose déjà « le rejeu a-t-il produit une candidate de MÊME
 * CAUSE ? ». Ce module ajoute un mot : **et de même VICTIME ?** Il ne
 * mesure rien de neuf — il lit ce que les rejeux ont déjà constaté
 * (cahier P2-6, §1bis : l'endroit où les observations se rencontrent est
 * le protocole, le détecteur étant aveugle à la multiplicité).
 *
 * Pourquoi la victime : la clé de cause d'un recouvrement porte
 * l'INTERCEPTEUR et pas ce qui est masqué. Un rejeu qui retrouve n'importe
 * quel recouvrement au même emplacement compte donc comme reproduit —
 * mesuré sur expandtesting, `#aswift_4` est `confirmee` sur trois scans
 * SANS UNE SEULE victime commune. Le protocole confirmait l'emplacement,
 * pas le défaut.
 *
 * ## L'ASYMÉTRIE, et elle est la garde de ce module
 *
 * Deux paliers seulement peuvent TAIRE ou décider sur peu de données, et
 * les deux penchent vers PUBLIER :
 * - « ne persiste pas » exige la PREUVE de non-persistance, jamais le
 *   soupçon ;
 * - « trop peu d'observations » publie, parce qu'on ne sait pas.
 * Taire un vrai défaut est pire que publier un bruit intermittent. C'est
 * la même pente que toutes les autres asymétries du moteur : vers le
 * SIGNAL PRÉSERVÉ (METHODE §15).
 */
import type { AnomalieCandidate, TentativeReexecution } from '../../types.js';
import { estExploitable } from './verdict.js';

/** Journal : le palier retenu pour un groupe, et de quoi le relire. */
export const EVENEMENT_PALIER_PERSISTANCE = 'confirmation.persistance';

export type PalierPersistance =
  /** Le recouvrement n'a reparu à aucun rejeu exploitable : collision fortuite. */
  | 'non-persistant'
  /** Reparu, et sur LA MÊME victime : un défaut précis. */
  | 'victime-stable'
  /** Reparu, mais sur d'AUTRES victimes : un phénomène, pas une occurrence. */
  | 'victime-variable'
  /** Pas assez de rejeux exploitables pour conclure : on ne sait pas, donc on publie. */
  | 'sous-observe'
  /** La question ne se pose pas : la cause ne désigne aucune victime (réseau, page). */
  | 'sans-objet';

/**
 * Les VICTIMES d'une candidate : les éléments que ses preuves désignent.
 *
 * Formulation générique à dessein — le protocole ne connaît aucun
 * détecteur. Une candidate réseau ne désigne aucun élément : son ensemble
 * est vide, et le palier sera `sans-objet` plutôt que faussement décidé.
 */
export function victimesDe(candidate: AnomalieCandidate): string[] {
  const vues = new Set<string>();
  for (const preuve of candidate.preuves) {
    const element = (preuve as { element?: { selecteur?: string } }).element;
    if (element?.selecteur !== undefined) {
      vues.add(element.selecteur);
    }
  }
  return [...vues].sort();
}

export interface EntreePersistance {
  /** Les victimes du constat d'origine. */
  victimesOrigine: readonly string[];
  tentatives: readonly TentativeReexecution[];
  /**
   * Nombre de rejeux EXPLOITABLES en deçà duquel on refuse de conclure.
   * Réglage de config (§13) ; l'asymétrie qu'il sert est l'invariant.
   */
  observationsMin: number;
}

export function palierPersistance(entree: EntreePersistance): PalierPersistance {
  if (entree.victimesOrigine.length === 0) {
    return 'sans-objet';
  }
  const exploitables = entree.tentatives.filter(estExploitable);
  const reproduites = exploitables.filter((tentative) => tentative.reproduite);
  if (reproduites.length > 0) {
    // Reparu : reste à savoir SUR QUOI. Une seule reproduction sur la même
    // victime suffit à faire un défaut précis — c'est le même élément qui
    // est masqué deux fois, et c'est ce que le client doit lire.
    const memeVictime = reproduites.some((tentative) =>
      (tentative.victimes ?? []).some((victime) => entree.victimesOrigine.includes(victime)),
    );
    return memeVictime ? 'victime-stable' : 'victime-variable';
  }
  // RIEN N'A REPARU. Est-ce une preuve, ou n'a-t-on pas assez regardé ?
  // C'est le seul endroit où ce cahier peut taire, et il exige la preuve.
  return exploitables.length >= entree.observationsMin ? 'non-persistant' : 'sous-observe';
}
