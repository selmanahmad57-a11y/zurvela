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
import type { AncetreCouvrant, AnomalieCandidate, Detecteur, Signal } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { cheminDePage, construireCandidate, trouverAction, trouverViewport } from './commun.js';
import { graviteRecouvrement, natureMasquee, naturePlusGrave } from './nature-masquee.js';

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
 *
 * TROISIÈME NIVEAU (cahier P2-3, contrat 4) : N intercepteurs de MÊME
 * CONSTRUCTION sont une cause. Le critère est la signature structurelle
 * calculée en page — balise, classes triées, chemin aux rangs de fratrie
 * effacés — et rien d'autre. Sans signature, on NE FOND PAS : l'asymétrie
 * est voulue, parce que les deux erreurs ne coûtent pas le même prix. Ne
 * pas fondre publie une section en double, du bruit ; fondre à tort réunit
 * deux défauts distincts sous un seul constat, et PERD un signal. Le
 * différenciateur n°1 se paie en bruit, jamais en silence.
 */
function cleCause(cibles: SignalInterception[]): string {
  const premier = cibles[0];
  if (premier === undefined) {
    return '';
  }
  const porteur = cibles.find((signal) => signal.intercepteur !== null);
  const intercepteur = porteur?.intercepteur ?? null;
  if (intercepteur === null) {
    return `cible|${cleCible(premier)}`;
  }
  const signature = porteur?.signatureIntercepteur ?? null;
  return signature === null
    ? ['intercepteur', cheminDePage(premier.page), intercepteur.selecteur, premier.viewport].join('|')
    : ['construction', cheminDePage(premier.page), signature, premier.viewport].join('|');
}

/**
 * L'ancêtre couvrant d'une victime, s'il dépasse le seuil (cahier P2-11) : le
 * plus couvrant parmi les signaux de la cible. Sous le seuil, ou absent → null
 * (la victime n'est pas membre d'un mur ; elle suit le traitement ordinaire).
 */
function ancetreCouvrantQualifiant(cibles: SignalInterception[], seuil: number): AncetreCouvrant | null {
  let meilleur: AncetreCouvrant | null = null;
  for (const signal of cibles) {
    const a = signal.ancetreCouvrant ?? null;
    if (a !== null && a.couverture >= seuil && (meilleur === null || a.couverture > meilleur.couverture)) {
      meilleur = a;
    }
  }
  return meilleur;
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
      // NIVEAU « MUR COUVRANT » (cahier P2-11). Une victime dont un signal
      // porte un ancêtre couvrant au-dessus du seuil est membre d'un mur. On
      // groupe par (signature de l'ancêtre couvrant, viewport) SANS la page :
      // un mur de même construction servi sur N pages est UN mur récurrent
      // (C2, absorbe le cas consentement de C-11). Le seuil de couverture
      // GARDE : un ancêtre NON couvrant (un pied, 0,075) ne fait pas mur — ses
      // victimes restent ordinaires. Deux murs de constructions distinctes =
      // deux causes (la signature les sépare).
      const seuil = config.murCouvrant.fractionViewport;
      const murs = new Map<string, { ancetre: AncetreCouvrant; cibles: SignalInterception[][] }>();
      const ordinaires: SignalInterception[][] = [];
      for (const cibles of parCible.values()) {
        const premier = cibles[0];
        const ancetre = ancetreCouvrantQualifiant(cibles, seuil);
        if (ancetre === null || premier === undefined) {
          ordinaires.push(cibles);
          continue;
        }
        const cle = ['mur', ancetre.signature ?? ancetre.element.selecteur, premier.viewport].join('|');
        const mur = murs.get(cle) ?? { ancetre, cibles: [] };
        mur.cibles.push(cibles);
        murs.set(cle, mur);
      }

      const candidates: AnomalieCandidate[] = [];

      // Un mur à AU MOINS `victimesMin` victimes distinctes → UNE cause honnête
      // (« un élément recouvre l'interface et masque N éléments interactifs »).
      // Gravité FIXE : le marqueur court-circuite la gravité-par-ce-qui-est-
      // masqué — un mur masque tout, on n'affirme pas « bloquant » d'un
      // consentement standard qu'un visiteur lève en un clic. Sous le seuil de
      // victimes, ce n'est pas un mur : retour au traitement ordinaire.
      for (const mur of murs.values()) {
        if (mur.cibles.length < config.murCouvrant.victimesMin) {
          ordinaires.push(...mur.cibles);
          continue;
        }
        const groupe = mur.cibles.flat();
        const premier = groupe[0];
        if (premier === undefined) {
          continue;
        }
        const viewport = trouverViewport(contexte.viewports, premier.viewport);
        const geometrieEtClic = groupe.some((signal) => signal.source === 'geometrie') && groupe.some((signal) => signal.source === 'clic');
        const candidate = construireCandidate(
          {
            detecteur: NOM_DETECTEUR_RECOUVREMENT,
            description: DESCRIPTION_CLIC_INTERCEPTE,
            categorie: viewport.mobile ? 'mobile' : 'fonctionnel',
            gravite: config.murCouvrant.gravite,
            confiance: geometrieEtClic ? config.confianceGeometrieEtClic : config.confianceGeometrie,
            page: premier.page,
            viewport: premier.viewport,
            dependDuViewport: true,
            action: trouverAction(contexte.parcours, premier.actionId),
            element: mur.ancetre.element,
            preuves: groupe,
          },
          contexte,
        );
        candidate.murCouvrant = true;
        candidates.push(candidate);
      }

      // Niveau 2/3 : les causes ORDINAIRES (hors mur), fusion C-16 inchangée.
      // Le palier de confiance se décide PAR CIBLE — géométrie et clic doivent
      // se confirmer sur le même élément —, et la cause retient le plus haut.
      const parCause = new Map<string, { signaux: SignalInterception[]; paliersHauts: boolean }>();
      for (const cibles of ordinaires) {
        const cle = cleCause(cibles);
        const confirmee = cibles.some((signal) => signal.source === 'geometrie') && cibles.some((signal) => signal.source === 'clic');
        const cause = parCause.get(cle) ?? { signaux: [], paliersHauts: false };
        parCause.set(cle, { signaux: [...cause.signaux, ...cibles], paliersHauts: cause.paliersHauts || confirmee });
      }
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
              // LA GRAVITÉ SE LIT SUR CE QUI EST MASQUÉ (P2-3, contrat 2) :
              // une cause vaut ce que vaut le pire de ce qu'elle couvre.
              gravite: graviteRecouvrement(naturePlusGrave(groupe.map((signal) => natureMasquee(signal.element))), config),
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
