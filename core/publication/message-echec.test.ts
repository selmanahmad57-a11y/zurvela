/**
 * TÉMOIN — message marchand : EXHAUSTIVITÉ + DISTINCTION.
 *
 * Présentation côté navigateur (archi B, β) : `cleMessageEchec` (dérivation de la
 * clé) est une source unique `.js` (deploiement/ui/), importée par le navigateur ET
 * par ce témoin — comme `reessai.js`. Le serveur n'énonce que des faits ; ce témoin
 * ne teste donc ni rendu serveur ni prose.
 *
 * Deux gardes complémentaires, et plus de `never` (la dérivation couvre toute
 * catégorie par construction — il n'y a plus de switch à trouer) :
 *  - EXHAUSTIVITÉ : chaque catégorie réelle a une entrée de locale NON VIDE — le
 *    vrai filet contre un message vide chez le marchand. Elle se joue entre le
 *    dictionnaire et les catégories, au runtime, sous le gate (tsc ne voit pas le
 *    JSON) ;
 *  - DISTINCTION : chaque catégorie → une clé DISTINCTE — garde que la dérivation
 *    lit bien son argument (une `cleMessageEchec` constante passerait l'exhaustivité,
 *    tout résolvant vers le même texte, mais afficherait le même message partout).
 */
import { describe, expect, it } from 'vitest';
import { chargerDictionnaire, chercher } from '../i18n.js';
import { CATEGORIES_ECHEC_MARCHAND } from './categorie-echec.js';
// SOURCE UNIQUE : le MÊME fichier que le navigateur importe pour dériver la clé.
import { cleMessageEchec } from '../../deploiement/ui/message-echec.js';

describe('message marchand — présentation côté navigateur', () => {
  it('EXHAUSTIVITÉ : chaque catégorie → une entrée de locale NON VIDE (aucun trou)', async () => {
    // Le texte marchand vit auprès de son RENDEUR (le navigateur) : deploiement/ui/locales/,
    // pas locales/ (serveur/banc). Partition par rendeur, zéro recouvrement — pas une copie.
    const dict = await chargerDictionnaire('deploiement/ui/locales', 'fr');
    for (const categorie of CATEGORIES_ECHEC_MARCHAND) {
      const texte = chercher(dict, cleMessageEchec(categorie)); // lève si la clé manque
      expect(texte.trim().length).toBeGreaterThan(0);
    }
  });

  it('DISTINCTION : chaque catégorie → une clé distincte (la dérivation lit son argument)', () => {
    const cles = CATEGORIES_ECHEC_MARCHAND.map(cleMessageEchec);
    expect(new Set(cles).size).toBe(CATEGORIES_ECHEC_MARCHAND.length);
  });
});
