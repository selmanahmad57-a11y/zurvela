/**
 * ORACLE DE JUGEMENT DU RECOUVREMENT — l'instrument qui tranche, pour le grand
 * tableau, « un `clic-intercepte` est-il un VRAI recouvrement ? » (dette n°31).
 *
 * Jusqu'au 2026-10-07 il vivait au scratchpad (`oracle-recouvrement.mjs` +
 * `oracle-noyau.mjs`), re-tapé d'un run à l'autre — donc deux grands tableaux
 * pouvaient être jugés par deux instruments légèrement différents, et n'étaient
 * PAS comparables (le « avant/après » de la Phase 2 est tout leur intérêt). Il
 * est désormais committé et testé : la LOGIQUE est extraite TELLE QUELLE
 * (aucune ré-écriture), et le témoin `oracle-recouvrement.test.ts` la re-prouve
 * 7/7 — c'est cette re-preuve qui garantit qu'elle n'a pas dérivé à l'extraction.
 *
 * MÉCANISME, NOMMÉ (le geste, pas le sentiment) :
 *   Au viewport V, SANS défilement artificiel vers le centre, on lit
 *   `document.elementFromPoint` AU CENTRE géométrique de la victime — le point
 *   de clic primaire, l'unité même de la revendication du détecteur
 *   (en-page.ts teste le centre). Le VERDICT est le centre :
 *     - « recouvert »  : le centre est reçu par un élément qui n'est ni la
 *       victime, ni un descendant, ni un ancêtre, ni un label lié, ET qui ne
 *       partage pas avec elle une région activable (a[href]/button/role).
 *     - « cliquable »  : sinon.
 *   On lit aussi quatre points vers les coins : OBSERVATION de couverture
 *   partielle, jamais verdict (l'oracle tranche au centre, le coin informe).
 *
 * DOCTRINE TRANCHÉE AVANT DE JUGER : le centre est l'unité. Une victime au
 * centre LIBRE est « cliquable » même si un coin est masqué — parce que c'est
 * exactement ce que le détecteur revendique, et parce que le visiteur vise le
 * centre d'un lien. La couverture d'un coin est reportée comme OBSERVATION pour
 * le jugement humain, pas convertie en alarme par l'instrument.
 *
 * INDÉPENDANCE : l'oracle N'APPELLE PAS le moteur. Il ré-implémente la seule
 * vérité PHYSIQUE dont « le clic est-il bloqué » a besoin (centre, label,
 * région activable partagée), à partir de la sémantique HTML universelle. C'est
 * délibéré : un oracle qui appellerait le moteur ne pourrait pas le juger.
 *
 * LE BIAIS, ÉPROUVÉ (n°48) : la variante `biaise` reproduit l'ancien bug —
 * centrer la victime par `scrollIntoView({block:'center'})`, ce qui la DÉPLACE
 * hors d'une barre fixe et innocente à tort un vrai recouvrement. Elle n'existe
 * que pour les TÉMOINS DE DISCRIMINATION : un gabarit ne prouve que l'oracle
 * donne la bonne réponse POUR LA BONNE RAISON que si l'oracle biaisé, lui, s'y
 * trompe. Elle n'est jamais utilisée pour juger.
 */

/** Ce que l'oracle rend pour une victime donnée. */
export interface VerdictOracle {
  verdict: 'recouvert' | 'cliquable' | 'invisible' | 'hors-fenetre' | 'introuvable';
  recuAuCentre?: string | null;
  /** OBSERVATION, jamais verdict : nombre de coins (sur 4) reçus par un intercepteur. */
  coinsInterceptes?: number;
  defilement?: number;
}

/**
 * Le corps de l'oracle, en JavaScript évaluable EN PAGE (il s'exécute dans le
 * navigateur, pas dans Node). Deux jetons y sont remplacés par `scriptOracle` :
 * `BIAISE_FLAG` (le biais) et `"SEL_PLACEHOLDER"` (le sélecteur). Extrait tel
 * quel de l'instrument du scratchpad — toute modification passe par la re-preuve
 * 7/7 du témoin.
 */
