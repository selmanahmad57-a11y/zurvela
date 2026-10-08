/**
 * SOCLE ANTI-INJECTION HTML — l'échappement PAR CONSTRUCTION (garde cardinale 1
 * du rendu HTML du rapport, publication étape 1).
 *
 * Le contenu du site scanné entre dans la page ET dans le mail (chemins,
 * origine, prose IA, URL). Un `<script>` ou un attribut piégé non échappé
 * s'exécute chez qui lit le rapport. La discipline « appeler echapper() à la
 * main sur chaque champ » repose sur la mémoire ; ici l'échappement est
 * GARANTI : le gabarit étiqueté `html` échappe TOUTE interpolation par défaut,
 * et seule une valeur déjà `FragmentHtml` (notre HTML composé, connu sûr) passe
 * en brut. Oublier d'échapper devient impossible — il faut un geste EXPLICITE
 * (`brut`) pour ne pas échapper, et ce geste est rare, visible, revu.
 */

/** HTML DE CONFIANCE, déjà sûr (composé par nous via `html` ou `brut`). Jamais construit à partir de contenu du site non échappé. */
export class FragmentHtml {
  constructor(readonly valeur: string) {}
}

/** Entités HTML des cinq caractères actifs — l'échappement d'un CONTENU textuel (pas d'un attribut d'URL : voir `lienHref`). */
export function echapperHtml(valeur: string): string {
  return valeur.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * Gabarit étiqueté : échappe CHAQUE interpolation par défaut. Une valeur
 * `FragmentHtml` (HTML de confiance, composé par nous) est insérée telle
 * quelle ; toute autre valeur est convertie en texte PUIS échappée. Le contenu
 * du site, qui arrive toujours en `string`, est donc échappé par construction.
 */
export function html(parties: TemplateStringsArray, ...valeurs: unknown[]): FragmentHtml {
  let sortie = parties[0] as string;
  valeurs.forEach((valeur, i) => {
    sortie += (valeur instanceof FragmentHtml ? valeur.valeur : echapperHtml(String(valeur))) + (parties[i + 1] as string);
  });
  return new FragmentHtml(sortie);
}

/** Sortie EXPLICITE pour du HTML de confiance (littéral que nous écrivons). Rare, visible, revue — le seul moyen de ne pas échapper. */
export function brut(htmlDeConfiance: string): FragmentHtml {
  return new FragmentHtml(htmlDeConfiance);
}

/**
 * PROSE (contenu du site / IA) : échappée, PUIS seulement les sauts de ligne
 * deviennent des `<br>`. Jamais de conversion Markdown→HTML (qui ré-ouvrirait
 * les vecteurs). L'échappement précède l'ajout des `<br>`, qui sont les seules
 * balises, et elles sont à nous.
 */
export function prose(valeur: string): FragmentHtml {
  return new FragmentHtml(echapperHtml(valeur).replace(/\n/g, '<br>'));
}

/**
 * Un `href` SÛR, ou `null`. L'échappement HTML ne protège PAS un `href` :
 * `javascript:alert(1)` ne contient aucun caractère à échapper. On valide donc
 * le SCHÉMA — seuls `http:` et `https:` deviennent un lien ; tout le reste
 * (`javascript:`, `data:`, relatif, vide) rend `null`, et l'appelant affiche
 * alors l'URL en texte seul. La valeur retournée reste à échapper pour
 * l'attribut (via `html`), ce qui neutralise le `"` de fermeture.
 */
export function lienHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
