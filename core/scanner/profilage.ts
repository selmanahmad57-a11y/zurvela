/**
 * Profilage IA d'un site (brique 4a), côté scanner : la collecte du contexte
 * pendant l'exploration, la composition du bloc de données NON FIABLE, et
 * l'appel UNIQUE par scan avec son journal.
 *
 * Trois règles gouvernent ce module :
 * - le contenu de page est une DONNÉE NON FIABLE (constitution §3) : il n'est
 *   ici que transporté et tronqué, jamais interprété, jamais exécuté ;
 * - aucune exception ne tue un scan pour cause d'IA (constitution §4) : toute
 *   panne devient un rapport sans profil et une raison au journal ;
 * - une sortie IA porte TOUJOURS son estampille de provenance (version de
 *   prompt, modèle demandé, modèle servi). Elle est apposée par la couche IA,
 *   qui seule sait ce qu'elle a réellement appelé ; le scanner la recopie sans
 *   la fabriquer.
 */
import type { ClientIa, ContexteProfilage, ProfilPage } from '../ia/index.js';
import { RAISON_PROFIL_INVALIDE } from '../ia/index.js';
import type { ContexteExploration, Explorateur, Observateur, Parcours, ProfilSiteRapporte } from '../types.js';
import type { ConfigProfilage } from './config.js';
import type { ExtractionTexte } from './exploration/en-page.js';

/** Jetons techniques qui délimitent les morceaux du contexte : du vocabulaire HTML, pas de la prose. */
const MARQUE_TITRE = 'title';
const MARQUE_META = 'meta';
const MARQUE_CORPS = 'body';

/**
 * Le bloc de données est une structure LIGNE À LIGNE : un séparateur de ligne
 * écrit par la page y fabriquerait des lignes que la page ne possède pas
 * (`meta[og:title]:` qu'elle n'a pas déclarée, un second `body:` avant le
 * vrai), et la structure censée dire au modèle d'où vient quoi mentirait.
 *
 * On borne donc la FORME des valeurs mono-ligne — on ne filtre AUCUN contenu
 * (constitution §3 : le contenu de page reste une donnée non fiable, balisée
 * par le prompt, jamais censurée ici). Les deux séparateurs Unicode passent
 * aussi par un attribut HTML : ils sont traités comme `\r` et `\n`.
 */
const SEPARATEURS_DE_LIGNE = /[\r\n\u2028\u2029]+/g;

/**
 * INVARIANT en code, pas en config (constitution §2) : le texte visible reçoit
 * au moins cette part du contexte. Sans elle, une seule métadonnée — attribut
 * de longueur libre, invisible pour un visiteur — remplirait tout le budget et
 * le modèle classerait le site sans avoir lu un seul caractère de sa page.
 * C'est une borne que le produit ne doit jamais franchir, donc pas un réglage.
 */
const PART_CORPS_MINIMALE = 0.5;

/** Aplatit une valeur MONO-LIGNE : elle ne peut plus ouvrir de ligne dans le bloc. */
function surUneLigne(valeur: string): string {
  return valeur.replace(SEPARATEURS_DE_LIGNE, ' ');
}

// --- Raisons techniques stables (jamais de prose) --------------------------

/** Le profilage n'est pas assemblé (config absente) : le scan continue sans profil. */
export const RAISON_PROFILAGE_NON_CONFIGURE = 'profilage-non-configure';
/** L'exploration n'a remis aucun texte : page de départ inchargée, externe ou muette. */
export const RAISON_CONTEXTE_ABSENT = 'contexte-absent';
/** Le client IA a levé au lieu de rendre un résultat : le scan continue quand même. */
export const RAISON_PROFILAGE_EN_ERREUR = 'profilage-en-erreur';
/** Le scan a dépassé son échéance avant l'appel : aucun travail neuf n'est engagé. */
export const RAISON_ECHEANCE = 'echeance';

// --- Collecte du contexte pendant l'exploration ----------------------------

