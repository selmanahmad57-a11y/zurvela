/**
 * Q21 champ-invisible-taille-reelle : un champ INVISIBLE (opacity 0) mais de
 * TAILLE RÉELLE (dimension min 11, comme le plus petit vrai positif du grand
 * tableau — le lien de tag de quotes) recouvert. SENS GRAVE (cahier P2-11 C) :
 * un champ rendu invisible par ERREUR est un vrai défaut d'invisibilité que le
 * recouvrement n'excuse pas ; et il sert de garde au SEUIL (dimension min ≤ 4
 * le publie ; un seuil élargi à ≥ 12 l'écarterait à tort). Attendu AVANT comme
 * APRÈS : PUBLIÉ (le fix exige invisible ET minuscule ; dimMin 11 > 4).
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, ROLE_CALQUE, SELECTEUR_PRODUITS } from '../structure.js';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="ci-inv-reel-hote" style="position:relative">
  <input type="text" name="ci-inv-reel" style="position:fixed;top:230px;left:40px;width:60px;height:11px;opacity:0;z-index:1;box-sizing:border-box;border:0;padding:0;margin:0">
  <div class="ci-inv-reel-cover" style="position:fixed;top:230px;left:40px;width:60px;height:20px;z-index:5;background:transparent"></div>
</div>`;

export const Q21: BugInjectable = {
  id: 'Q21',
  nom: 'champ-invisible-taille-reelle',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererApresElement(html, SELECTEUR_PRODUITS, FRAGMENT) : html;
  },
};
