/**
 * Briques communes des clés de cassette : le hachage et la normalisation
 * d'URL.
 *
 * Elles vivent ici, et non dans `cassettes.ts`, parce que la normalisation de
 * l'état de décision (`etat-decision.ts`) en a besoin ET que `cassettes.ts`
 * dépend d'elle : sans ce module, les deux s'importeraient mutuellement.
 */
import { createHash } from 'node:crypto';

/**
 * Hash d'une entrée déjà sérialisée de façon déterministe. Toujours un
 * TABLEAU à ordre fixe en amont, jamais un objet : l'ordre des clés d'un objet
 * est une propriété du code qui le construit, donc une source de dérive
 * silencieuse.
 */
export function hacherEntree(entree: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(entree), 'utf8').digest('hex');
}

/**
 * Un port n'identifie pas un site : c'est une propriété de l'hôte qui le sert.
 * Le banc démarre son serveur de scénario sur le premier port libre à partir
 * d'une base ; si le port entrait dans la clé, un poste où ce port est occupé
 * ne retrouverait AUCUNE cassette du parc committé — et le message d'erreur
 * dirait « lance la commande d'enregistrement », c'est-à-dire accuserait le
 * mauvais coupable (APPRENTISSAGES n°6).
 *
 * Le reste de l'URL est conservé : protocole, hôte, chemin et paramètres
 * distinguent bel et bien deux sites. Une URL que Node ne sait pas analyser
 * est laissée telle quelle — on ne normalise que ce qu'on comprend, ce qui
 * couvre aussi le cas d'un simple chemin (`/catalogue?page=2`).
 */
export function normaliserUrlPourCle(url: string): string {
  try {
    const analysee = new URL(url);
    analysee.port = '';
    return analysee.toString();
  } catch {
    return url;
  }
}
