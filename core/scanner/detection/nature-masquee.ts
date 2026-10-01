/**
 * LA GRAVITÉ D'UN RECOUVREMENT SE LIT SUR CE QU'IL MASQUE (cahier P2-3,
 * contrat 2, D4), pas sur le fait qu'il masque.
 *
 * « Bloquant » est une AFFIRMATION — « le parcours s'arrête là ». Elle est
 * vraie quand un calque couvre la soumission d'un formulaire ou la
 * navigation principale ; elle est fausse quand il couvre un lien de
 * mot-clé dans un pied de page, et la campagne l'a publiée cinq fois de
 * suite (carnet C-12, fiche 09).
 *
 * Les trois natures sont universelles : c'est du WEB, jamais du MONDE. Un
 * bouton d'achat n'est pas reconnu comme tel — nous ne lisons aucun libellé
 * (règle maîtresse §2) — mais il est la soumission d'un formulaire, et c'est
 * par là qu'il compte comme action critique. Les signaux utilisés sont la
 * balise, les attributs du standard (`type`, `role`, `href`) et les
 * LANDMARKS du chemin (`form`, `nav`, `role=navigation`).
 */
import type { Gravite, LocalisationElement } from '../../types.js';

export type NatureMasquee = 'actionCritique' | 'controleOrdinaire' | 'contenuSecondaire' | 'indeterminee';

/**
 * La gravité la plus haute qu'un recouvrement de nature INDÉTERMINÉE peut
 * porter. INVARIANT, donc en code : « bloquant » affirme l'arrêt du
 * parcours, et on ne l'affirme pas de ce qu'on n'a pas su lire. Aucune
 * valeur de config ne doit pouvoir rouvrir ce plafond.
 */
export const GRAVITE_MAX_NATURE_INDETERMINEE: Gravite = 'important';

/** L'échelle des gravités, de la moindre à la plus haute. */
const ECHELLE: readonly Gravite[] = ['mineur', 'important', 'bloquant'];

/** Les natures, de la moins grave à la plus grave : une cause retient la plus haute de ses cibles. */
const ORDRE_NATURES: readonly NatureMasquee[] = ['indeterminee', 'contenuSecondaire', 'controleOrdinaire', 'actionCritique'];

/** La balise d'un segment de chemin CSS (`div:nth-of-type(2)` → `div`, `#entete` → ''). */
function baliseDuSegment(segment: string): string {
  const balise = /^[a-z][a-z0-9-]*/i.exec(segment.trim());
  return balise === null ? '' : balise[0].toLowerCase();
}

/** Les balises des ancêtres portées par le chemin, la cible exclue. */
function ancetres(selecteur: string): string[] {
  const segments = selecteur.split('>').map((segment) => segment.trim());
  return segments.slice(0, -1).map(baliseDuSegment);
}

/** Le type d'un `input`/`button`, en minuscules ; `submit` quand l'attribut manque sur un `button` (défaut du standard). */
function typeDe(element: LocalisationElement): string {
  const brut = (element.attributs['type'] ?? '').trim().toLowerCase();
  if (brut !== '') {
    return brut;
  }
  return element.balise === 'button' ? 'submit' : '';
}

/**
 * La nature de l'élément masqué.
 *
 * `indeterminee` n'est pas un échec du code : c'est le refus d'affirmer.
 * Une balise que nous ne savons pas situer reste indéterminée, et le
 * plafond s'applique.
 */
export function natureMasquee(element: LocalisationElement): NatureMasquee {
  const balise = element.balise.toLowerCase();
  const role = (element.attributs['role'] ?? '').trim().toLowerCase();
  const chemin = ancetres(element.selecteur);
  const dansNavigation = chemin.includes('nav');
  const dansFormulaire = chemin.includes('form');

  // ACTION CRITIQUE : ce dont dépend la suite du parcours.
  const soumet = (balise === 'button' && typeDe(element) === 'submit') || (balise === 'input' && ['submit', 'image'].includes(typeDe(element)));
  if (soumet || (dansFormulaire && (balise === 'button' || balise === 'input'))) {
    return 'actionCritique';
  }
  if (dansNavigation && (balise === 'a' || role === 'link')) {
    return 'actionCritique';
  }

  // CONTRÔLE ORDINAIRE : interactif, mais rien ne dit que le parcours en dépend.
  if (['button', 'input', 'select', 'textarea'].includes(balise) || role === 'button') {
    return 'controleOrdinaire';
  }

  // UN LIEN SE JUGE SUR SON LANDMARK, pas sur sa balise. Le carnet portait
  // les deux cas, et ils ne valent pas le même prix : un lien de mot-clé
  // dans un PIED DE PAGE (fiche 09) est du contenu secondaire ; un lien
  // d'offre dans le CORPS de la page est ce par quoi le visiteur avance.
  // Les landmarks HTML (`footer`, `aside`) sont universels — c'est du web,
  // jamais du monde —, et sans landmark on ne descend pas au plus bas :
  // supposer « secondaire » sans preuve enterrerait un vrai défaut.
  if (balise === 'a' || role === 'link') {
    const chromeSecondaire = chemin.includes('footer') || chemin.includes('aside');
    return chromeSecondaire ? 'contenuSecondaire' : 'controleOrdinaire';
  }
  return 'indeterminee';
}

/** La nature la plus grave d'un ensemble de cibles : une cause vaut ce que vaut le pire de ce qu'elle masque. */
export function naturePlusGrave(natures: readonly NatureMasquee[]): NatureMasquee {
  let pire: NatureMasquee = 'indeterminee';
  for (const nature of natures) {
    if (ORDRE_NATURES.indexOf(nature) > ORDRE_NATURES.indexOf(pire)) {
      pire = nature;
    }
  }
  return pire;
}

export interface ConfigGraviteRecouvrement {
  /** Gravité de repli, quand la nature n'a pas pu être établie. */
  gravite: Gravite;
  graviteParNature: { actionCritique: Gravite; controleOrdinaire: Gravite; contenuSecondaire: Gravite };
}

/** La gravité publiable d'un recouvrement, plafond compris. */
export function graviteRecouvrement(nature: NatureMasquee, config: ConfigGraviteRecouvrement): Gravite {
  if (nature !== 'indeterminee') {
    return config.graviteParNature[nature];
  }
  // LE PLAFOND, en code : on n'affirme pas l'arrêt d'un parcours dont on
  // n'a pas su lire ce qui est bloqué.
  return ECHELLE.indexOf(config.gravite) > ECHELLE.indexOf(GRAVITE_MAX_NATURE_INDETERMINEE)
    ? GRAVITE_MAX_NATURE_INDETERMINEE
    : config.gravite;
}