const ORACLE = /* js */ `
(function (sel) {
  const victime = document.querySelector(sel);
  if (!victime) return { verdict: 'introuvable' };
  const activable = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'A' && el.hasAttribute('href')) return true;
    if (el.tagName === 'BUTTON') return true;
    const role = el.getAttribute && el.getAttribute('role');
    return role === 'link' || role === 'button';
  };
  const ancetreActivable = (el) => {
    let c = el;
    while (c && c !== document.body) { if (activable(c)) return c; c = c.parentElement; }
    return null;
  };
  const estVictime = (recu) =>
    recu !== null &&
    (recu === victime || victime.contains(recu) || recu.contains(victime) ||
     (recu instanceof HTMLLabelElement && recu.control === victime));
  const regionVictime = ancetreActivable(victime);
  const memeRegion = (recu) => regionVictime !== null && ancetreActivable(recu) === regionVictime;
  const nom = (el) => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) : 'null';

  const BIAISE = ${/* placeholder */ 'BIAISE_FLAG'};

  // POSITIONNEMENT — là où le visiteur voit la victime.
  let defilement = 0;
  const r0 = victime.getBoundingClientRect();
  if (r0.width === 0 || r0.height === 0) return { verdict: 'invisible' };
  const cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
  const horsFenetre0 = cx0 < 0 || cy0 < 0 || cx0 > innerWidth || cy0 > innerHeight;
  if (BIAISE) {
    // L'ANCIEN BUG (n°48) : centrer la victime. Centrer la DÉPLACE hors d'une
    // barre fixe (haut ou bas), donc innocente à tort un vrai recouvrement.
    victime.scrollIntoView({ block: 'center', inline: 'center' });
    defilement = scrollY;
  } else if (horsFenetre0) {
    // DÉFILEMENT NATUREL : amener le HAUT de la victime à une faible marge
    // sous le haut de la fenêtre — la position d'un visiteur qui vient d'y
    // arriver (ancre, défilement vers le bas). JAMAIS le centre : un élément
    // position:fixed reste à ses coordonnées de fenêtre sous ce défilement,
    // donc s'il couvre la victime, il la couvre encore. Borné à la plage
    // défilable (une victime au bas de page reste au bas, sous un pied fixe).
    const marge = innerHeight * 0.08;
    const racine = document.scrollingElement || document.documentElement;
    const max = Math.max(0, racine.scrollHeight - innerHeight);
    defilement = Math.max(0, Math.min(scrollY + r0.top - marge, max));
    window.scrollTo(0, defilement);
  }
  const r = victime.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return { verdict: 'invisible' };

  const lire = (fx, fy) => {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { horsFenetre: true };
    const recu = document.elementFromPoint(x, y);
    return {
      horsFenetre: false,
      intercepte: !estVictime(recu) && !memeRegion(recu),
      recu: nom(recu),
    };
  };
  const centre = lire(0.5, 0.5);
  const coins = [lire(0.15, 0.15), lire(0.85, 0.15), lire(0.15, 0.85), lire(0.85, 0.85)];
  const verdict = centre.horsFenetre ? 'hors-fenetre' : (centre.intercepte ? 'recouvert' : 'cliquable');
  const coinsInterceptes = coins.filter((c) => !c.horsFenetre && c.intercepte).length;
  return { verdict, recuAuCentre: centre.recu, coinsInterceptes, defilement: Math.round(defilement) };
})(${JSON.stringify('SEL_PLACEHOLDER')})
`;

/**
 * Le script évaluable en page pour une victime (`sel`). `biaise` n'est vrai que
 * pour les témoins de discrimination (voir le biais n°48 ci-dessus) — jamais
 * pour juger un vrai recouvrement.
 */
export function scriptOracle(sel: string, biaise: boolean): string {
  return ORACLE.replace('BIAISE_FLAG', biaise ? 'true' : 'false').replace('"SEL_PLACEHOLDER"', JSON.stringify(sel));
}