/**
 * Le canal par lequel l'exploration remet au pipeline le texte de la page de
 * départ. Il porte sa propre borne : l'exploration n'a pas à connaître
 * `config/profilage.json`, elle n'a qu'à respecter la borne qu'on lui donne.
 */
export interface BornesContexte {
  /** Longueur maximale du contexte assemblé (`contexteMaxChars`). */
  maxChars: number;
  /** Longueur maximale de CHAQUE en-tête pris séparément (`enTeteMaxChars`). */
  enTeteMaxChars: number;
}

export interface CollecteProfilage {
  /** Bornes de composition, remises par la config : l'exploration n'a pas à les connaître. */
  bornes: BornesContexte;
  /**
   * UNE capture par scan : la première proposition DÉCLENCHE l'appel, toute
   * proposition ultérieure reçoit son résultat sans en provoquer un second.
   *
   * Elle rend le profil parce que la brique 4b le CONSOMME pendant
   * l'exploration : la navigation IA décide avec lui. Il ne pouvait donc plus
   * être calculé après le parcours. `null` en mode dégradé — la raison est au
   * journal, et la navigation décide sans profil plutôt que pas du tout.
   */
  proposer(contexte: ContexteProfilage): Promise<ProfilSiteRapporte | null>;
}

/**
 * Un explorateur qui sait, EN PLUS, remettre le texte de la page de départ.
 * Le paramètre est optionnel : un explorateur qui l'ignore reste un
 * `Explorateur` valide (les doublures de test, le jour où le profilage n'est
 * pas assemblé). Le contrat de `core/types.ts` n'a pas à bouger pour ça.
 */
export interface ExplorateurProfilant extends Explorateur {
  explorer(
    contexte: ContexteExploration,
    observateur: Observateur,
    collecte?: CollecteProfilage,
    cout?: CompteurCoutIa,
  ): Promise<Parcours>;
}

/**
 * Recueille le coût des appels IA engagés PENDANT l'exploration (les
 * décisions de navigation). Le `Parcours` ne porte pas de coût et n'a pas à
 * en porter : c'est le pipeline qui totalise ce qu'un scan a dépensé. Sans ce
 * canal, la navigation IA coûterait sans que le chiffre se voie — et un coût
 * dépensé qui ne se voit pas est un coût qui ment (APPRENTISSAGES n°3).
 */
export interface CompteurCoutIa {
  ajouter(montant: number): void;
}

export interface ProfilageOuvert {
  collecte: CollecteProfilage;
  /**
   * Le résultat du profilage du scan. Idempotent : appelé sans qu'aucun
   * contexte ait été proposé, il journalise l'absence et rend un coût nul —
   * un scan sans page de départ lisible n'a pas de profil, et il le dit.
   */
  resultat(): Promise<ResultatProfilage>;
}

/**
 * Ouvre le profilage d'UN scan. L'unicité de l'appel est garantie ici, par
 * construction : même si l'exploration proposait un contexte par viewport, un
 * seul appel a lieu — et les propositions suivantes reçoivent son résultat.
 */
export function ouvrirProfilage(entree: EntreeProfilageScan): ProfilageOuvert {
  const { bornes, ia, options, journaliser, echeance } = entree;
  let appel: Promise<ResultatProfilage> | null = null;
  const profiler = (contexte: ContexteProfilage | null): Promise<ResultatProfilage> => {
    appel ??= profilerSite({ ia, ...(options === undefined ? {} : { options }), contexte, journaliser, echeance });
    return appel;
  };
  return {
    collecte: {
      bornes,
      async proposer(contexte) {
        return (await profiler(contexte)).profil ?? null;
      },
    },
    resultat: () => profiler(null),
  };
}

// --- Composition du bloc de données ----------------------------------------

