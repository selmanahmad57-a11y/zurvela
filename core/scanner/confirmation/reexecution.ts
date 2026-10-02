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
  ContexteReproduction,
  ContreEpreuve,
  Detecteur,
  GroupeCause,
  ObservationsRejeu,
  ResultatRejeu,
  Signal,
  TentativeReexecution,
  Viewport,
} from '../../types.js';
import type { ConfigConfirmation } from '../config.js';
import { cheminDePage } from '../detection/commun.js';
import { identiteCause, identiteHorsViewport } from './consolidation.js';
import {
  detailsContreEpreuve,
  detailsTentative,
  TYPE_JOURNAL_CONTRE_EPREUVE,
  TYPE_JOURNAL_TENTATIVE,
} from './extraits-journal.js';
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
  /**
   * Nombre maximal de REJEUX que ce groupe a le droit de consommer —
   * re-exécutions ET contre-épreuve confondues (cahier P2-4, contrat du
   * budget réparti, R1).
   *
   * L'échéance reste la garde dure ; ce quota est la garde ÉQUITABLE. Sans
   * lui, le premier groupe de la liste prenait les trois quarts du temps
   * de tous les autres : sur `recouvrement--q10`, trois rejeux pour le
   * groupe n°1 et zéro pour les cinq suivants.
   */
  rejeuxMax: number;
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

/**
 * Ce que le rejeu a observé, relevé sur son résultat BRUT — donc disponible
 * même quand il a échoué, ce qui est précisément le cas où il sert.
 *
 * Rien n'est interprété ici : des comptes, des statuts HTTP et des codes
 * d'erreur du navigateur. La seule construction est `arreteA`, et elle est
 * mécanique : le rejeu mène toujours la même séquence — charger, refaire
 * l'état, déclencher — et `parcours.actions` ne retient que les actions
 * MENÉES À LEUR TERME. La première action du plan qui manque à l'appel est
 * donc celle sur laquelle il s'est arrêté. C'est la réponse à la question que
 * ni `erreur` ni `dureeMs` ne savent donner : jusqu'où est-on allé ?
 *
 * CHAÎNE DE MÉFIANCE (constitution §3, données DÉRIVÉES). Les deux listes de
 * ressources portent des URL VENUES DE LA PAGE : elles sortent d'ici comme
 * données non fiables, exactement comme `urlOuEtape` et la clé de groupe, et
 * c'est le bloc d'extraits — borné et balisé — qui les encadre en aval.
 */
export function observerRejeu(rejeu: ResultatRejeu, reproduction: ContexteReproduction): ObservationsRejeu {
  const plan: string[] = [
    'naviguer',
    ...reproduction.actionsPrealables.map((prealable) => prealable.action.type),
    ...(reproduction.action === null ? [] : [reproduction.action.action.type]),
  ];
  const nbActions = rejeu.parcours.actions.length;
  const statuts = new Set<number>();
  const reponsesHors2xx = new Set<string>();
  const echecsReseau = new Set<string>();
  const requetesEnAttente = new Set<string>();
  for (const signal of rejeu.signaux) {
    if (signal.type === 'reponse-reseau') {
      statuts.add(signal.statut);
      // 2xx = classe « Successful » du standard HTTP. Le reste est NOMMÉ :
      // un statut sans sa ressource n'impute rien.
      if (signal.statut < 200 || signal.statut > 299) {
        reponsesHors2xx.add(`${signal.statut} ${signal.methode} ${signal.urlRessource}`);
      }
    }
    else if (signal.type === 'requete-echouee') echecsReseau.add(`${signal.erreur} ${signal.methode} ${signal.urlRessource}`);
    else if (signal.type === 'requete-en-attente') requetesEnAttente.add(`${signal.methode} ${signal.urlRessource}`);
  }
  const derniere = rejeu.parcours.pages[rejeu.parcours.pages.length - 1];
  return {
    nbPages: rejeu.parcours.pages.length,
    statutDocument: derniere?.statutHttp ?? null,
    nbActions,
    nbActionsPrevues: plan.length,
    arreteA: plan[nbActions] ?? null,
    nbSignaux: rejeu.signaux.length,
    statuts: [...statuts].sort((a, b) => a - b),
    reponsesHors2xx: [...reponsesHors2xx].sort(),
    echecsReseau: [...echecsReseau].sort(),
    requetesEnAttente: [...requetesEnAttente].sort(),
  };
}

