/**
 * Transformations STRUCTURELLES de texte (HTML, JS, CSS) réutilisables par
 * les bugs injectables de tout gabarit.
 *
 * Les motifs manipulés ici ne connaissent que le web (balises, attributs,
 * marqueurs de bloc) — jamais un mot de langue naturelle (constitution §2).
 * Chaque helper LÈVE quand sa cible est introuvable : un bug qui ne
 * s'appliquerait pas silencieusement fausserait la vérité terrain du banc.
 */

/** Désigne une balise par un attribut repère, ex. `<button data-role="envoyer">`. */
export interface SelecteurBalise {
  balise: string;
  attribut: string;
  valeur: string;
}

function echapperRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function echapperAttribut(valeur: string): string {
  return valeur.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Motif de la balise OUVRANTE désignée par le sélecteur (valeur d'attribut entre guillemets simples ou doubles). */
function motifBaliseOuvrante(selecteur: SelecteurBalise): RegExp {
  const balise = echapperRegex(selecteur.balise);
  const attribut = echapperRegex(selecteur.attribut);
  const valeur = echapperRegex(selecteur.valeur);
  return new RegExp(
    `<${balise}(?=[\\s>])[^>]*?(?<=\\s)${attribut}\\s*=\\s*(?:"${valeur}"|'${valeur}')[^>]*>`,
    'gi',
  );
}

function decrire(selecteur: SelecteurBalise): string {
  return `<${selecteur.balise} ${selecteur.attribut}="${selecteur.valeur}">`;
}

/** Nombre de balises ouvrantes correspondant au sélecteur. */
export function compterBalises(html: string, selecteur: SelecteurBalise): number {
  return html.match(motifBaliseOuvrante(selecteur))?.length ?? 0;
}

/**
 * Remplace la valeur d'un attribut sur chaque balise désignée par le
 * sélecteur. Lève si aucune balise ne correspond ou si l'attribut manque.
 */
export function modifierAttribut(
  html: string,
  selecteur: SelecteurBalise,
  attribut: string,
  nouvelleValeur: string,
): string {
  const motifAttribut = new RegExp(
    `(?<=\\s)${echapperRegex(attribut)}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`,
    'i',
  );
  let nombre = 0;
  const resultat = html.replace(motifBaliseOuvrante(selecteur), (balise) => {
    nombre += 1;
    if (!motifAttribut.test(balise)) {
      throw new Error(`Attribut « ${attribut} » absent de ${decrire(selecteur)}`);
    }
    return balise.replace(motifAttribut, `${attribut}="${echapperAttribut(nouvelleValeur)}"`);
  });
  if (nombre === 0) {
    throw new Error(`Balise introuvable : ${decrire(selecteur)}`);
  }
  return resultat;
}

/**
 * Insère un fragment juste après la balise FERMANTE de chaque élément
 * désigné par le sélecteur. Suppose un élément qui ne s'imbrique pas dans
 * lui-même (button, label, p…) : la première fermante rencontrée est la
 * sienne. Lève si l'élément ou sa fermante est introuvable.
 */
export function insererApresElement(html: string, selecteur: SelecteurBalise, fragment: string): string {
  const motifOuvrante = motifBaliseOuvrante(selecteur);
  const fermante = `</${selecteur.balise}>`;
  let resultat = '';
  let curseur = 0;
  let nombre = 0;
  for (const correspondance of html.matchAll(motifOuvrante)) {
    const debutOuvrante = correspondance.index;
    const finOuvrante = debutOuvrante + correspondance[0].length;
    const debutFermante = html.toLowerCase().indexOf(fermante.toLowerCase(), finOuvrante);
    if (debutFermante === -1) {
      throw new Error(`Balise fermante introuvable pour ${decrire(selecteur)}`);
    }
    const finFermante = debutFermante + fermante.length;
    resultat += html.slice(curseur, finFermante) + fragment;
    curseur = finFermante;
    nombre += 1;
  }
  if (nombre === 0) {
    throw new Error(`Balise introuvable : ${decrire(selecteur)}`);
  }
  return resultat + html.slice(curseur);
}

/** Insère un fragment juste avant la fermeture `</head>` ou `</body>`. Lève si elle manque. */
export function insererAvantFermeture(html: string, balise: 'head' | 'body', fragment: string): string {
  const fermante = `</${balise}>`;
  const position = html.toLowerCase().lastIndexOf(fermante);
  if (position === -1) {
    throw new Error(`Balise fermante introuvable : ${fermante}`);
  }
  return html.slice(0, position) + fragment + html.slice(position);
}

/**
 * Retire chaque bloc délimité par `/* @bloc:nom *\/` et `/* @fin-bloc:nom *\/`,
 * marqueurs compris. Lève si aucun bloc de ce nom n'existe.
 */
export function retirerBlocs(source: string, nomBloc: string): string {
  const nom = echapperRegex(nomBloc);
  const motif = new RegExp(`\\/\\*\\s*@bloc:${nom}\\s*\\*\\/[\\s\\S]*?\\/\\*\\s*@fin-bloc:${nom}\\s*\\*\\/`, 'g');
  let nombre = 0;
  const resultat = source.replace(motif, () => {
    nombre += 1;
    return '';
  });
  if (nombre === 0) {
    throw new Error(`Bloc introuvable : @bloc:${nomBloc}`);
  }
  return resultat;
}
