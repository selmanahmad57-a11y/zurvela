/**
 * RE-EXÉCUTION (2e étape du protocole) : pour un groupe de cause racine, N
 * tentatives isolées, plus une CONTRE-ÉPREUVE quand l'anomalie dépend du
 * viewport.
 *
 * Ce module ne pilote aucun navigateur : il demande un rejeu au
 * `Reexecuteur` du contexte, puis relit les signaux rendus avec LES MÊMES
 * détecteurs que l'étape DÉTECTION. Aucune règle de détection n'est
 * dupliquée ici — c'est la condition pour que « reproduite » veuille dire
 * exactement la même chose qu'au premier constat.
 *
 * Reproduite = le rejeu produit une candidate de MÊME cause racine et de
 * même `description` que le représentant. La description est un identifiant
 * technique de détecteur (`element-sans-effet`, `reponse-5xx`), jamais de la
 * prose : la comparer ne viole pas le Mur 1.
 */
import { detecter } from '../detection/index.js';
import type {
  AnomalieCandidate,
  CauseEchecRejeu,
  ContexteConfirmation,
  ContreEpreuve,
  Detecteur,
  GroupeCause,
  TentativeReexecution,
  Viewport,
} from '../../types.js';
import type { ConfigConfirmation } from '../config.js';
import { identiteCause, identiteHorsViewport } from './consolidation.js';
import { estExploitable } from './verdict.js';

/** Le rejeu lui-même a levé : l'outillage a lâché, pas le site. */
export const ERREUR_REJEU_INTERROMPU = 'rejeu-interrompu';

export interface OptionsReexecution {
  groupe: GroupeCause;
  contexte: ContexteConfirmation;
  config: ConfigConfirmation;
  /** Détecteur du représentant : il dit si l'anomalie dépend du viewport et porte la mesure graduée. */
  detecteur?: Detecteur | undefined;
  /** false dès que l'échéance ne laisse plus la place à une tentative. */
  tempsRestant(): boolean;
}

export interface ResultatReexecution {
  tentatives: TentativeReexecution[];
  contreEpreuve?: ContreEpreuve;
  /**
   * TOUTES les candidates relevées pendant les rejeux, dans l'ordre. Le
   * protocole y cherche ce qu'il n'était pas venu vérifier : une anomalie
   * survenue PENDANT la confirmation (un site qui tombe) ne doit pas
   * disparaître avec le rejeu qui l'a vue.
   */
  candidates: AnomalieCandidate[];
}

interface Constat {
  reproduite: boolean;
  /** Candidates relevées par les détecteurs sur les signaux de CE rejeu. */
  candidates: AnomalieCandidate[];
  mesureMs?: number;
  echecOutillage: boolean;
  causeEchec?: CauseEchecRejeu;
  erreur?: string;
  dureeMs: number;
}

/**
 * Un rejeu, relu par les détecteurs. `memeViewport` est faux pour la
 * contre-épreuve : on y compare la cause SANS sa dimension viewport,
 * puisque c'est justement le viewport qui change.
 */
async function rejouerEtRelire(options: OptionsReexecution, viewport: Viewport, memeViewport: boolean): Promise<Constat> {
  const { groupe, contexte, detecteur } = options;
  const debut = Date.now();
  let rejeu;
  try {
    rejeu = await contexte.reexecuteur.rejouer(groupe.representant.reproduction, viewport);
  } catch {
    // Le Reexecuteur est injecté : une exception de sa part reste une limite
    // d'outillage, jamais une conclusion sur le site.
    return {
      reproduite: false,
      candidates: [],
      echecOutillage: true,
      causeEchec: 'outil',
      erreur: ERREUR_REJEU_INTERROMPU,
      dureeMs: Date.now() - debut,
    };
  }
  const echec = {
    echecOutillage: rejeu.echecOutillage,
    ...(rejeu.causeEchec === undefined ? {} : { causeEchec: rejeu.causeEchec }),
    ...(rejeu.erreur === undefined ? {} : { erreur: rejeu.erreur }),
    dureeMs: rejeu.dureeMs,
  };
  // Un rejeu dont l'échec est imputable au SITE reste exploitable : il a
  // constaté quelque chose. Seul un rejeu qui n'a pas eu lieu ne dit rien.
  if (!estExploitable(rejeu)) {
    return { reproduite: false, candidates: [], ...echec };
  }
  const candidates = detecter(
    rejeu.signaux,
    { urlDepart: contexte.urlDepart, parcours: rejeu.parcours, viewports: contexte.viewports },
    contexte.detecteurs,
  );
  const attendue = memeViewport ? groupe.cle : identiteHorsViewport(groupe.representant);
  const identite = memeViewport ? identiteCause : identiteHorsViewport;
  const correspondante = candidates.find(
    (candidate) => identite(candidate) === attendue && candidate.description === groupe.representant.description,
  );
  const mesureMs = correspondante === undefined ? undefined : detecteur?.mesureDe?.(correspondante);
  return { reproduite: correspondante !== undefined, candidates, ...(mesureMs === undefined ? {} : { mesureMs }), ...echec };
}

