/**
 * Appariement rapport ↔ manifeste (cahier des charges §6.3).
 *
 * L'appariement est STRUCTUREL : une anomalie apparie un attendu si elle a
 * la même catégorie et si sa localisation normalisée est l'une des pages
 * déclarées par le bug. La description (prose IA) et la gravité ne servent
 * jamais de clé (règle maîtresse §2).
 */
import type { Anomalie, Rapport } from '../../core/types.js';
import type { Manifeste, ResultatAttendu } from '../types.js';

/** Motif structurel d'une URL absolue : schéma suivi de `//` (RFC 3986). */
const MOTIF_URL_ABSOLUE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Retire le `/` final d'un chemin, sauf pour la racine. */
function retirerSlashFinal(chemin: string): string {
  return chemin.length > 1 && chemin.endsWith('/') ? chemin.slice(0, -1) : chemin;
}

/**
 * Extrait le chemin décodé d'une URL absolue, ou null si la chaîne n'en est
 * pas une (le motif est plus large que ce que l'analyseur accepte, et le
 * chemin peut porter un encodage invalide).
 */
function cheminUrlAbsolue(texte: string): string | null {
  if (!MOTIF_URL_ABSOLUE.test(texte)) {
    return null;
  }
  try {
    return decodeURIComponent(new URL(texte).pathname);
  } catch {
    return null;
  }
}

/**
 * Ramène une localisation d'anomalie à une clé comparable aux pages d'un
 * manifeste : URL absolue → pathname décodé (les pages sont déclarées en
 * clair) ; chemin (`/…`) ou libellé d'étape → tel quel. Le `/` final est
 * retiré, sauf pour la racine.
 *
 * Fonction totale : `urlOuEtape` est de la prose du moteur (donnée non
 * fiable), une valeur mal formée est gardée telle quelle et sera traitée
 * comme un libellé d'étape (donc comptée en faux positif), jamais levée.
 */
export function normaliserLocalisation(urlOuEtape: string): string {
  return retirerSlashFinal(cheminUrlAbsolue(urlOuEtape) ?? urlOuEtape);
}

/**
 * Chaque anomalie s'apparie à AU PLUS un attendu (le premier qui correspond) ;
 * un attendu est détecté dès qu'une anomalie lui est appariée (les suivantes
 * sont des doublons, pas des faux positifs) ; toute anomalie non appariée est
 * un faux positif.
 */
export function apparier(rapport: Rapport, manifeste: Manifeste): { attendus: ResultatAttendu[]; fauxPositifs: Anomalie[] } {
  const appariees: Anomalie[][] = manifeste.attendus.map(() => []);
  const pagesNormalisees = manifeste.attendus.map((attendu) => new Set(attendu.pages.map(normaliserLocalisation)));
  const fauxPositifs: Anomalie[] = [];

  for (const anomalie of rapport.anomalies) {
    const localisation = normaliserLocalisation(anomalie.urlOuEtape);
    const indice = manifeste.attendus.findIndex(
      (attendu, i) => attendu.categorie === anomalie.categorie && pagesNormalisees[i]?.has(localisation),
    );
    if (indice === -1) {
      fauxPositifs.push(anomalie);
    } else {
      appariees[indice]?.push(anomalie);
    }
  }

  const attendus = manifeste.attendus.map((attendu, i): ResultatAttendu => {
    const anomaliesAppariees = appariees[i] ?? [];
    return { attendu, verdict: anomaliesAppariees.length > 0 ? 'detecte' : 'rate', anomaliesAppariees };
  });
  return { attendus, fauxPositifs };
}
