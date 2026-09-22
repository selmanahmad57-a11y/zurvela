/**
 * Scorecard (cahier des charges §7) : agrégats global, par langue et par
 * catégorie de bug, écart de détection inter-langues, rendu console et
 * journalisation JSON.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie } from '../../core/types.js';
import type { Agregat, ConfigBanc, EcartLangues, ResultatAttendu, ResultatScenario, Scorecard } from '../types.js';

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

function agreger(tranche: Tranche): Agregat {
  const nbAttendus = tranche.attendus.length;
  const nbDetectes = tranche.attendus.filter((resultat) => resultat.verdict === 'detecte').length;
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
    tauxDetection: taux(nbDetectes, nbAttendus),
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
const COLONNES = ['perimetre', 'scenarios', 'detection', 'detectes', 'fauxPositifs', 'rates', 'erreurs', 'coutApi', 'duree'] as const;

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
    `${formateurs.entier.format(agregat.nbDetectes)}/${formateurs.entier.format(agregat.nbAttendus)}`,
    `${formateurs.entier.format(agregat.nbFauxPositifs)} (${formaterTaux(agregat.tauxFauxPositifs)})`,
    formateurs.entier.format(agregat.nbRates),
    formateurs.entier.format(agregat.nbErreurs),
    formateurs.montant.format(agregat.coutApi),
    formateurs.entier.format(agregat.dureeMs),
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
