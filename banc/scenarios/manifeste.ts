/**
 * Dérivation du manifeste de vérité terrain (cahier des charges §5).
 *
 * Le manifeste n'est jamais écrit à la main : il est déduit du scénario et
 * de la partie déclarative des bugs du gabarit. Seuls les champs utiles au
 * correcteur sont copiés — les hooks de transformation n'y ont pas leur place.
 */
import { depuisRacine } from '../outils/racine.js';
import type { AttenduManifeste, Gabarit, Manifeste, Scenario } from '../types.js';

/** Schéma commun à tous les manifestes. */
export const FICHIER_SCHEMA_MANIFESTE = depuisRacine('banc', 'schemas', 'manifeste.schema.json');

export function deriverManifeste(scenario: Scenario, gabarit: Gabarit): Manifeste {
  if (scenario.gabarit !== gabarit.nom) {
    throw new Error(
      `Scénario ${scenario.id} : gabarit « ${scenario.gabarit} » attendu, gabarit « ${gabarit.nom} » fourni`,
    );
  }
  const bugsParId = new Map(gabarit.bugs.map((bug) => [bug.id, bug]));
  const attendus = scenario.bugsActifs.map((bugId): AttenduManifeste => {
    const bug = bugsParId.get(bugId);
    if (bug === undefined) {
      throw new Error(`Scénario ${scenario.id} : bug ${bugId} inconnu du gabarit ${gabarit.nom}`);
    }
    return {
      bugId: bug.id,
      nom: bug.nom,
      categorie: bug.categorie,
      pages: [...bug.pages],
      gravite: bug.gravite,
    };
  });
  return { scenarioId: scenario.id, gabarit: gabarit.nom, langue: scenario.langue, attendus };
}
