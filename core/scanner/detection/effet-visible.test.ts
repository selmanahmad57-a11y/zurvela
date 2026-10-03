/**
 * L'effet visible d'un tiers en échec (cahier P2-2, contrat 1) — et la
 * branche tierce de `d-http` qui s'en sert, dans les DEUX sens : un tiers qui
 * casse la page est jugé, un tiers qui ne la casse pas est tu.
 */
import { describe, expect, it } from 'vitest';
import type { Signal } from '../../types.js';
import { DESCRIPTION_CONTENU_MIXTE, DESCRIPTION_TIERCE_EN_ECHEC, creerDetecteurHttp } from './d-http.js';
import { effetVisible, type SignalEchecReseau } from './effet-visible.js';
import { CONFIG_TEST, contexte, erreurJs, etatImage, MOBILE, reponse, requeteEchouee } from './fabriques-test.js';

const FENETRE = CONFIG_TEST.tiers.fenetreErreurJsMs;
const IMAGE_TIERCE = 'https://images.tiers.invalid/produit.jpg';
const SCRIPT_TIERS = 'https://widget.tiers.invalid/chat.js';
const CADRE_TIERS = 'https://video.tiers.invalid/embed/1';
const http = creerDetecteurHttp(CONFIG_TEST.http, CONFIG_TEST.tiers);

const echec = (surcharges: Partial<SignalEchecReseau>): SignalEchecReseau =>
  requeteEchouee({ interne: false, cadrePrincipal: false, erreur: 'net::ERR_FAILED', ...surcharges } as never) as SignalEchecReseau;

function cadre(surcharges: Partial<Extract<Signal, { type: 'etat-cadre' }>>): Signal {
  const base = etatImage({}) as Extract<Signal, { type: 'etat-image' }>;
  return { type: 'etat-cadre', horodatage: base.horodatage, page: base.page, viewport: base.viewport, observation: base.observation, ressource: CADRE_TIERS, element: { balise: 'iframe', selecteur: 'iframe', attributs: {} }, largeur: 560, hauteur: 315, ...surcharges };
}

describe('effetVisible — trois effets physiques, rien d’autre', () => {
  it('image : non rendue (complète, largeur naturelle nulle) → effet ; rendue → pas d’effet', () => {
    const e = echec({ urlRessource: IMAGE_TIERCE, typeRessource: 'image' });
    expect(effetVisible(e, [etatImage({ ressource: IMAGE_TIERCE, complete: true, largeurNaturelle: 0 })], FENETRE)).toBe(true);
    expect(effetVisible(e, [etatImage({ ressource: IMAGE_TIERCE, complete: true, largeurNaturelle: 320 })], FENETRE)).toBe(false);
    // Une autre vue (viewport) ne compte pas.
    expect(effetVisible(e, [etatImage({ ressource: IMAGE_TIERCE, complete: true, largeurNaturelle: 0, viewport: MOBILE.nom })], FENETRE)).toBe(false);
  });

  it('sous-cadre : échoué ET occupant une surface → effet ; caché (0 × 0) → pas d’effet', () => {
    const e = echec({ urlRessource: CADRE_TIERS, typeRessource: 'document' });
    expect(effetVisible(e, [cadre({})], FENETRE)).toBe(true);
    expect(effetVisible(e, [cadre({ largeur: 0, hauteur: 0 })], FENETRE)).toBe(false);
  });

  it('script : suivi d’une erreur JavaScript dans la fenêtre → effet ; hors fenêtre, ou sans erreur → pas d’effet', () => {
    const e = echec({ urlRessource: SCRIPT_TIERS, typeRessource: 'script' });
    const instant = Date.parse(e.horodatage);
    const erreurA = (ecartMs: number) => erreurJs({ horodatage: new Date(instant + ecartMs).toISOString(), message: 'peu importe : le message n’est jamais lu' });
    expect(effetVisible(e, [erreurA(FENETRE / 2)], FENETRE)).toBe(true);
    expect(effetVisible(e, [erreurA(FENETRE * 3)], FENETRE)).toBe(false);
    expect(effetVisible(e, [], FENETRE)).toBe(false);
  });

  it('police, feuille de style, requête de mesure : aucun effet mesurable — jamais jugées', () => {
    for (const typeRessource of ['font', 'stylesheet', 'xhr', 'fetch', 'ping']) {
      expect(effetVisible(echec({ typeRessource }), [erreurJs({}), etatImage({ largeurNaturelle: 0 })], FENETRE)).toBe(false);
    }
  });
});

describe('d-http — la branche tierce juge l’effet, dans les deux sens', () => {
  it('un tiers qui casse la page (image non rendue) est une candidate ORDINAIRE', () => {
    const signaux = [echec({ urlRessource: IMAGE_TIERCE, typeRessource: 'image' }), etatImage({ ressource: IMAGE_TIERCE, complete: true, largeurNaturelle: 0 })];
    const [candidate] = http.detecter(signaux, contexte());
    expect(candidate).toMatchObject({ description: DESCRIPTION_TIERCE_EN_ECHEC });
    expect(candidate?.sansEffetVisible).toBeUndefined();
  });

  it('un tiers qui ne casse rien (police servie autrement au robot) est MARQUÉ sans effet — compté, jamais publié', () => {
    const [candidate] = http.detecter([echec({ urlRessource: 'https://fonts.tiers.invalid/a.ttf', typeRessource: 'font' })], contexte());
    expect(candidate).toMatchObject({ description: DESCRIPTION_TIERCE_EN_ECHEC, sansEffetVisible: true });
  });

  it('un 5xx tiers sans effet (X01) est marqué lui aussi : aucune exception pour la panne franche (D2)', () => {
    const [candidate] = http.detecter([reponse({ urlRessource: SCRIPT_TIERS, typeRessource: 'script', statut: 503, interne: false })], contexte());
    expect(candidate?.sansEffetVisible).toBe(true);
  });
});

describe('d-http — le contenu mixte est un défaut du SITE, quel que soit l’hôte (P2-2, contrat 2)', () => {
  it('jQuery appelé en http depuis une page https : défaut de sécurité du site, jamais « tiers », jamais tu', () => {
    const signal = echec({ urlRessource: 'http://ajax.cdn.invalid/jquery.min.js', typeRessource: 'script', erreur: CONFIG_TEST.http.contenuMixte.erreurs[0] ?? '' });
    const [candidate] = http.detecter([signal], contexte());
    expect(candidate).toMatchObject({
      description: DESCRIPTION_CONTENU_MIXTE,
      categorie: CONFIG_TEST.http.contenuMixte.categorie,
      graviteEstimee: CONFIG_TEST.http.contenuMixte.gravite,
    });
    expect(candidate?.sansEffetVisible).toBeUndefined();
  });

  it('même hôte que le site : toujours du contenu mixte — c’est l’appel en clair qui fait la faute', () => {
    const [candidate] = http.detecter([echec({ interne: true, typeRessource: 'image', erreur: CONFIG_TEST.http.contenuMixte.erreurs[0] ?? '' })], contexte());
    expect(candidate?.description).toBe(DESCRIPTION_CONTENU_MIXTE);
  });

  it('le cadre principal n’a pas de page appelante : jamais du contenu mixte', () => {
    expect(http.detecter([echec({ cadrePrincipal: true, interne: false, erreur: CONFIG_TEST.http.contenuMixte.erreurs[0] ?? '' })], contexte()).some((c) => c.description === DESCRIPTION_CONTENU_MIXTE)).toBe(false);
  });

});