/**
 * Assemble le bloc de données à partir du texte extrait, et le borne à
 * `bornes.maxChars` — la troncature qui FAIT FOI est celle-ci, côté Node : la
 * borne posée en page ne sert qu'à ne pas faire transiter un catalogue entier.
 *
 * Les morceaux sont préfixés de jetons HTML (`title`, `meta[...]`, `body`)
 * pour que le modèle sache d'où vient quoi. Ce ne sont pas des instructions :
 * le prompt (couche IA) balise l'ensemble comme du contenu à analyser.
 *
 * Le budget est RÉPARTI, jamais tronqué en bloc. Tronquer la concaténation
 * revenait à servir les en-têtes d'abord et le corps en dernier : une seule
 * `<meta>` — attribut de longueur libre, invisible pour un visiteur — évinçait
 * 100 % du texte visible, et le marqueur `body:` n'était même pas atteint.
 * Trois bornes ferment ce trou, dans cet ordre :
 *  1. chaque en-tête est borné à `enTeteMaxChars` (réglage, config) ;
 *  2. l'ensemble des en-têtes est borné à une part du budget (invariant, code) ;
 *  3. le reste va AU CORPS, qui n'est donc jamais évincé.
 */
export function composerContexteProfilage(
  url: string,
  extraction: ExtractionTexte,
  bornes: BornesContexte,
): ContexteProfilage {
  const maxChars = Math.max(0, bornes.maxChars);
  const enTeteMaxChars = Math.max(0, bornes.enTeteMaxChars);
  const enTetes: string[] = [];
  if (extraction.titre !== '') {
    enTetes.push(`${MARQUE_TITRE}: ${surUneLigne(extraction.titre)}`.slice(0, enTeteMaxChars));
  }
  // `nom` vient de la liste blanche `METADONNEES_CONSERVEES` : il ne peut pas
  // porter de séparateur. `contenu`, lui, est un attribut libre de la page.
  for (const [nom, contenu] of Object.entries(extraction.metadonnees)) {
    enTetes.push(`${MARQUE_META}[${nom}]: ${surUneLigne(contenu)}`.slice(0, enTeteMaxChars));
  }
  const blocEnTetes = enTetes.join('\n').slice(0, Math.floor(maxChars * (1 - PART_CORPS_MINIMALE)));
  const entree = blocEnTetes === '' ? `${MARQUE_CORPS}:\n` : `${blocEnTetes}\n${MARQUE_CORPS}:\n`;
  const corps = extraction.texteVisible.slice(0, Math.max(0, maxChars - entree.length));
  return { url, texte: `${entree}${corps}`.slice(0, maxChars), langueDeclaree: extraction.langueDeclaree };
}

// --- L'appel ---------------------------------------------------------------

/** Ce dont le pipeline a besoin pour profiler. */
export interface OptionsProfilage {
  config: ConfigProfilage;
  /**
   * ALIAS de modèle DEMANDÉ (`config/scanner.json`, `ia.modeles.profilage`),
   * journalisé à l'ouverture de l'appel. L'estampille du rapport, elle, vient
   * du profil rendu — alias demandé ET forme servie : si les trois divergent,
   * le journal le montre au lieu de le masquer (APPRENTISSAGES n°5 et n°6).
   */
  modele: string;
}

export interface ResultatProfilage {
  /** Absent en mode dégradé : la raison est alors au journal. */
  profil?: ProfilSiteRapporte;
  /**
   * Coût réellement engagé, dans l'unité monétaire des tarifs de config. Zéro
   * quand aucun appel n'a eu lieu — et NON nul quand un appel a échoué après
   * avoir dépensé : un coût dépensé qui ne se voit pas est un coût qui ment
   * (APPRENTISSAGES n°3).
   */
  coutApi: number;
}

export type Journaliser = (type: string, details?: unknown) => void;

/** Ce dont l'ouverture d'un profilage de scan a besoin : l'entrée d'appel, moins le contexte (il viendra de l'exploration). */
export interface EntreeProfilageScan extends Omit<EntreeProfilage, 'contexte'> {
  bornes: BornesContexte;
}

