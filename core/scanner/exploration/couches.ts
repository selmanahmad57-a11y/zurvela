/**
 * Les TROIS COUCHES de sécurité de la décision de navigation, et le
 * vocabulaire qui permet au journal de dire LAQUELLE a arrêté quoi
 * (constitution §3, cahier 4b §1).
 *
 * Dans cet ordre, et jamais dans un autre :
 *  1. `enumeration` — le moteur énumère les actes possibles et leur attribue
 *     un identifiant opaque ; une politique (l'IA comme une autre) ne peut
 *     faire exécuter QUE l'un d'eux. Ce n'est pas une convention de prompt :
 *     l'action réellement exécutée est celle que le moteur a énumérée, pas
 *     celle que la politique a rendue. Une action forgée n'a pas de chemin
 *     jusqu'à l'exécution ;
 *  2. `menu-ferme` — le vocabulaire fermé des types d'action (brique 2) :
 *     une proposition dont le type n'est pas au menu est retirée de
 *     l'énumération avant même d'être offerte au choix ;
 *  3. `filtre-destructif` — le filtre d'actions interdites, TOUJOURS après la
 *     décision, en code (`filtre-actions.ts`). Jamais avant, jamais à la
 *     place : une couche qui filtrerait l'énumération ferait disparaître du
 *     journal le fait qu'une action destructive a été ÉLUE.
 *
 * Ce module ne contient que des invariants : le menu des types et l'égalité
 * structurelle d'une action. Aucun réglage, donc rien en config.
 */
import type { Action, ActionProposee, TypeAction } from '../../types.js';

/** Identifiants techniques stables des trois couches (jamais de prose). */
export const COUCHE_ENUMERATION = 'enumeration';
export const COUCHE_MENU_FERME = 'menu-ferme';
export const COUCHE_FILTRE_DESTRUCTIF = 'filtre-destructif';

/** Type d'entrée de journal qui dit quelle couche a arrêté quoi. */
export const EVENEMENT_COUCHE = 'decision.couche';

/**
 * Le MENU FERMÉ des types d'action (constitution §3). INVARIANT en code : ce
 * n'est pas un réglage, c'est la borne que le produit ne doit jamais
 * franchir — une politique ne rédige jamais d'action libre.
 */
export const MENU_ACTIONS: readonly TypeAction[] = ['naviguer', 'remplir', 'soumettre', 'terminer'];

/**
 * Clé d'identité STRUCTURELLE d'une action : sérialisation stable, clés
 * triées, indépendante de l'ordre d'écriture des propriétés.
 *
 * Comparer par identité de référence serait plus strict mais faux : une
 * politique honnête reconstruit légitimement une action égale. Ce qui compte
 * n'est pas l'objet, c'est l'ACTE — et un acte structurellement identique à
 * un acte énuméré EST un acte énuméré.
 */
export function cleAction(action: Action): string {
  return JSON.stringify(action, (_cle, valeur: unknown) => {
    if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
      return valeur;
    }
    const trie: Record<string, unknown> = {};
    for (const nom of Object.keys(valeur as Record<string, unknown>).sort()) {
      trie[nom] = (valeur as Record<string, unknown>)[nom];
    }
    return trie;
  });
}

/** Une proposition écartée par le menu fermé, avec le type qu'elle portait. */
export interface PropositionEcartee {
  proposition: ActionProposee;
  type: string;
}

/**
 * COUCHE 2. Retire de l'énumération toute proposition dont le type n'est pas
 * au menu fermé. L'énumérateur du moteur n'en produit aucune : c'est
 * précisément pourquoi la garde existe ici et pas dans son code — une garde
 * qu'on ne peut pas faire échouer n'est pas une garde (METHODE §2).
 */
export function filtrerMenuFerme(actions: ActionProposee[]): { retenues: ActionProposee[]; ecartees: PropositionEcartee[] } {
  const retenues: ActionProposee[] = [];
  const ecartees: PropositionEcartee[] = [];
  for (const proposition of actions) {
    const type: string = proposition.action.type;
    if ((MENU_ACTIONS as readonly string[]).includes(type) && proposition.type === proposition.action.type) {
      retenues.push(proposition);
    } else {
      ecartees.push({ proposition, type });
    }
  }
  return { retenues, ecartees };
}

/**
 * COUCHE 1. La proposition énumérée qui correspond à l'action rendue par une
 * politique, ou `undefined` si l'action n'était PAS au menu.
 *
 * L'appelant doit exécuter `proposee.action` — l'objet du moteur —, jamais
 * celui que la politique lui a rendu : c'est ce qui rend l'énumération une
 * couche de sécurité et non un contrat de bonne foi.
 */
export function actionEnumeree(action: Action, enumerees: readonly ActionProposee[]): ActionProposee | undefined {
  const cle = cleAction(action);
  return enumerees.find((proposee) => cleAction(proposee.action) === cle);
}
