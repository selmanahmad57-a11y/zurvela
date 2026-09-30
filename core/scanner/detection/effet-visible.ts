/**
 * L'EFFET VISIBLE d'une ressource tierce en échec (cahier P2-2, contrat 1).
 *
 * Le critère de jugement d'un tiers se déplace de « la requête a-t-elle
 * échoué ? » vers « la page rendue en est-elle affectée ? ». Le robot déclaré
 * ne voit pas le même web que le visiteur (APPRENTISSAGES n°19) : Google lui
 * sert une police héritée, une page 403, un script manquant. Un échec qui ne
 * se voit pas dans la page n'est pas un défaut que le visiteur subit.
 *
 * Trois effets, tous PHYSIQUES et universels — c'est le web, jamais le monde :
 *  - une image dont la source est la ressource échouée n'est pas rendue ;
 *  - un sous-cadre dont le document a échoué occupe une surface ;
 *  - un script échoué est suivi, sur la même page et le même viewport, d'une
 *    erreur JavaScript non interceptée dans la fenêtre configurée. Le message
 *    de l'erreur n'est PAS lu : ce serait un motif de langue naturelle.
 * Tout autre type de ressource (police, feuille de style, requête de mesure)
 * n'a pas d'effet mesurable ici : il n'est pas jugé.
 */
import type { Signal } from '../../types.js';

export type SignalEchecReseau = Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' }>;

/** Types de ressource du navigateur (standard technique) dont un effet visible se mesure. */
const RESSOURCE_IMAGE = 'image';
const RESSOURCE_DOCUMENT = 'document';
const RESSOURCE_SCRIPT = 'script';

export function effetVisible(echec: SignalEchecReseau, signaux: readonly Signal[], fenetreErreurJsMs: number): boolean {
  const memeVue = (signal: Signal): boolean => signal.page === echec.page && signal.viewport === echec.viewport;
  switch (echec.typeRessource) {
    case RESSOURCE_IMAGE:
      return signaux.some(
        (signal) =>
          signal.type === 'etat-image' && memeVue(signal) && signal.ressource === echec.urlRessource && signal.complete && signal.largeurNaturelle === 0,
      );
    case RESSOURCE_DOCUMENT:
      return signaux.some(
        (signal) => signal.type === 'etat-cadre' && memeVue(signal) && signal.ressource === echec.urlRessource && signal.largeur > 0 && signal.hauteur > 0,
      );
    case RESSOURCE_SCRIPT: {
      const instant = Date.parse(echec.horodatage);
      return signaux.some(
        (signal) => signal.type === 'erreur-js' && memeVue(signal) && Math.abs(Date.parse(signal.horodatage) - instant) <= fenetreErreurJsMs,
      );
    }
    default:
      return false;
  }
}
