/**
 * Q15 mur-sur-soumission : un mur couvrant (plein viewport, non écartable) qui
 * masque une SOUMISSION (`button[type=submit]`) et un lien. Sens grave du
 * point 4 (P2-11) : la gravité d'un mur ne se lit PAS sur ce qu'il masque
 * (sinon un mur devant un formulaire ressort « bloquant » — le piège du grand
 * tableau, 15 sections « bloquant »). Le marqueur « mur couvrant » court-
 * circuite la gravité-par-ce-qui-est-masqué → « important » fixe.
 *
 * Deux voiles de balises distinctes (`div`, `section`) → deux causes
 * aujourd'hui (dont une « bloquant » pour la soumission) ; attendu après le
 * fix : UNE cause « important ».
 */
import type { BugInjectable } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGE_PANIER, ROLE_CALQUE, SELECTEUR_COMMANDE } from '../structure.js';

export const ROLE_MUR_SOUMISSION = 'mur-soumission';

const FRAGMENT = `<div data-role="${ROLE_CALQUE}" class="mur-soumission-hote" style="position:relative">
  <button type="submit" data-role="${ROLE_MUR_SOUMISSION}" style="position:fixed;top:120px;left:40px;width:90px;height:28px;z-index:1">v</button>
  <a href="/statique/mur-soumission-lien" style="position:fixed;top:320px;left:40px;width:90px;height:24px;z-index:1">l</a>
  <div class="mur-soumission" style="position:fixed;inset:0;z-index:5;background:transparent">
    <div class="voile-e" style="position:absolute;top:0;left:0;right:0;height:220px"></div>
    <section class="voile-f" style="position:absolute;top:220px;left:0;right:0;bottom:0"></section>
  </div>
</div>`;

export const Q15: BugInjectable = {
  id: 'Q15',
  nom: 'mur-sur-soumission',
  categorie: 'fonctionnel',
  gravite: 'important',
  pages: [PAGE_PANIER],
  transformerHtml(html, chemin) {
    return chemin === PAGE_PANIER ? insererApresElement(html, SELECTEUR_COMMANDE, FRAGMENT) : html;
  },
};
