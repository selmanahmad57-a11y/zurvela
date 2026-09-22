/**
 * Couche d'abstraction IA : SEUL point de contact avec les API de modèles
 * (constitution §4). Le reste du moteur appelle des fonctions métier
 * (`profiler`, `decider`, `diagnostiquer`, `rediger`), jamais un SDK.
 *
 * Brique 2 : aucun appel n'est encore implémenté ; le client est en mode
 * dégradé permanent et le signale proprement. Les briques suivantes
 * rempliront ces fonctions, prompts versionnés dans `prompts/`.
 */
import type { Action, AnomalieCandidate, ContexteDecision, PageVisitee, Rapport } from '../types.js';
import type { ConfigScanner } from '../scanner/config.js';

export type ModeIa = 'actif' | 'degrade';

/** Résultat d'un appel IA : indisponible (mode dégradé, panne) ou valeur + coût en euros. */
export type ResultatIa<T> = { disponible: false; raison: string } | { disponible: true; valeur: T; coutApi: number };

export interface ProfilPage {
  /** Langue détectée (code BCP 47) si l'IA la reconnaît. */
  langue: string | null;
  /** Nature de la page (accueil, formulaire, liste…), en vocabulaire libre de l'IA. */
  nature: string | null;
}

export interface Diagnostic {
  /** « défaut du site » ou « limite de mon automatisation » (constitution §1). */
  verdict: 'defaut-du-site' | 'limite-automatisation' | 'indetermine';
  explication: string;
}

export interface ClientIa {
  mode: ModeIa;
  /** Pourquoi le client est en mode dégradé (clé absente, fonctions non implémentées) ; null en mode actif. */
  raisonDegrade: string | null;
  profiler(page: PageVisitee): Promise<ResultatIa<ProfilPage>>;
  decider(contexte: ContexteDecision): Promise<ResultatIa<Action>>;
  diagnostiquer(candidate: AnomalieCandidate): Promise<ResultatIa<Diagnostic>>;
  rediger(rapport: Rapport, langue: string): Promise<ResultatIa<string>>;
}

export const RAISON_CLE_ABSENTE = 'cle-absente';
export const RAISON_NON_IMPLEMENTE = 'non-implemente';

/**
 * Fabrique le client. Le mode reflète la disponibilité EFFECTIVE des
 * fonctions, pas la seule présence d'une clé : tant qu'aucune fonction n'est
 * implémentée, le client est dégradé dans tous les cas (raison `cle-absente`
 * sans clé, `non-implemente` avec), toutes les fonctions répondent
 * « indisponible » sans lever, et le moteur fonctionne avec ses détecteurs
 * techniques seuls.
 */
export function creerClientIa(config: ConfigScanner['ia'], env: NodeJS.ProcessEnv = process.env): ClientIa {
  const cle = env[config.variableCle];
  const raison = cle === undefined || cle === '' ? RAISON_CLE_ABSENTE : RAISON_NON_IMPLEMENTE;
  const mode: ModeIa = 'degrade';
  const indisponible = async <T>(): Promise<ResultatIa<T>> => ({ disponible: false, raison });
  return {
    mode,
    raisonDegrade: raison,
    profiler: () => indisponible<ProfilPage>(),
    decider: () => indisponible<Action>(),
    diagnostiquer: () => indisponible<Diagnostic>(),
    rediger: () => indisponible<string>(),
  };
}
