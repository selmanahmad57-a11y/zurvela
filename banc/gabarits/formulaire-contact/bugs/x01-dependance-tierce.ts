/**
 * X01 dependance-tierce : la page de contact charge un script servi par une
 * AUTRE ORIGINE, et cette origine répond en erreur serveur.
 *
 * ── CE QU'IL ÉPROUVE : L'ANGLE MORT N°1 DE L'INVENTAIRE ─────────────────────
 *
 * Jusqu'à la brique 6a, `d-http` ne regardait pas l'origine d'une réponse 5xx.
 * Un widget de chat ou une régie publicitaire en panne devenait une anomalie
 * BLOQUANTE imputée au propriétaire du site. Le banc ne pouvait pas le dire :
 * il sert tout depuis une seule origine, donc `signal.interne` y valait `true`
 * partout et la branche tierce n'existait pour personne.
 *
 * Ce bug est la seconde origine du banc, et il est le premier à l'utiliser.
 *
 * ── REQUALIFIÉ PAR LE CAHIER P2-2 (contrat 1, décision D2) ──────────────────
 *
 * Le script tiers en panne n'est utilisé par RIEN dans la page : son échec n'a
 * aucun effet visible. Depuis P2-2, il n'est plus publié — un seul critère,
 * l'effet visible, sans exception pour la panne franche. X01 ne disparaît
 * pas pour autant : il CHANGE D'ATTENDU. Le moteur doit le VOIR (une
 * candidate existe, marquée sans effet) et S'EN TAIRE (écartée d'office au
 * verdict `sans-effet`). Un X01 qui disparaîtrait pour une mauvaise raison
 * — tiers jamais chargé, candidate jamais produite — serait un attendu RATÉ :
 * le banc vérifie le silence, pas l'absence. Le tiers à effet visible a son
 * propre bug, W02 (gabarit « tiers-au-robot »).
 *
 * ── CE QUI ÉTAIT ATTENDU AVANT P2-2 ─────────────────────────────────────────
 *
 * Une anomalie DISTINCTE — catégorie et gravité de `detecteurs.tiers`, jamais
 * celles d'un 5xx du site. Un chat mort n'est pas un site mort. Mais le
 * propriétaire mérite de le savoir : le taire ferait de nous un surveillant
 * qui regarde ailleurs pendant qu'un service qu'il paie tombe.
 *
 * Sa JUMELLE INTERNE est mesurée dans le même run, par les scénarios F02 : le
 * même symptôme, servi par l'origine du site, doit rester bloquant. C'est le
 * couple qui prouve que le détecteur DISTINGUE l'origine au lieu de s'être
 * éteint.
 *
 * ── POURQUOI UN SCRIPT, ET PAS UNE IMAGE ────────────────────────────────────
 *
 * Une image tierce en échec déclencherait AUSSI `d-image` (dimension nulle),
 * et le scénario mesurerait deux détecteurs au lieu d'un. Le script isole le
 * signal : une réponse serveur, et rien d'autre.
 */
import type { BugInjectable } from '../../../types.js';
import { insererAvantFermeture } from '../../../outils/transformations.js';
import { PAGE_CONTACT } from '../structure.js';

const pages = [PAGE_CONTACT];

/** Chemin demandé au serveur tiers. Ce qu'il sert importe peu : il répond en erreur, quoi qu'on demande. */
export const CHEMIN_WIDGET_TIERS = '/widget/chat.js';

export const X01: BugInjectable = {
  id: 'X01',
  nom: 'dependance-tierce',
  // Catégorie et gravité de `detecteurs.tiers` : c'est SOUS CETTE FORME que
  // l'anomalie doit être publiée, et le manifeste en dérive l'attendu. Les
  // changer en config sans les changer ici rend le banc rouge — c'est voulu :
  // ce que le client lit doit être ce que le banc mesure.
  categorie: 'fonctionnel',
  gravite: 'mineur',
  // Vu et tu : écarté d'office, jamais publié (P2-2, D2).
  verdictAttendu: 'sans-effet',
  pages,
  besoinOrigineTierce: true,
  transformerHtml(html, chemin, contexte) {
    if (!pages.includes(chemin)) {
      return html;
    }
    if (contexte.origineTierce === null) {
      throw new Error('X01 : aucune origine tierce fournie alors que le bug la déclare nécessaire');
    }
    return insererAvantFermeture(html, 'body', `<script src="${contexte.origineTierce}${CHEMIN_WIDGET_TIERS}"></script>`);
  },
};
