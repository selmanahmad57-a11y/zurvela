/**
 * CALIBRATION (4e étape du protocole) : la confiance du détecteur devient
 * une confiance FINALE, informée par ce que la re-exécution a montré.
 *
 * La formule vit ici, ses FACTEURS vivent en config (constitution §2) :
 *
 *   confianceFinale = borner(
 *     confianceInitiale
 *     × facteurVerdict[verdict]                    (1 pour un verdict non listé)
 *     × (1 + poidsTauxReproduction × (taux − 1))   (1 si le taux est inconnu)
 *     × facteurContreEpreuve,
 *     confianceMin, confianceMax)
 *
 * Aucun arrondi : une précision d'affichage serait une valeur métier en dur.
 *
 * Rétrogradation : une anomalie RETENUE dont la confiance finale tombe sous
 * `seuilRetenue` devient `basse-confiance` et sort du rapport — c'est le
 * cinquième verdict, et le dernier filet avant une fausse alerte. Les
 * verdicts non retenus gardent leur confiance calculée (traçabilité).
 */
import { VERDICTS_RETENUS, type ContreEpreuve, type VerdictConfirmation } from '../../types.js';
import type { ConfigConfirmation } from '../config.js';

export const MOTIF_SOUS_SEUIL_RETENUE = 'sous-seuil-retenue';

/**
 * Bornes INVARIANTES d'un score de confiance (constitution §2 : une borne
 * que le produit ne doit jamais franchir est un invariant, pas un réglage).
 * `confianceMin`/`confianceMax` de la config règlent la prudence du
 * protocole À L'INTÉRIEUR de cet intervalle ; une config fautive ne peut pas
 * faire sortir une confiance de [0, 1].
 */
const CONFIANCE_PLANCHER = 0;
const CONFIANCE_PLAFOND = 1;

export interface EntreeCalibration {
  confianceInitiale: number;
  verdict: VerdictConfirmation;
  motif: string;
  tauxReproduction: number | null;
  contreEpreuve?: ContreEpreuve;
  /**
   * La symétrie inattendue a été RÉSOLUE par une fusion (cahier P2-3,
   * contrat 5) : les deux groupes de viewport n'en font plus qu'un, avec
   * deux observations. Le malus ne s'applique alors pas — il payait un
   * DOUTE sur l'attribution au viewport, et la fusion supprime ce doute au
   * lieu de l'escompter. Une confiance qui baisse après une confirmation
   * doit changer quelque chose de visible, ou ne pas baisser (carnet C-11).
   */
  symetrieResolue?: boolean;
}

export interface SortieCalibration {
  verdict: VerdictConfirmation;
  motif: string;
  confianceFinale: number;
}

/** Facteur du verdict : ceux que la config ne nomme pas ne pèsent pas (facteur neutre). */
function facteurVerdict(verdict: VerdictConfirmation, config: ConfigConfirmation['calibration']): number {
  if (verdict === 'confirmee') {
    return config.facteurVerdict.confirmee;
  }
  if (verdict === 'intermittente') {
    return config.facteurVerdict.intermittente;
  }
  return 1;
}

/**
 * L'asymétrie ATTENDUE (l'anomalie de viewport ne se reproduit pas dans
 * l'autre viewport) renforce ; la symétrie inattendue dégrade.
 */
function facteurContreEpreuve(
  contreEpreuve: ContreEpreuve | undefined,
  symetrieResolue: boolean,
  config: ConfigConfirmation['calibration'],
): number {
  // Une contre-épreuve qui n'a pas pu s'exécuter n'apprend rien : ni bonus ni malus.
  if (contreEpreuve === undefined || contreEpreuve.echecOutillage) {
    return 1;
  }
  if (contreEpreuve.attendue) {
    return 1 + config.bonusContreEpreuve;
  }
  // La symétrie inattendue a été FONDUE en un seul constat : le doute qu'elle
  // portait n'existe plus, le malus n'a plus d'objet. Il reste entier quand
  // la fusion n'a pas pu avoir lieu — le doute, lui, est toujours là.
  return symetrieResolue ? 1 : 1 - config.malusSymetrieInattendue;
}

export function calculerConfiance(entree: EntreeCalibration, config: ConfigConfirmation['calibration']): number {
  const facteurTaux =
    entree.tauxReproduction === null ? 1 : 1 + config.poidsTauxReproduction * (entree.tauxReproduction - 1);
  const brute =
    entree.confianceInitiale *
    facteurVerdict(entree.verdict, config) *
    facteurTaux *
    facteurContreEpreuve(entree.contreEpreuve, entree.symetrieResolue === true, config);
  const bornee = Math.min(config.confianceMax, Math.max(config.confianceMin, brute));
  return Math.min(CONFIANCE_PLAFOND, Math.max(CONFIANCE_PLANCHER, bornee));
}

/** Confiance finale, puis rétrogradation d'une retenue trop faible. */
export function calibrer(entree: EntreeCalibration, config: ConfigConfirmation): SortieCalibration {
  const confianceFinale = calculerConfiance(entree, config.calibration);
  if (VERDICTS_RETENUS.includes(entree.verdict) && confianceFinale < config.seuilRetenue) {
    return { verdict: 'basse-confiance', motif: MOTIF_SOUS_SEUIL_RETENUE, confianceFinale };
  }
  return { verdict: entree.verdict, motif: entree.motif, confianceFinale };
}
