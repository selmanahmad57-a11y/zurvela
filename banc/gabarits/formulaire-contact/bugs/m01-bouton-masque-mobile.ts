/**
 * M01 bouton-masque-mobile : en viewport mobile uniquement, un élément
 * décoratif recouvre le bouton « envoyer » et intercepte les clics.
 *
 * Une étiquette promotionnelle (sans texte, aria-hidden) est ajoutée dans
 * la zone d'envoi, juste après le bouton. Sous `largeurMaxMobilePx`, elle
 * est positionnée en absolu sur toute la zone, au-dessus du bouton ; au-delà,
 * elle n'est pas affichée : le site reste sain sur un écran large.
 */
import type { BugInjectable } from '../../../types.js';
import {
  compterBalises,
  insererApresElement,
  insererAvantFermeture,
} from '../../../outils/transformations.js';
import { PAGE_CONTACT, SELECTEUR_BOUTON_ENVOYER, SELECTEUR_ZONE_ENVOI } from '../structure.js';

const pages = [PAGE_CONTACT];

/** Classe de l'élément de recouvrement injecté (repère pour les tests). */
export const CLASSE_RECOUVREMENT = 'etiquette-promo';

function lireLargeur(parametres: Record<string, unknown>): number {
  const largeur = parametres['largeurMaxMobilePx'];
  if (typeof largeur !== 'number' || !Number.isFinite(largeur) || largeur <= 0) {
    throw new Error(`M01 : le paramètre largeurMaxMobilePx doit être un nombre fini > 0 (reçu : ${String(largeur)})`);
  }
  return largeur;
}

/** Media query telle qu'injectée dans la page (repère pour les tests). */
export function mediaQueryMobile(largeurMaxMobilePx: number): string {
  return `(max-width: ${largeurMaxMobilePx}px)`;
}

function styleRecouvrement(largeurMaxMobilePx: number): string {
  const zone = `${SELECTEUR_ZONE_ENVOI.balise}[${SELECTEUR_ZONE_ENVOI.attribut}="${SELECTEUR_ZONE_ENVOI.valeur}"]`;
  return [
    '<style>',
    `.${CLASSE_RECOUVREMENT}{display:none}`,
    `@media ${mediaQueryMobile(largeurMaxMobilePx)}{`,
    `${zone}{position:relative}`,
    `.${CLASSE_RECOUVREMENT}{display:block;position:absolute;inset:0;z-index:10;border-radius:.5rem;`,
    'background:linear-gradient(135deg,#f6c343,#f28c28);box-shadow:0 2px 6px rgba(0,0,0,.2)}',
    '}',
    '</style>',
  ].join('');
}

export const M01: BugInjectable = {
  id: 'M01',
  nom: 'bouton-masque-mobile',
  categorie: 'mobile',
  gravite: 'bloquant',
  pages,
  validerParametres(parametres) {
    lireLargeur(parametres);
  },
  transformerHtml(html, chemin, contexte) {
    if (!pages.includes(chemin)) {
      return html;
    }
    const largeur = lireLargeur(contexte.parametres);
    if (compterBalises(html, SELECTEUR_ZONE_ENVOI) === 0) {
      throw new Error('M01 : zone d’envoi introuvable (data-role="zone-envoi")');
    }
    const etiquette = `<span class="${CLASSE_RECOUVREMENT}" aria-hidden="true"></span>`;
    const avecEtiquette = insererApresElement(html, SELECTEUR_BOUTON_ENVOYER, etiquette);
    return insererAvantFermeture(avecEtiquette, 'head', styleRecouvrement(largeur));
  },
};
