/**
 * D-RECOUVREMENT : un élément interactif dont le point de clic est reçu par
 * un autre élément (constat géométrique ou clic refusé par le navigateur)
 * → `clic-intercepte`, sur le viewport concerné. Couvre M01.
 *
 * La catégorie est `mobile` si le viewport est déclaré mobile en config,
 * `fonctionnel` sinon.
 *
 * Paliers de confiance, par force du signal : la géométrie seule
 * (`elementFromPoint`) peut se tromper (élément déplacé entre la mesure et le
 * clic, point de clic mal choisi) ; le navigateur qui REFUSE le clic en plus
 * de la géométrie ferme la question. Les signaux d'un même élément, sur une
 * même page et un même viewport, sont donc regroupés AVANT de construire la
 * candidate : c'est elle qui porte la confiance du palier atteint, et non une
 * candidate par signal que le dédoublonnage devrait ensuite recalculer.
 */
import type { AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { cheminDePage, construireCandidate, trouverAction, trouverViewport } from './commun.js';

export const NOM_DETECTEUR_RECOUVREMENT = 'd-recouvrement';
export const DESCRIPTION_CLIC_INTERCEPTE = 'clic-intercepte';

type SignalInterception = Extract<Signal, { type: 'interception-clic' }>;

/** Clé d'un élément CIBLÉ : page, élément, viewport — le premier niveau, celui des preuves. */
function cleCible(signal: SignalInterception): string {
  return [cheminDePage(signal.page), signal.element.selecteur, signal.viewport].join('|');
}

/**
 * UNE CAUSE, UN CONSTAT (cahier P2-2, contrat 4 — C-16). Deux niveaux, et il
 * faut les deux :
 *  1. les preuves se réunissent par élément CIBLÉ — la géométrie connaît
 *     l'intercepteur, le clic refusé par le navigateur souvent pas ; séparer
 *     les deux ferait perdre à M01 son palier de confiance haut ;
 *  2. les éléments ciblés qui partagent un même intercepteur CONNU, sur la
 *     même page et le même viewport, sont UNE cause : un calque sur trois
 *     boutons est un défaut, pas trois (expandtesting : six sections pour
 *     une iframe publicitaire). L'intercepteur devient l'élément en cause.
 * Sans intercepteur connu, l'élément ciblé reste la seule identité.
 */
function cleCause(cibles: SignalInterception[]): string {
  const premier = cibles[0];
  if (premier === undefined) {
    return '';
  }
  const intercepteur = cibles.find((signal) => signal.intercepteur !== null)?.intercepteur ?? null;
  return intercepteur === null
    ? `cible|${cleCible(premier)}`
    : ['intercepteur', cheminDePage(premier.page), intercepteur.selecteur, premier.viewport].join('|');
}

export function creerDetecteurRecouvrement(config: ConfigScanner['detecteurs']['recouvrement']): Detecteur {
  return {
    nom: NOM_DETECTEUR_RECOUVREMENT,
    dependDuViewport: true,
    detecter(signaux, contexte) {
      // Niveau 1 : les preuves, par élément ciblé, dans l'ordre d'apparition.
      const parCible = new Map<string, SignalInterception[]>();
      for (const signal of signaux) {
        if (signal.type !== 'interception-clic') {
          continue;
        }
        const cle = cleCible(signal);
        parCible.set(cle, [...(parCible.get(cle) ?? []), signal]);
      }
      // Niveau 2 : les causes. Le palier de confiance se décide PAR CIBLE — la
      // géométrie et le clic doivent se confirmer sur le même élément —, et la
      // cause retient le palier le plus haut de ses cibles.
      const parCause = new Map<string, { signaux: SignalInterception[]; paliersHauts: boolean }>();
      for (const cibles of parCible.values()) {
        const cle = cleCause(cibles);
        const confirmee = cibles.some((signal) => signal.source === 'geometrie') && cibles.some((signal) => signal.source === 'clic');
        const cause = parCause.get(cle) ?? { signaux: [], paliersHauts: false };
        parCause.set(cle, { signaux: [...cause.signaux, ...cibles], paliersHauts: cause.paliersHauts || confirmee });
      }

      const candidates: AnomalieCandidate[] = [];
      for (const { signaux: groupe, paliersHauts: geometrieEtClic } of parCause.values()) {
        const premier = groupe[0];
        if (premier === undefined) {
          continue;
        }
        const viewport = trouverViewport(contexte.viewports, premier.viewport);
        const intercepteur = groupe.find((signal) => signal.intercepteur !== null)?.intercepteur ?? null;
        candidates.push(
          construireCandidate(
            {
              detecteur: NOM_DETECTEUR_RECOUVREMENT,
              description: DESCRIPTION_CLIC_INTERCEPTE,
              categorie: viewport.mobile ? 'mobile' : 'fonctionnel',
              gravite: config.gravite,
              confiance: geometrieEtClic ? config.confianceGeometrieEtClic : config.confianceGeometrie,
              page: premier.page,
              viewport: premier.viewport,
              dependDuViewport: true,
              action: trouverAction(contexte.parcours, premier.actionId),
              element: intercepteur ?? premier.element,
              preuves: groupe,
            },
            contexte,
          ),
        );
      }
      return candidates;
    },
  };
}