interface Constat {
  reproduite: boolean;
  /** Candidates relevées par les détecteurs sur les signaux de CE rejeu. */
  candidates: AnomalieCandidate[];
  mesureMs?: number;
  nonMesuree?: boolean;
  /** Absente dans un seul cas : le `Reexecuteur` a LEVÉ, il n'a rien rendu à observer. */
  observations?: ObservationsRejeu;
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
  const observations = observerRejeu(rejeu, groupe.representant.reproduction);
  const echec = {
    observations,
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
  // UN REJEU DE LENTEUR MESURE, OU DIT QU'IL N'A PAS MESURÉ (P2-1, contrat 4).
  // Pour un détecteur gradué, une ressource revenue SOUS le seuil ne produit
  // pas de candidate — et sans candidate, rien n'était mesuré : le verdict
  // « jamais reproduite » tombait par absence de mesure. On relit donc la
  // ressource visée dans les signaux du rejeu, qu'elle soit lente ou non ; si
  // elle n'a pas été rechargée du tout, la tentative est NON MESURÉE.
  const mesureCandidate = correspondante === undefined ? undefined : detecteur?.mesureDe?.(correspondante);
  const gradue = detecteur?.mesureDe !== undefined;
  const mesureRessource = gradue && mesureCandidate === undefined ? mesurerRessourceVisee(groupe.representant, rejeu.signaux) : undefined;
  const mesureMs = mesureCandidate ?? mesureRessource;
  const nonMesuree = gradue && mesureMs === undefined;
  return {
    reproduite: correspondante !== undefined,
    candidates,
    ...(mesureMs === undefined ? {} : { mesureMs }),
    ...(nonMesuree ? { nonMesuree: true } : {}),
    ...echec,
  };
}

type SignalRessource = Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' | 'requete-en-attente' }>;

function estSignalRessource(signal: Signal): signal is SignalRessource {
  return signal.type === 'reponse-reseau' || signal.type === 'requete-echouee' || signal.type === 'requete-en-attente';
}

/**
 * Durée observée, dans les signaux d'un rejeu, de la ressource que le
 * représentant du groupe met en cause (même méthode, même chemin — la clé de
 * groupe elle-même, `identiteCause`). La pire durée si elle a été demandée
 * plusieurs fois, comme `dureeMax` du détecteur. `undefined` si elle n'a pas
 * été rechargée : ce n'est pas une mesure nulle, c'est une absence.
 */
export function mesurerRessourceVisee(representant: AnomalieCandidate, signaux: Signal[]): number | undefined {
  const visee = representant.preuves.find(estSignalRessource);
  if (visee === undefined) {
    return undefined;
  }
  const chemin = cheminDePage(visee.urlRessource);
  let mesure: number | undefined;
  for (const signal of signaux) {
    if (!estSignalRessource(signal) || signal.methode !== visee.methode || cheminDePage(signal.urlRessource) !== chemin) {
      continue;
    }
    // `dureeMs` peut être null (réponse sans chronométrage) : ce n'est pas une mesure.
    const duree = signal.type === 'reponse-reseau' ? (signal.dureeMs ?? undefined) : signal.type === 'requete-en-attente' ? signal.attenteMs : undefined;
    if (duree !== undefined && (mesure === undefined || duree > mesure)) {
      mesure = duree;
    }
  }
  return mesure;
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

  /** Rejeux déjà consommés par ce groupe, contre-épreuve comprise. */
  let rejeux = 0;
  for (let numero = 1; numero <= config.reExecutions; numero += 1) {
    if (!options.tempsRestant() || rejeux >= options.rejeuxMax) {
      break;
    }
    rejeux += 1;
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
      ...(constat.nonMesuree === true ? { nonMesuree: true } : {}),
      dureeMs: constat.dureeMs,
      ...(constat.observations === undefined ? {} : { observations: constat.observations }),
    };
    tentatives.push(tentative);
    contexte.journaliser(TYPE_JOURNAL_TENTATIVE, detailsTentative(groupe.cle, tentative));
  }

  const exploitable = tentatives.some(estExploitable);
  const autre = contexte.viewports.find((candidat) => candidat.nom !== viewport.nom);
  if (
    !config.contreEpreuve ||
    detecteur?.dependDuViewport !== true ||
    !exploitable ||
    autre === undefined ||
    !options.tempsRestant() ||
    rejeux >= options.rejeuxMax
  ) {
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
    ...(constat.observations === undefined ? {} : { observations: constat.observations }),
  };
  contexte.journaliser(TYPE_JOURNAL_CONTRE_EPREUVE, detailsContreEpreuve(groupe.cle, contreEpreuve));
  return { tentatives, contreEpreuve, candidates };
}
