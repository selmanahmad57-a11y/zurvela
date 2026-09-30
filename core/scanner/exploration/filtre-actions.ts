/**
 * Filtre d'actions destructives (constitution §3) : appliqué en code APRÈS
 * la décision, non contournable par le contenu de la page. SEUL consommateur
 * de config/actions-interdites.json : le code ne connaît aucun mot, il
 * confronte des chaînes normalisées aux motifs de config.
 *
 * Deuxième ligne de défense, mécanique et limitée aux marchés de lancement
 * (la première, language-agnostic, sera le jugement IA). TROIS CANAUX, deux
 * listes de config :
 *  - `texte` (langage humain : nom perçu du déclencheur + `attributsTexte`)
 *    confronté à `motifsTexte` (catégorie → langue → motifs) ;
 *  - `url` (`attributsUrl`) confronté à `motifsUrl`, par token exact sur les
 *    segments du chemin, les valeurs de paramètres et le fragment ;
 *  - `identifiant` (`attributsIdentifiants`) confronté à la même liste, la
 *    valeur étant tokenisée sur `-`, `_` et les frontières camelCase.
 * Ordre d'examen : texte, url, identifiant — la catégorie du canal texte est
 * l'information la plus utile au journal. Le premier motif trouvé décide.
 *
 * Le filtre est FERMÉ : une action qu'il ne peut pas examiner (lecture en
 * page impossible) n'est pas exécutée.
 *
 * Limites assumées, à lever par le jugement IA (brique 4+) :
 *  - `exceptionsSandbox` n'est PAS consommé ici (usage futur : le mode
 *    sandbox lèvera l'interdit sur les catégories qui n'y figurent pas) ;
 *  - un motif multi-mots est cherché en sous-chaîne dans une valeur dont les
 *    blancs sont repliés : le nom perçu étant la jointure de ses morceaux
 *    (texte rendu, attributs de descendants, contenu généré), un motif peut
 *    franchir la frontière entre deux d'entre eux. Sur-blocage assumé : le
 *    filtre est fermé, il refuse plutôt qu'il ne laisse passer ;
 *  - la normalisation replie les accents (NFKD), jamais les transcriptions
 *    d'une langue (allemand `ö` → `oe`) : les deux graphies doivent figurer
 *    en config quand elles comptent.
 */
import type { Page } from 'playwright';
import type { Action } from '../../types.js';
import type { ActionsInterdites } from '../config.js';
import { lireDeclencheur } from './en-page.js';

/** Raison technique d'un refus qui ne vient pas d'un motif de config. */
export const RAISON_LECTURE_IMPOSSIBLE = 'lecture-impossible';

/** Classe d'attributs qui a porté le motif. */
export type CanalFiltre = 'texte' | 'url' | 'identifiant';

/** Refus dû à un motif de config : le canal dit d'où il vient. */
export interface RefusMotif {
  autorisee: false;
  canal: CanalFiltre;
  /** Catégorie de risque, canal `texte` uniquement. */
  categorie?: string;
  /** Langue du motif, canal `texte` uniquement. */
  langue?: string;
  motif: string;
  raison?: undefined;
}

/** Refus sans motif : le filtre n'a pas pu examiner l'action (filtre fermé). */
export interface RefusTechnique {
  autorisee: false;
  raison: string;
  canal?: undefined;
  categorie?: undefined;
  langue?: undefined;
  motif?: undefined;
}

export type VerdictFiltre = { autorisee: true } | RefusMotif | RefusTechnique;

export type FiltreActions = (action: Action, page: Page) => Promise<VerdictFiltre>;

/** Le filtre appliqué à un ÉLÉMENT que le CODE s'apprête à activer (constitution §3, clause de P2-3). */
export type FiltreElement = (page: Page, selecteur: string) => Promise<VerdictFiltre>;

/** Le même, déjà lié à sa page : ce que reçoit un module qui agit sur une page donnée. */
export type FiltreElementLie = (selecteur: string) => Promise<VerdictFiltre>;

/** Valeurs lues sur l'action, réparties par canal. */
export interface ValeursExaminees {
  texte: string[];
  url: string[];
  identifiant: string[];
}

/** Base neutre de résolution des URL relatives : son hôte n'est jamais examiné. */
const BASE_RELATIVE = 'http://relatif.invalid/';

/**
 * Normalisation technique universelle : minuscules, décomposition de
 * compatibilité NFKD (replie pleine chasse et ligatures), retrait des marques
 * combinantes (accents) et des caractères de format invisibles (tiret
 * conditionnel, espaces sans chasse, marques bidi), puis repli de toute suite
 * de blancs en une espace simple.
 *
 * Le repli des blancs n'est pas cosmétique : un motif multi-mots est cherché
 * en sous-chaîne, et le texte rendu d'un déclencheur porte un saut de ligne
 * dès que ses enfants sont mis en page en bloc (`display:flex`, `grid`). Sans
 * repli, le blocage dépendrait de la mise en page du site, pas du sens — un
 * contournement par le contenu d'une page (constitution §3).
 */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Tokens d'une valeur normalisée : tout ce qui n'est ni lettre ni chiffre sépare. */
