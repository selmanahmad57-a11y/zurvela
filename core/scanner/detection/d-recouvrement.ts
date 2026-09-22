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

/** Clé de regroupement : la même que le dédoublonnage (page, élément, viewport). */
function cleElement(signal: SignalInterception): string {
  return [cheminDePage(signal.page), signal.element.selecteur, signal.viewport].join('|');
}

export function creerDetecteurRecouvrement(config: ConfigScanner['detecteurs']['recouvrement']): Detecteur {
  return {
    nom: NOM_DETECTEUR_RECOUVREMENT,
    dependDuViewport: true,
    detecter(signaux, contexte) {
      // Groupes dans l'ordre de première apparition : le premier signal d'un
      // groupe fixe la page, l'élément et l'action de reproduction.
      const groupes = new Map<string, SignalInterception[]>();
      for (const signal of signaux) {
        if (signal.type !== 'interception-clic') {
          continue;
        }
        const cle = cleElement(signal);
        const groupe = groupes.get(cle) ?? [];
        groupe.push(signal);
        groupes.set(cle, groupe);
      }

      const candidates: AnomalieCandidate[] = [];
      for (const groupe of groupes.values()) {
        const premier = groupe[0];
        if (premier === undefined) {
          continue;
        }
        const viewport = trouverViewport(contexte.viewports, premier.viewport);
        const geometrieEtClic =
          groupe.some((signal) => signal.source === 'geometrie') && groupe.some((signal) => signal.source === 'clic');
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
              element: premier.element,
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