/** Viewport dans lequel le groupe a été constaté : celui de son représentant. */
export function viewportDuGroupe(groupe: GroupeCause): Viewport {
  return groupe.representant.reproduction.viewport;
}

/**
 * Tentatives du groupe, en série, puis contre-épreuve. La contre-épreuve
 * n'a de sens que si le détecteur dépend du viewport et qu'au moins une
 * tentative a été exploitable : contredire un rejeu qui n'a pas eu lieu
 * n'apprend rien.
 */
export async function reexecuterGroupe(options: OptionsReexecution): Promise<ResultatReexecution> {
  const { groupe, contexte, config, detecteur } = options;
  const viewport = viewportDuGroupe(groupe);
  const tentatives: TentativeReexecution[] = [];
  const candidates: AnomalieCandidate[] = [];

  for (let numero = 1; numero <= config.reExecutions; numero += 1) {
    if (!options.tempsRestant()) {
      break;
    }
    const constat = await rejouerEtRelire(options, viewport, true);
    candidates.push(...constat.candidates);
    const tentative: TentativeReexecution = {
      numero,
      viewport: viewport.nom,
      reproduite: constat.reproduite,
      echecOutillage: constat.echecOutillage,
      ...(constat.causeEchec === undefined ? {} : { causeEchec: constat.causeEchec }),
      ...(constat.erreur === undefined ? {} : { erreur: constat.erreur }),
      ...(constat.mesureMs === undefined ? {} : { mesureMs: constat.mesureMs }),
      dureeMs: constat.dureeMs,
    };
    tentatives.push(tentative);
    contexte.journaliser('confirmation.tentative', {
      cle: groupe.cle,
      numero,
      viewport: viewport.nom,
      reproduite: tentative.reproduite,
      echecOutillage: tentative.echecOutillage,
      ...(tentative.causeEchec === undefined ? {} : { causeEchec: tentative.causeEchec }),
      ...(tentative.erreur === undefined ? {} : { erreur: tentative.erreur }),
      ...(tentative.mesureMs === undefined ? {} : { mesureMs: tentative.mesureMs }),
      dureeMs: tentative.dureeMs,
    });
  }

  const exploitable = tentatives.some(estExploitable);
  const autre = contexte.viewports.find((candidat) => candidat.nom !== viewport.nom);
  if (!config.contreEpreuve || detecteur?.dependDuViewport !== true || !exploitable || autre === undefined || !options.tempsRestant()) {
    return { tentatives, candidates };
  }
  const constat = await rejouerEtRelire(options, autre, false);
  candidates.push(...constat.candidates);
  const contreEpreuve: ContreEpreuve = {
    viewport: autre.nom,
    reproduite: constat.reproduite,
    echecOutillage: constat.echecOutillage,
    // L'ASYMÉTRIE est le résultat attendu : l'anomalie ne doit pas exister ailleurs.
    attendue: !constat.reproduite && !constat.echecOutillage,
  };
  contexte.journaliser('confirmation.contre-epreuve', { cle: groupe.cle, ...contreEpreuve });
  return { tentatives, contreEpreuve, candidates };
}