export interface EntreeProfilage {
  ia: ClientIa;
  /** Absentes : le profilage n'est pas assemblé, le scan continue sans profil. */
  options?: OptionsProfilage;
  contexte: ContexteProfilage | null;
  journaliser: Journaliser;
  /** Instant (epoch ms) au-delà duquel plus aucun travail neuf n'est engagé. */
  echeance: number;
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * INVARIANT en code, pas en config (constitution §2) : une confiance sort de
 * [0, 1] uniquement si quelque chose a menti. On la borne sans discuter, et
 * une valeur non finie vaut zéro — le doute ne monte jamais la confiance.
 */
function bornerConfiance(valeur: number): number {
  return Number.isFinite(valeur) ? Math.min(1, Math.max(0, valeur)) : 0;
}

/**
 * Profile le site : UN appel, sur le texte de la page de départ. Rend le
 * profil estampillé et son coût, ou rien du tout — jamais une exception.
 */
export async function profilerSite(entree: EntreeProfilage): Promise<ResultatProfilage> {
  const { ia, options, contexte, journaliser, echeance } = entree;
  const indisponible = (raison: string, coutApi = 0, details?: Record<string, unknown>): ResultatProfilage => {
    journaliser('profilage.indisponible', { raison, coutApi, ...details });
    return { coutApi };
  };

  if (options === undefined) {
    return indisponible(RAISON_PROFILAGE_NON_CONFIGURE);
  }
  if (contexte === null) {
    return indisponible(RAISON_CONTEXTE_ABSENT);
  }
  if (Date.now() >= echeance) {
    return indisponible(RAISON_ECHEANCE);
  }

  journaliser('profilage.debut', {
    url: contexte.url,
    nbChars: contexte.texte.length,
    langueDeclaree: contexte.langueDeclaree,
    modele: options.modele,
  });

  let resultat;
  try {
    resultat = await ia.profiler(contexte);
  } catch (cause: unknown) {
    // Aucune exception ne tue un scan pour cause d'IA (cahier §1). Une panne
    // qui lève n'a pas rendu de coût : on n'en invente pas.
    return indisponible(RAISON_PROFILAGE_EN_ERREUR, 0, { message: messageErreur(cause) });
  }
  if (!resultat.disponible) {
    return indisponible(resultat.raison, resultat.coutApi ?? 0, resultat.message === undefined ? undefined : { message: resultat.message });
  }

  const valeur: ProfilPage = resultat.valeur;
  // Second filet, côté scanner : le vocabulaire fermé vit en config et le
  // rapport n'accueille QUE ses valeurs. Le coût, lui, a été payé : il est
  // compté quand même.
  if (!options.config.typesSite.includes(valeur.typeSite)) {
    return indisponible(RAISON_PROFIL_INVALIDE, resultat.coutApi, { typeSite: valeur.typeSite });
  }

  const profil: ProfilSiteRapporte = {
    typeSite: valeur.typeSite,
    // La description libre n'accompagne QUE la valeur d'échappement : ailleurs
    // elle n'a pas de sens, et elle n'est de toute façon jamais lue par une logique.
    natureLibre: valeur.typeSite === options.config.valeurEchappement ? valeur.natureLibre : null,
    langue: valeur.langue,
    confiance: bornerConfiance(valeur.confiance),
    // Estampille recopiée, jamais fabriquée : elle dit ce qui a RÉELLEMENT
    // produit ce profil, pas ce que la config espérait.
    versionPrompt: valeur.versionPrompt,
    modeleDemande: valeur.modeleDemande,
    modeleServi: valeur.modeleServi,
    apresRelance: valeur.apresRelance,
  };
  journaliser('profilage.fin', {
    typeSite: profil.typeSite,
    natureLibre: profil.natureLibre,
    langue: profil.langue,
    confiance: profil.confiance,
    coutApi: resultat.coutApi,
    versionPrompt: profil.versionPrompt,
    modeleDemande: profil.modeleDemande,
    modeleServi: profil.modeleServi,
    apresRelance: profil.apresRelance,
  });
  return { profil, coutApi: resultat.coutApi };
}