export function tokens(valeur: string): string[] {
  return normaliser(valeur)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((jeton) => jeton !== '');
}

/**
 * Tokens d'un identifiant technique : séparateurs usuels (`-`, `_`) et
 * frontières camelCase (`deleteAccountBtn` → delete, account, btn).
 */
export function tokensIdentifiant(valeur: string): string[] {
  const coupe = valeur
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
  return tokens(coupe);
}

/** Décodage pourcent tolérant : une séquence invalide reste telle quelle. */
function decoder(valeur: string): string {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
}

/**
 * Tokens d'une URL : segments du chemin, valeurs des paramètres de requête et
 * fragment (les routes en `#/…` d'une application monopage sont des chemins).
 * JAMAIS l'hôte : un nom de domaine n'est pas une action. Une URL relative est
 * résolue sur une base neutre ; une valeur d'un autre schéma (`mailto:`,
 * `javascript:`) est traitée comme un chemin.
 */
export function tokensUrl(valeur: string): string[] {
  let url: URL | null = null;
  try {
    url = new URL(valeur, BASE_RELATIVE);
  } catch {
    url = null;
  }
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return tokens(decoder(valeur));
  }
  const jetons = tokens(decoder(url.pathname));
  for (const [, valeurParametre] of url.searchParams) {
    jetons.push(...tokens(valeurParametre));
  }
  jetons.push(...tokens(decoder(url.hash)));
  return jetons;
}

/**
 * Premier motif de langage humain apparié à l'une des valeurs :
 *  - motif contenant une espace (multi-mots) → sous-chaîne normalisée ;
 *  - motif d'un seul mot d'au moins `seuilPrefixe` caractères → préfixe de
 *    token (« supprim » attrape « supprimer », « supprime ») ; le préfixe
 *    n'est jamais élargi : un motif ne couvre que les tokens qui le
 *    prolongent, à charge de la config de lister les autres graphies ;
 *  - motif d'un seul mot plus court → token exact (« post » n'attrape pas
 *    « Postuler », « paie » n'attrape pas « paiement »).
 */
export function motifTextePresent(valeurs: string[], motifs: string[], seuilPrefixe: number): string | undefined {
  const normalisees = valeurs.map(normaliser);
  const jetons = valeurs.map(tokens);
  return motifs.find((motif) => {
    const cible = normaliser(motif);
    if (cible === '') {
      return false;
    }
    if (cible.includes(' ')) {
      return normalisees.some((valeur) => valeur.includes(cible));
    }
    const parPrefixe = cible.length >= seuilPrefixe;
    return jetons.some((liste) => liste.some((jeton) => (parPrefixe ? jeton.startsWith(cible) : jeton === cible)));
  });
}

/**
 * Premier motif apparié par TOKEN EXACT à l'une des listes de tokens. Un motif
 * qui en compte plusieurs (aucun aujourd'hui en config) exige des tokens
 * consécutifs : jamais de correspondance en sous-chaîne, qui ferait d'un
 * `/blog/post/42` une action interdite.
 */
function premierMotifToken(listes: string[][], motifs: string[]): string | undefined {
  return motifs.find((motif) => {
    const cible = tokens(motif);
    if (cible.length === 0) {
      return false;
    }
    return listes.some((jetons) => jetons.some((_, debut) => cible.every((jeton, rang) => jetons[debut + rang] === jeton)));
  });
}

/** Canal `url` : chaque valeur est tokenisée comme une URL. */
export function motifUrlPresent(valeurs: string[], motifs: string[]): string | undefined {
  return premierMotifToken(valeurs.map(tokensUrl), motifs);
}

/** Canal `identifiant` : chaque valeur est tokenisée comme un identifiant technique. */
export function motifIdentifiantPresent(valeurs: string[], motifs: string[]): string | undefined {
  return premierMotifToken(valeurs.map(tokensIdentifiant), motifs);
}

/**
 * Cœur du filtre : confronte les valeurs lues aux deux listes de config,
 * canal par canal. Le premier motif trouvé décide et renseigne le verdict.
 */
export function apparier(valeurs: ValeursExaminees, actionsInterdites: ActionsInterdites): VerdictFiltre {
  const { motifsTexte, motifsUrl, appariement } = actionsInterdites;
  for (const [categorie, parLangue] of Object.entries(motifsTexte)) {
    for (const [langue, motifs] of Object.entries(parLangue)) {
      const motif = motifTextePresent(valeurs.texte, motifs, appariement.seuilPrefixe);
      if (motif !== undefined) {
        return { autorisee: false, canal: 'texte', categorie, langue, motif };
      }
    }
  }
  const motifUrl = motifUrlPresent(valeurs.url, motifsUrl);
  if (motifUrl !== undefined) {
    return { autorisee: false, canal: 'url', motif: motifUrl };
  }
  const motifIdentifiant = motifIdentifiantPresent(valeurs.identifiant, motifsUrl);
  if (motifIdentifiant !== undefined) {
    return { autorisee: false, canal: 'identifiant', motif: motifIdentifiant };
  }
  return { autorisee: true };
}

