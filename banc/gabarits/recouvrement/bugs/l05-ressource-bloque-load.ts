/**
 * L05 ressource-bloque-load : l'accueil référence une image qui BLOQUE le
 * `load` — le serveur la retient (`retarderRessource`) au-delà du délai de
 * chargement de page. L'événement `load` n'arrive donc jamais dans les temps,
 * mais le DOM, lui, est parsé et complet.
 *
 * Témoin du cahier de navigation (`waitUntil`). Sous `waitUntil: 'load'`, le
 * `goto` de l'accueil EXPIRE (l'image pend) → la page est perdue, rien n'y est
 * observé, et le recouvrement de Q06 (sur la MÊME page) n'est jamais détecté :
 * le scan est pris en otage par une ressource non essentielle. Sous
 * `'domcontentloaded'`, le `goto` rend la main au DOM prêt → l'accueil est
 * exploré, Q06 détecté, et l'image qui pend devient une `requete-en-attente`
 * bornée par la fenêtre d'effet (jugée par P2-7).
 *
 * Le retard est un VRAI retard du serveur (`attendre`), jamais injecté (garde
 * C1). L'image n'a pas besoin d'exister : sous `'load'` le `goto` expire avant
 * que le fichier soit résolu.
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { insererAvantFermeture } from '../../../outils/transformations.js';
import { PAGE_ACCUEIL, PREFIXE_STATIQUE } from '../structure.js';

/** Chemin de l'image qui bloque le `load`. */
export const CHEMIN_RESSOURCE_BLOQUANTE = `${PREFIXE_STATIQUE}/bloqueur.png`;

function lireDelai(parametres: Record<string, unknown>): number {
  const delai = parametres['delaiMs'];
  if (typeof delai !== 'number' || !Number.isFinite(delai) || delai < 0) {
    throw new Error(`L05 : delaiMs doit être un nombre fini ≥ 0 (reçu : ${String(delai)})`);
  }
  return delai;
}

const fragment = `<img data-role="bloqueur" src="${CHEMIN_RESSOURCE_BLOQUANTE}" width="1" height="1" alt="">`;

export const L05: BugInjectable = {
  id: 'L05',
  nom: 'ressource-bloque-load',
  categorie: 'performance',
  gravite: 'important',
  pages: [PAGE_ACCUEIL],
  // Il ne produit pas d'anomalie propre ; il met le scan en otage. Son effet se
  // mesure sur CE QU'UNE AUTRE cause (Q06) devient dé-couvrable ou non.
  seulementEnCombinaison: true,
  validerParametres(parametres) {
    lireDelai(parametres);
  },
  transformerHtml(html, chemin) {
    return chemin === PAGE_ACCUEIL ? insererAvantFermeture(html, 'body', fragment) : html;
  },
  async retarderRessource(chemin, contexte: ContexteBug) {
    if (chemin === CHEMIN_RESSOURCE_BLOQUANTE) {
      await contexte.attendre(lireDelai(contexte.parametres));
    }
  },
};
