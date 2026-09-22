/**
 * Scorecard (cahier des charges §7) : agrégats global, par langue et par
 * catégorie de bug, écart de détection inter-langues, rendu console et
 * journalisation JSON.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie } from '../../core/types.js';
import type { Agregat, ComptesProtocole, ConfigBanc, EcartLangues, ResultatAttendu, ResultatScenario, Scorecard } from '../types.js';
import { comptesProtocoleZero } from './appariement.js';

/** Un sous-ensemble de résultats à agréger : scénarios comptés, attendus et faux positifs retenus. */
interface Tranche {
  scenarios: ResultatScenario[];
  attendus: ResultatAttendu[];
  fauxPositifs: Anomalie[];
}

const DECIMALES_TAUX = 1;

function arrondir(valeur: number, decimales: number): number {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/** Pourcentage arrondi, ou null si le dénominateur est nul (taux non défini, pas 0). */
function taux(numerateur: number, denominateur: number): number | null {
  return denominateur === 0 ? null : arrondir((numerateur / denominateur) * 100, DECIMALES_TAUX);
}

function somme(valeurs: number[]): number {
  return valeurs.reduce((total, valeur) => total + valeur, 0);
}

/**
 * Somme les comptes du protocole des scénarios de la tranche. Un scénario
 * sans comptes (sujet sans protocole, scénario en erreur) vaut zéro : les
 * compteurs sont toujours des nombres, jamais `undefined` au milieu d'un
 * agrégat.
 *
 * La somme n'a de sens ARITHMÉTIQUE que sur une tranche qui PARTITIONNE les
 * scénarios (le global, les langues) : une tranche par catégorie de bug
 * compte le scénario entier dans chacune des catégories qu'il porte. Voir le
 * commentaire d'`Agregat` dans banc/types.ts et les périmètres partitionnants
 * du rendu console, plus bas.
 */
function agregerProtocole(scenarios: ResultatScenario[]): ComptesProtocole {
  const comptes = scenarios.map((scenario) => scenario.protocole ?? comptesProtocoleZero());
  return {
    nbCandidates: somme(comptes.map((compte) => compte.nbCandidates)),
    nbGroupes: somme(comptes.map((compte) => compte.nbGroupes)),
    nbGroupesRetenus: somme(comptes.map((compte) => compte.nbGroupesRetenus)),
    nbGroupesEcartes: somme(comptes.map((compte) => compte.nbGroupesEcartes)),
    nbFaussesAlertesEvitees: somme(comptes.map((compte) => compte.nbFaussesAlertesEvitees)),
    nbPertesProtocole: somme(comptes.map((compte) => compte.nbPertesProtocole)),
    nbEcartesNonApparies: somme(comptes.map((compte) => compte.nbEcartesNonApparies)),
  };
}

function agreger(tranche: Tranche): Agregat {
  const nbAttendus = tranche.attendus.length;
  const nbDetectes = tranche.attendus.filter((resultat) => resultat.verdict === 'detecte').length;
  const nbVerdictsCorrects = tranche.attendus.filter((resultat) => resultat.bienJuge === true).length;
  const nbFauxPositifs = tranche.fauxPositifs.length;
  const nbSignalements = somme(tranche.attendus.map((resultat) => resultat.anomaliesAppariees.length)) + nbFauxPositifs;
  return {
    nbScenarios: tranche.scenarios.length,
    nbErreurs: tranche.scenarios.filter((scenario) => scenario.statut === 'erreur').length,
    nbAttendus,
    nbDetectes,
    nbRates: nbAttendus - nbDetectes,
    nbSignalements,
    nbFauxPositifs,
    nbVerdictsCorrects,
    ...agregerProtocole(tranche.scenarios),
    tauxDetection: taux(nbDetectes, nbAttendus),
    tauxVerdictsCorrects: taux(nbVerdictsCorrects, nbAttendus),
    tauxFauxPositifs: taux(nbFauxPositifs, nbSignalements),
    coutApi: somme(tranche.scenarios.map((scenario) => scenario.coutApi)),
    dureeMs: somme(tranche.scenarios.map((scenario) => scenario.dureeMs)),
  };
}

function trancheComplete(scenarios: ResultatScenario[]): Tranche {
  return {
    scenarios,
    attendus: scenarios.flatMap((scenario) => scenario.attendus),
    fauxPositifs: scenarios.flatMap((scenario) => scenario.fauxPositifs),
  };
}

/** Un agrégat par langue : celles de la config d'abord (dans leur ordre), puis toute langue rencontrée en plus. */
function agregerParLangue(resultats: ResultatScenario[], config: ConfigBanc): Record<string, Agregat> {
  const langues = [...new Set([...config.langues, ...resultats.map((resultat) => resultat.langue)])];
  const parLangue: Record<string, Agregat> = {};
  for (const langue of langues) {
    parLangue[langue] = agreger(trancheComplete(resultats.filter((resultat) => resultat.langue === langue)));
  }
  return parLangue;
}

/**
 * Un agrégat par catégorie : attendus et faux positifs de la catégorie ;
 * scénarios comptés = ceux ayant au moins un attendu de la catégorie
 * (coût et durée sommés sur eux). Une catégorie n'ayant que des faux
 * positifs apparaît avec zéro scénario.
 */
function agregerParCategorie(resultats: ResultatScenario[]): Record<string, Agregat> {
  const categories = [
    ...new Set(
      resultats.flatMap((resultat) => [
        ...resultat.attendus.map((attendu) => attendu.attendu.categorie),
        ...resultat.fauxPositifs.map((anomalie) => anomalie.categorie),
      ]),
    ),
  ];
  const parCategorie: Record<string, Agregat> = {};
  for (const categorie of categories) {
    parCategorie[categorie] = agreger({
      scenarios: resultats.filter((resultat) => resultat.attendus.some((attendu) => attendu.attendu.categorie === categorie)),
      attendus: resultats.flatMap((resultat) => resultat.attendus.filter((attendu) => attendu.attendu.categorie === categorie)),
      fauxPositifs: resultats.flatMap((resultat) => resultat.fauxPositifs.filter((anomalie) => anomalie.categorie === categorie)),
    });
  }
  return parCategorie;
}

/** Écart max−min des taux de détection des langues notables (taux non null) ; null s'il y en a moins de deux. */
function calculerEcartLangues(parLangue: Record<string, Agregat>, config: ConfigBanc): EcartLangues {
  const seuil = config.scorecard.seuilAlarmeEcartLanguesPoints;
  const tauxNotables = Object.values(parLangue)
    .map((agregat) => agregat.tauxDetection)
    .filter((valeur): valeur is number => valeur !== null);
  const points = tauxNotables.length >= 2 ? arrondir(Math.max(...tauxNotables) - Math.min(...tauxNotables), DECIMALES_TAUX) : null;
  return { points, seuil, alarme: points !== null && points > seuil };
}

export function calculerScorecard(resultats: ResultatScenario[], config: ConfigBanc, horodatage: string): Scorecard {
  const parLangue = agregerParLangue(resultats, config);
  return {
    horodatage,
    global: agreger(trancheComplete(resultats)),
    parLangue,
    parCategorie: agregerParCategorie(resultats),
    ecartLangues: calculerEcartLangues(parLangue, config),
    scenarios: resultats,
  };
}

// ---------------------------------------------------------------------------
// Rendu console
// ---------------------------------------------------------------------------

const SEPARATEUR_COLONNES = '  ';
const TRAIT = '-';

/** Colonnes des tableaux, dans l'ordre d'affichage (clés de `scorecard.colonnes` du dictionnaire). */
const COLONNES = [
  'perimetre',
  'scenarios',
  'detection',
  'verdictsCorrects',
  'detectes',
  'fauxPositifs',
  'rates',
  'erreurs',
  'coutApi',
  'duree',
] as const;

/**
 * Colonnes du tableau du protocole (clés de `scorecard.colonnes`). Elles
 * racontent la mesure AVANT/APRÈS dans l'ordre de lecture : ce que la
 * détection a produit, ce que la consolidation en a fait, ce qui est sorti,
 * ce que le protocole a tu — à raison, à tort, ou sans que le banc puisse
 * en juger.
 *
 * Tout s'y compte en GROUPES DE CAUSE RACINE sauf les deux colonnes de
 * décomposition (évitées, perdues), qui comptent des attendus distincts du
 * manifeste. C'est ce qui rend la ligne lisible de gauche à droite :
 * `Groupes = Retenus + Écartés`.
 */
const COLONNES_PROTOCOLE = [
  'perimetre',
  'candidates',
  'groupes',
  'retenues',
  'ecartees',
  'faussesAlertesEvitees',
  'anomaliesPerdues',
  'ecartesNonApparies',
] as const;

interface Formateurs {
  entier: Intl.NumberFormat;
  pourcentage: Intl.NumberFormat;
  /** Écart inter-langues en points de pourcentage (pas un taux). */
  points: Intl.NumberFormat;
  montant: Intl.NumberFormat;
}

function construireFormateurs(langueConsole: string): Formateurs {
  return {
    entier: new Intl.NumberFormat(langueConsole, { maximumFractionDigits: 0 }),
    pourcentage: new Intl.NumberFormat(langueConsole, {
      style: 'percent',
      minimumFractionDigits: DECIMALES_TAUX,
      maximumFractionDigits: DECIMALES_TAUX,
    }),
    points: new Intl.NumberFormat(langueConsole, { maximumFractionDigits: DECIMALES_TAUX }),
    montant: new Intl.NumberFormat(langueConsole, { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  };
}

function ligneAgregat(perimetre: string, agregat: Agregat, formateurs: Formateurs, nonApplicable: string): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  return [
    perimetre,
    formateurs.entier.format(agregat.nbScenarios),
    formaterTaux(agregat.tauxDetection),
    formaterTaux(agregat.tauxVerdictsCorrects),
    `${formateurs.entier.format(agregat.nbDetectes)}/${formateurs.entier.format(agregat.nbAttendus)}`,
    `${formateurs.entier.format(agregat.nbFauxPositifs)} (${formaterTaux(agregat.tauxFauxPositifs)})`,
    formateurs.entier.format(agregat.nbRates),
    formateurs.entier.format(agregat.nbErreurs),
    formateurs.montant.format(agregat.coutApi),
    formateurs.entier.format(agregat.dureeMs),
  ];
}

/**
 * Une ligne du tableau du protocole. « Retenues » compte les GROUPES retenus,
 * pas les anomalies signalées : mélanger les deux unités sur la même ligne
 * donnait un total arithmétiquement faux (`Groupes ≠ Retenues + Écartées`).
 */
function ligneProtocole(perimetre: string, agregat: Agregat, formateurs: Formateurs): string[] {
  return [
    perimetre,
    formateurs.entier.format(agregat.nbCandidates),
    formateurs.entier.format(agregat.nbGroupes),
    formateurs.entier.format(agregat.nbGroupesRetenus),
    formateurs.entier.format(agregat.nbGroupesEcartes),
    formateurs.entier.format(agregat.nbFaussesAlertesEvitees),
    formateurs.entier.format(agregat.nbPertesProtocole),
    formateurs.entier.format(agregat.nbEcartesNonApparies),
  ];
}

/** Tableau texte aligné : première colonne à gauche, les autres (numériques) à droite. */
function formaterTableau(entetes: string[], lignes: string[][]): string[] {
  const largeurs = entetes.map((entete, colonne) =>
    Math.max(entete.length, ...lignes.map((ligne) => (ligne[colonne] ?? '').length)),
  );
  const aligner = (cellules: string[]): string =>
    cellules
      .map((cellule, colonne) => {
        const largeur = largeurs[colonne] ?? 0;
        return colonne === 0 ? cellule.padEnd(largeur) : cellule.padStart(largeur);
      })
      .join(SEPARATEUR_COLONNES);
  return [aligner(entetes), aligner(largeurs.map((largeur) => TRAIT.repeat(largeur))), ...lignes.map(aligner)];
}

export function rendreScorecardConsole(scorecard: Scorecard, dico: Dictionnaire, langueConsole: string): string {
  const formateurs = construireFormateurs(langueConsole);
  const nonApplicable = traduire(dico, 'scorecard.nonApplicable');
  const entetes = COLONNES.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`));
  const tableau = (lignes: [string, Agregat][]): string[] =>
    formaterTableau(
      entetes,
      lignes.map(([perimetre, agregat]) => ligneAgregat(perimetre, agregat, formateurs, nonApplicable)),
    );

  // PÉRIMÈTRES QUI PARTITIONNENT les scénarios, et eux seuls : le global et
  // les langues (chaque scénario a exactement une langue, la somme des langues
  // égale le global). Le périmètre « catégorie de bug » en est exclu, pour
  // deux raisons qui se cumulent : un scénario multi-catégories serait compté
  // dans plusieurs lignes (leur somme dépasserait le global), et un groupe de
  // CAUSE RACINE n'est de toute façon pas ventilable par catégorie de bug —
  // une même cause réseau produit des anomalies de catégories différentes.
  // Les compteurs restent dans chaque `Agregat` du JSON ; ce qui est AFFICHÉ
  // ne doit jamais être arithmétiquement faux.
  const perimetresPartitionnants: [string, Agregat][] = [
    [traduire(dico, 'scorecard.global'), scorecard.global],
    ...Object.entries(scorecard.parLangue),
  ];
  const tableauProtocole = formaterTableau(
    COLONNES_PROTOCOLE.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    perimetresPartitionnants.map(([perimetre, agregat]) => ligneProtocole(perimetre, agregat, formateurs)),
  );
  const { nbCandidates, nbGroupes, nbGroupesRetenus, nbGroupesEcartes, nbFaussesAlertesEvitees, nbPertesProtocole, nbEcartesNonApparies, nbScenarios } =
    scorecard.global;
  // Le chiffre commercial ne se cite JAMAIS seul : la synthèse porte les trois
  // nombres de décomposition, y compris quand les deux derniers valent zéro.
  const syntheseProtocole = traduire(dico, 'scorecard.syntheseProtocole', {
    candidates: formateurs.entier.format(nbCandidates),
    groupes: formateurs.entier.format(nbGroupes),
    retenues: formateurs.entier.format(nbGroupesRetenus),
    ecartees: formateurs.entier.format(nbGroupesEcartes),
    evitees: formateurs.entier.format(nbFaussesAlertesEvitees),
    perdues: formateurs.entier.format(nbPertesProtocole),
    nonApparies: formateurs.entier.format(nbEcartesNonApparies),
    scenarios: formateurs.entier.format(nbScenarios),
  });

  const { points, seuil, alarme } = scorecard.ecartLangues;
  const ligneEcart =
    points === null
      ? traduire(dico, 'scorecard.ecartLanguesNonCalculable')
      : traduire(dico, 'scorecard.ecartLangues', {
          points: formateurs.points.format(points),
          seuil: formateurs.points.format(seuil),
        });

  return [
    traduire(dico, 'scorecard.titre'),
    '',
    traduire(dico, 'scorecard.global'),
    ...tableau([[traduire(dico, 'scorecard.global'), scorecard.global]]),
    '',
    traduire(dico, 'scorecard.parLangue'),
    ...tableau(Object.entries(scorecard.parLangue)),
    '',
    traduire(dico, 'scorecard.parCategorie'),
    ...tableau(Object.entries(scorecard.parCategorie)),
    '',
    traduire(dico, 'scorecard.protocole'),
    ...tableauProtocole,
    '',
    syntheseProtocole,
    // Alarme : une anomalie réelle perdue invalide la lecture de la synthèse.
    // Elle reste CONDITIONNELLE (la synthèse, elle, cite toujours les trois
    // nombres) : une alarme qui crie à chaque exécution est une alarme
    // qu'on n'écoute plus.
    ...(nbPertesProtocole > 0
      ? [traduire(dico, 'scorecard.alarmePertes', { perdues: formateurs.entier.format(nbPertesProtocole) })]
      : []),
    ligneEcart,
    ...(alarme ? [traduire(dico, 'scorecard.alarme')] : []),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Journalisation JSON (constitution §5)
// ---------------------------------------------------------------------------

const EXTENSION_SCORECARD = '.json';

/** Écrit `<dossier>/<horodatage>.json` (les `:` de l'ISO 8601 sont remplacés par `-` : nom de fichier portable) et retourne le chemin. */
export async function ecrireScorecard(scorecard: Scorecard, dossier: string): Promise<string> {
  await mkdir(dossier, { recursive: true });
  const fichier = path.join(dossier, `${scorecard.horodatage.replaceAll(':', '-')}${EXTENSION_SCORECARD}`);
  await writeFile(fichier, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');
  return fichier;
}

/**
 * Ne conserve dans `dossier` que les `retention` scorecards les plus récentes
 * (cahier brique 2 §0, `scorecard.retentionRuns`). Les fichiers sont nommés
 * par leur horodatage ISO : l'ordre des noms est l'ordre chronologique. Tout
 * ce qui n'est pas une scorecard (`.gitkeep`, sous-dossiers) est ignoré.
 * Retourne les chemins supprimés.
 */
export async function purgerResultats(dossier: string, retention: number): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const scorecards = entrees
    .filter((entree) => entree.isFile() && entree.name.endsWith(EXTENSION_SCORECARD))
    .map((entree) => entree.name)
    .sort();
  const aSupprimer = scorecards.slice(0, Math.max(0, scorecards.length - retention)).map((nom) => path.join(dossier, nom));
  await Promise.all(aSupprimer.map((fichier) => rm(fichier)));
  return aSupprimer;
}
