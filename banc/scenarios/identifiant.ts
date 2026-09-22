/**
 * Identifiant et nom de fichier d'un scénario.
 *
 * Format : `<gabarit>--<bugs actifs en minuscules joints par '-'>--<langue>` ;
 * sans bug actif, le segment des bugs est le jeton sain de la configuration
 * (ex. `formulaire-contact--sain--fr`, `formulaire-contact--f01-m01--fr`).
 */

/** Sépare les trois segments de l'identifiant. */
const SEPARATEUR_SEGMENTS = '--';
/** Sépare les bugs au sein du segment central. */
const SEPARATEUR_BUGS = '-';

export const SUFFIXE_FICHIER_SCENARIO = '.scenario.json';

export function construireIdScenario(
  gabarit: string,
  bugsActifs: string[],
  langue: string,
  jetonSain: string,
): string {
  for (const [nom, valeur] of [
    ['gabarit', gabarit],
    ['langue', langue],
    ['jetonSain', jetonSain],
    ...bugsActifs.map((bug) => ['bug', bug]),
  ]) {
    if (valeur === '') {
      throw new Error(`Identifiant de scénario : le segment « ${nom} » est vide`);
    }
  }
  const segmentBugs =
    bugsActifs.length === 0
      ? jetonSain
      : bugsActifs.map((bug) => bug.toLowerCase()).join(SEPARATEUR_BUGS);
  return [gabarit, segmentBugs, langue].join(SEPARATEUR_SEGMENTS);
}

/** Nom du fichier d'un scénario dans le dossier des scénarios. */
export function nomFichierScenario(id: string): string {
  return `${id}${SUFFIXE_FICHIER_SCENARIO}`;
}

/** Identifiant porté par un nom de fichier de scénario, ou null si ce n'en est pas un. */
export function idDepuisNomFichier(nomFichier: string): string | null {
  if (!nomFichier.endsWith(SUFFIXE_FICHIER_SCENARIO)) {
    return null;
  }
  const id = nomFichier.slice(0, -SUFFIXE_FICHIER_SCENARIO.length);
  return id === '' ? null : id;
}