/** Attributs à lire en page : l'union des trois canaux, sans doublon. */
export function attributsLus(actionsInterdites: ActionsInterdites): string[] {
  return [
    ...new Set([
      ...actionsInterdites.attributsTexte,
      ...actionsInterdites.attributsUrl,
      ...actionsInterdites.attributsIdentifiants,
    ]),
  ];
}

/**
 * Bouton que le navigateur activerait pour une soumission implicite (touche
 * Entrée) : premier bouton soumetteur du formulaire en ordre d'arbre, y
 * compris un `input[type=image]` et son `formaction`. Défense en profondeur
 * quand l'extraction n'a retenu aucun déclencheur.
 */
function selecteurBoutonParDefaut(selecteurFormulaire: string): string {
  return ['button:not([type=button i]):not([type=reset i])', 'input[type=submit i]', 'input[type=image i]']
    .map((bouton) => `${selecteurFormulaire} ${bouton}`)
    .join(', ');
}

/** Un attribut est confronté à la liste de CHAQUE canal qui le revendique. */
function repartir(actionsInterdites: ActionsInterdites, lus: Record<string, string>, valeurs: ValeursExaminees): void {
  for (const [nom, valeur] of Object.entries(lus)) {
    if (actionsInterdites.attributsTexte.includes(nom)) {
      valeurs.texte.push(valeur);
    }
    if (actionsInterdites.attributsUrl.includes(nom)) {
      valeurs.url.push(valeur);
    }
    if (actionsInterdites.attributsIdentifiants.includes(nom)) {
      valeurs.identifiant.push(valeur);
    }
  }
}

/**
 * LE FILTRE S'APPLIQUE AUSSI AUX GESTES QUE LE CODE CHOISIT SEUL
 * (constitution §3, inscrite le 2026-09-30 à l'ouverture de P2-3). Un
 * élément que le moteur s'apprête à activer pour ÉCARTER un recouvrement
 * est lu et confronté aux mêmes listes qu'une action décidée par l'IA : un
 * geste n'échappe pas au filtre parce qu'aucun modèle ne l'a demandé.
 *
 * FERMÉ comme le reste : un élément qu'on ne peut pas lire n'est pas activé.
 */
export async function filtrerElement(
  page: Page,
  selecteur: string,
  actionsInterdites: ActionsInterdites,
): Promise<VerdictFiltre> {
  const valeurs: ValeursExaminees = { texte: [], url: [], identifiant: [] };
  try {
    const lu = await lireDeclencheur(
      page,
      selecteur,
      attributsLus(actionsInterdites),
      actionsInterdites.texteVisibleExamine,
      actionsInterdites.attributsDescendantsExamines,
    );
    if (lu === null) {
      return { autorisee: false, raison: RAISON_LECTURE_IMPOSSIBLE };
    }
    repartir(actionsInterdites, lu.attributs, valeurs);
    if (lu.texte !== null) {
      valeurs.texte.push(lu.texte);
    }
  } catch {
    return { autorisee: false, raison: RAISON_LECTURE_IMPOSSIBLE };
  }
  return apparier(valeurs, actionsInterdites);
}

/** Le filtre d'élément, lié à sa liste : ce que l'assemblage injecte dans l'explorateur. */
export function creerFiltreElement(actionsInterdites: ActionsInterdites): FiltreElement {
  return (page, selecteur) => filtrerElement(page, selecteur, actionsInterdites);
}

export function creerFiltre(actionsInterdites: ActionsInterdites): FiltreActions {
  const { attributsDescendantsExamines, texteVisibleExamine } = actionsInterdites;
  const attributs = attributsLus(actionsInterdites);

  return async (action, page) => {
    switch (action.type) {
      case 'naviguer':
        // L'URL demandée est la seule donnée de l'action : canal `url`.
        return apparier({ texte: [], url: [action.url], identifiant: [] }, actionsInterdites);
      case 'soumettre': {
        const valeurs: ValeursExaminees = { texte: [], url: [], identifiant: [] };
        try {
          const formulaire = await lireDeclencheur(page, action.formulaire.selecteur, attributs, false);
          if (formulaire !== null) {
            repartir(actionsInterdites, formulaire.attributs, valeurs);
          }
          // Sans déclencheur extrait, c'est le bouton par défaut du navigateur qui serait activé : on le lit.
          const selecteurDeclencheur =
            action.declencheur?.selecteur ?? selecteurBoutonParDefaut(action.formulaire.selecteur);
          const declencheur = await lireDeclencheur(
            page,
            selecteurDeclencheur,
            attributs,
            texteVisibleExamine,
            attributsDescendantsExamines,
          );
          if (declencheur !== null) {
            repartir(actionsInterdites, declencheur.attributs, valeurs);
            if (declencheur.texte !== null) {
              valeurs.texte.push(declencheur.texte);
            }
          }
        } catch {
          return { autorisee: false, raison: RAISON_LECTURE_IMPOSSIBLE };
        }
        return apparier(valeurs, actionsInterdites);
      }
      case 'remplir':
      case 'terminer':
        return { autorisee: true };
    }
  };
}
