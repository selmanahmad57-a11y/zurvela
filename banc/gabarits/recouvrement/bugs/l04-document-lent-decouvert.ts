/**
 * L04 document-lent-découvert : le DOCUMENT de l'accueil est lent, mais pas
 * pendant l'exploration — lors d'un REJEU. Il naît donc comme DÉCOUVERTE
 * (`constatee-au-rejeu`), jamais comme candidate de scan. Témoin du cahier
 * de la découverte graduée (une découverte de détecteur gradué ne doit pas se
 * publier sur une observation unique).
 *
 * Les deux faces (`aPartirDe` = premier rejeu ; `unique`) — rapide à
 * l'exploration dans les DEUX cas (pour naître en découverte, pas en candidate
 * de scan) :
 *  - `unique: true` → lent à la SEULE visite `aPartirDe` (le premier rejeu),
 *    rapide avant et après : le TRANSITOIRE (congestion ponctuelle, faux positif
 *    getlumavo). La re-mesure (visite ULTÉRIEURE) le retrouve rapide → écarté.
 *    « Lent une fois » : insensible au NOMBRE de rejeux que le fix ajoute, car
 *    ils sont tous postérieurs.
 *  - `unique: false` → lent à `aPartirDe` ET à toutes les visites suivantes : la
 *    lenteur PERSISTANTE (vrai positif). Découverte au rejeu, re-mesurée,
 *    toujours lente → reste publiée. Garde-fou contre le faux négatif. (Rapide
 *    avant `aPartirDe` : donc pas candidate de scan, c'est bien une découverte.)
 *
 * Le délai est un VRAI retard du serveur (`attendre`), jamais une valeur
 * injectée (garde C1, n°30/dette n°26).
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { PAGE_ACCUEIL } from '../structure.js';

const CLE_VISITES = 'l04.visitesAccueil';

function lireParametres(parametres: Record<string, unknown>): { delaiMs: number; aPartirDe: number; unique: boolean } {
  const delai = parametres['delaiMs'];
  const aPartirDe = parametres['aPartirDe'];
  const unique = parametres['unique'];
  if (typeof delai !== 'number' || !Number.isFinite(delai) || delai < 0) {
    throw new Error(`L04 : delaiMs doit être un nombre fini ≥ 0 (reçu : ${String(delai)})`);
  }
  if (typeof aPartirDe !== 'number' || !Number.isInteger(aPartirDe) || aPartirDe < 1) {
    throw new Error(`L04 : aPartirDe doit être un entier ≥ 1 (reçu : ${String(aPartirDe)})`);
  }
  if (typeof unique !== 'boolean') {
    throw new Error(`L04 : unique doit être un booléen (reçu : ${String(unique)})`);
  }
  return { delaiMs: delai, aPartirDe, unique };
}

export const L04: BugInjectable = {
  id: 'L04',
  nom: 'document-lent-decouvert',
  categorie: 'performance',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  // Il n'a d'attendu propre qu'en COMBINAISON avec une cause rejouée (un
  // recouvrement) : sans rejeu, la lenteur transitoire ne naît jamais.
  seulementEnCombinaison: true,
  validerParametres(parametres) {
    lireParametres(parametres);
  },
  noterVisite(chemin, contexte: ContexteBug) {
    if (chemin === PAGE_ACCUEIL) {
      contexte.etat[CLE_VISITES] = Number(contexte.etat[CLE_VISITES] ?? 0) + 1;
    }
  },
  async retarderPage(chemin, contexte) {
    if (chemin !== PAGE_ACCUEIL) {
      return;
    }
    const { delaiMs, aPartirDe, unique } = lireParametres(contexte.parametres);
    const visite = Number(contexte.etat[CLE_VISITES] ?? 0);
    const lent = unique ? visite === aPartirDe : visite >= aPartirDe;
    if (lent) {
      await contexte.attendre(delaiMs);
    }
  },
};
