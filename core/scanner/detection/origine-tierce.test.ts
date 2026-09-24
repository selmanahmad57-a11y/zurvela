/**
 * L'ORIGINE, DANS LES TROIS DÉTECTEURS QUI L'IGNORAIENT.
 *
 * Doctrine, la même pour tous : **une défaillance tierce n'est jamais imputée
 * au site dans sa catégorie ni sa gravité d'origine**. Un widget de chat qui
 * rend 500 n'est pas une page bloquante, une régie lente n'est pas un site
 * lent, et un pixel de mesure en échec n'est pas une soumission muette.
 *
 * Pourquoi le banc ne pouvait pas le dire : il sert TOUT depuis une seule
 * origine. `signal.interne` y vaut `true` partout, donc la branche tierce
 * n'existait pour personne — c'est l'angle mort le plus coûteux de la Phase 1,
 * et il visait directement le différenciateur n°1 (docs/INVENTAIRE-PRODUCTION.md,
 * catégorie A, point 1).
 *
 * Chaque cas est écrit DEUX FOIS : la version tierce et sa jumelle interne.
 * Sans la seconde, on ne saurait pas si le détecteur distingue l'origine ou
 * s'il a simplement cessé de détecter.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG_TEST, contexte, horodatage, reponse, requeteEchouee, soumission } from './fabriques-test.js';
import { DESCRIPTION_5XX, DESCRIPTION_TIERCE_EN_ECHEC, NOM_DETECTEUR_HTTP, creerDetecteurHttp } from './d-http.js';
import { DESCRIPTION_LENTE, creerDetecteurLenteur } from './d-lenteur.js';
import { creerDetecteurEchecMuet } from './d-echec-muet.js';

const URL_TIERCE = 'https://widget-de-chat.invalid/bundle.js';
const http = creerDetecteurHttp(CONFIG_TEST.http, CONFIG_TEST.tiers);
const lenteur = creerDetecteurLenteur(CONFIG_TEST.lenteur, CONFIG_TEST.tiers);
const echecMuet = creerDetecteurEchecMuet(CONFIG_TEST.echecMuet);

describe('D-HTTP — un 5xx TIERS n’est pas un 5xx du site', () => {
  it('le 5xx d’une dépendance tierce devient une anomalie DISTINCTE, mineure', () => {
    const signaux = [reponse({ urlRessource: URL_TIERCE, statut: 503, interne: false, typeRessource: 'script' })];
    const candidates = http.detecter(signaux, contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      detecteur: NOM_DETECTEUR_HTTP,
      description: DESCRIPTION_TIERCE_EN_ECHEC,
      categorie: CONFIG_TEST.tiers.categorie,
      graviteEstimee: CONFIG_TEST.tiers.gravite,
      confiance: CONFIG_TEST.tiers.confiance,
    });
  });

  it('le MÊME 5xx en interne reste bloquant : la garde distingue l’origine, elle n’éteint pas le détecteur', () => {
    const signaux = [reponse({ statut: 503, typeRessource: 'fetch' })];
    const candidates = http.detecter(signaux, contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ description: DESCRIPTION_5XX, graviteEstimee: CONFIG_TEST.http.gravite5xx });
  });

  it('un 404 TIERS reste ignoré : une ressource tierce absente est le bruit de fond du web', () => {
    // Le 5xx est une dépendance CASSÉE ; le 404 tiers est une dépendance
    // ABSENTE — pixels de mesure, tests A/B retirés. La signaler noierait les
    // constats qui comptent.
    const signaux = [reponse({ urlRessource: URL_TIERCE, statut: 404, interne: false, typeRessource: 'image' })];
    expect(http.detecter(signaux, contexte())).toEqual([]);
  });

  it('une SOUS-RESSOURCE tierce injoignable est signalée ; un document externe en cadre principal ne l’est pas', () => {
    const sousRessource = requeteEchouee({ urlRessource: URL_TIERCE, interne: false, cadrePrincipal: false, typeRessource: 'script' });
    expect(http.detecter([sousRessource], contexte())[0]).toMatchObject({ description: DESCRIPTION_TIERCE_EN_ECHEC });

    // Un autre site n'est pas une dépendance du nôtre, et nous n'auditons pas
    // les autres sites.
    const autreSite = requeteEchouee({ urlRessource: 'https://exemple.invalid/page', typeRessource: 'document', interne: false, cadrePrincipal: true });
    expect(http.detecter([autreSite], contexte())).toEqual([]);
  });
});

describe('D-LENTEUR — une lenteur TIERCE n’est pas la lenteur du site', () => {
  const lente = (surcharges: Record<string, unknown>) =>
    reponse({ actionId: 'a1', dureeMs: CONFIG_TEST.lenteur.seuilMs * 2, ...surcharges });

  it('la requête tierce lente est signalée À PART, en mineur et hors performance', () => {
    const candidates = lenteur.detecter([lente({ urlRessource: URL_TIERCE, interne: false })], contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      description: DESCRIPTION_TIERCE_EN_ECHEC,
      categorie: CONFIG_TEST.tiers.categorie,
      graviteEstimee: CONFIG_TEST.tiers.gravite,
    });
    // Le propriétaire ne peut pas accélérer le serveur d'un tiers ; lui
    // présenter cela comme une performance de SON site l'enverrait corriger ce
    // qu'il ne contrôle pas.
    expect(candidates[0]?.categorie).not.toBe('performance');
  });

  it('la MÊME lenteur en interne reste une performance importante', () => {
    const candidates = lenteur.detecter([lente({})], contexte());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      description: DESCRIPTION_LENTE,
      categorie: 'performance',
      graviteEstimee: CONFIG_TEST.lenteur.gravite,
    });
  });
});

describe('D-ÉCHEC-MUET — un tiers en échec ne rend pas une soumission muette', () => {
  const parcours = contexte([soumission('a1')]);

  it('une soumission dont seul un appel TIERS échoue n’est pas un échec muet', () => {
    // Le formulaire a pu parfaitement aboutir ; c'est l'antispam externe ou le
    // pixel de mesure qui est tombé. Et la panne tierce est déjà signalée par
    // D-HTTP : la reporter ici la compterait deux fois pour une seule cause.
    const signaux = [reponse({ actionId: 'a1', urlRessource: URL_TIERCE, statut: 500, interne: false, horodatage: horodatage(100) })];
    expect(echecMuet.detecter(signaux, parcours)).toEqual([]);
  });

  it('le MÊME échec en interne reste un échec muet bloquant', () => {
    const signaux = [reponse({ actionId: 'a1', statut: 500, horodatage: horodatage(100) })];
    expect(echecMuet.detecter(signaux, parcours)).toHaveLength(1);
  });
});
