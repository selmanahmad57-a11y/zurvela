/**
 * Z01 beaucoup-de-groupes : chaque page du site appelle `ressourcesParPage`
 * images ABSENTES, toutes à des adresses DISTINCTES. Chaque adresse est une
 * cause racine à elle seule, donc un GROUPE à rejouer : huit pages à six
 * ressources font quarante-huit groupes, là où les gabarits ordinaires en
 * comptent deux ou trois.
 *
 * Et chaque page est RETARDÉE de `delaiPageMs` : un rejeu recharge la page
 * avant de re-mesurer, donc son coût n'est pas celui d'une requête mais
 * celui d'un chargement. C'est la conjonction — beaucoup de groupes ET des
 * rejeux coûteux — qui met le budget de confirmation sous tension.
 *
 * CE QU'IL REPRODUIT : la CAUSE de la lourdeur des sites du carnet
 * (automationexercise à 410 groupes, expandtesting à 101), pas sa surface.
 * Un gabarit « lourd » à trois groupes mesurerait la rapidité d'un petit
 * site (APPRENTISSAGES n°30).
 *
 * SON CONTRÔLE PROPRE, et il est inhabituel : sans optimisation, ce gabarit
 * doit SATURER — arrêt sur `reserve-confirmation`, des groupes jamais
 * rejoués. Un gabarit lourd qui finirait tranquillement ne mesurerait rien
 * de ce que P2-4 corrige, et passerait au vert en ne prouvant rien.
 */
import type { BugInjectable, ContexteBug } from '../../../types.js';
import { insererApresElement } from '../../../outils/transformations.js';
import { PAGES_RAYON, PAGE_ACCUEIL, PREFIXE_MANQUANTE } from '../structure.js';
import type { SelecteurBalise } from '../../../outils/transformations.js';

/** La vitrine de chaque page : c'est après elle que les images absentes s'insèrent. */
const SELECTEUR_VITRINE: SelecteurBalise = { balise: 'section', attribut: 'data-role', valeur: 'vitrine' };

function lireParametres(parametres: Record<string, unknown>): { ressourcesParPage: number; delaiPageMs: number } {
  const ressourcesParPage = parametres['ressourcesParPage'];
  const delaiPageMs = parametres['delaiPageMs'];
  if (typeof ressourcesParPage !== 'number' || !Number.isInteger(ressourcesParPage) || ressourcesParPage < 1) {
    throw new Error(`Z01 : ressourcesParPage doit être un entier ≥ 1 (reçu : ${String(ressourcesParPage)})`);
  }
  if (typeof delaiPageMs !== 'number' || !Number.isInteger(delaiPageMs) || delaiPageMs < 0) {
    throw new Error(`Z01 : delaiPageMs doit être un entier ≥ 0 (reçu : ${String(delaiPageMs)})`);
  }
  return { ressourcesParPage, delaiPageMs };
}

/** Une adresse absente par (page, rang) : c'est leur UNICITÉ qui fait autant de causes. */
function fragment(chemin: string, ressourcesParPage: number): string {
  const page = chemin.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'accueil';
  return Array.from(
    { length: ressourcesParPage },
    (_, i) => `<img data-role="absente-${i + 1}" src="${PREFIXE_MANQUANTE}-${page}-${i + 1}.svg" alt="" width="20" height="20">`,
  ).join('');
}

export const Z01: BugInjectable = {
  id: 'Z01',
  nom: 'beaucoup-de-groupes',
  categorie: 'visuel',
  gravite: 'mineur',
  // TOUTES les pages sont touchées, et le manifeste doit le dire : sinon
  // quarante-huit groupes écartés resteraient non appariés, et le banc
  // compterait comme « hors manifeste » ce que le gabarit produit exprès.
  pages: [PAGE_ACCUEIL, ...PAGES_RAYON],
  validerParametres(parametres) {
    lireParametres(parametres);
  },
  async retarderPage(_chemin: string, contexte: ContexteBug): Promise<void> {
    const { delaiPageMs } = lireParametres(contexte.parametres);
    if (delaiPageMs > 0) {
      await new Promise<void>((resoudre) => setTimeout(resoudre, delaiPageMs));
    }
  },
  transformerHtml(html, chemin, contexte) {
    const { ressourcesParPage } = lireParametres(contexte.parametres);
    return insererApresElement(html, SELECTEUR_VITRINE, fragment(chemin, ressourcesParPage));
  },
};
