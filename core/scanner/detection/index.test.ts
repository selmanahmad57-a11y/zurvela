import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../config.js';
import { creerDetecteurImage } from './d-image.js';
import { creerDetecteurLenteur } from './d-lenteur.js';
import { creerDetecteurRecouvrement } from './d-recouvrement.js';
import {
  CONFIG_TEST,
  contexte,
  DESKTOP,
  etatImage,
  interception,
  MOBILE,
  reponse,
  signauxSains,
  soumission,
  URL_CONTACT,
  URL_LOGO,
} from './fabriques-test.js';
import { cheminDePage, cleDedoublonnage, creerDetecteurs, dedoublonner, detecter } from './index.js';

const tousLesDetecteurs = creerDetecteurs(CONFIG_TEST);

describe('detecter (pipeline de détection)', () => {
  it('site sain sur deux viewports → aucune candidate, quel que soit le détecteur', () => {
    const signaux = [...signauxSains('a1', DESKTOP.nom), ...signauxSains('a2', MOBILE.nom)];
    const ctx = contexte([soumission('a1'), soumission('a2', { viewport: MOBILE.nom })]);
    expect(detecter(signaux, ctx, tousLesDetecteurs)).toEqual([]);
  });

  it('image cassée vue sur deux viewports → 1 candidate, preuves fusionnées', () => {
    const desktop = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: DESKTOP.nom });
    const mobile = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: MOBILE.nom });
    const candidates = detecter([desktop, mobile], contexte(), [creerDetecteurImage(CONFIG_TEST.image)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.reproduction.viewport).toEqual(DESKTOP);
    expect(candidates[0]?.preuves).toEqual([desktop, mobile]);
    expect(candidates[0]?.observations).toEqual([{ viewport: DESKTOP.nom }, { viewport: MOBILE.nom }]);
  });

  it('recouvrement vu sur deux viewports → 2 candidates (une par viewport)', () => {
    const signaux = [interception({ viewport: DESKTOP.nom }), interception({ viewport: MOBILE.nom })];
    const candidates = detecter(signaux, contexte(), [creerDetecteurRecouvrement(CONFIG_TEST.recouvrement)]);
    expect(candidates.map((candidate) => candidate.viewport)).toEqual([DESKTOP.nom, MOBILE.nom]);
  });

  it('géométrie + clic sur le même élément et le même viewport → 1 candidate, deux preuves, palier haut (M01)', () => {
    const geometrie = interception({ viewport: MOBILE.nom });
    const clic = interception({ viewport: MOBILE.nom, source: 'clic', intercepteur: null, actionId: 'a1' });
    const ctx = contexte([soumission('a1', { viewport: MOBILE.nom, resultat: 'bloquee' })]);
    const candidates = detecter([geometrie, clic], ctx, [creerDetecteurRecouvrement(CONFIG_TEST.recouvrement)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.preuves).toEqual([geometrie, clic]);
    // Le détecteur a regroupé les signaux AVANT de construire la candidate :
    // la confiance du palier haut ne dépend pas de la fusion.
    expect(candidates[0]?.confiance).toBe(CONFIG_TEST.recouvrement.confianceGeometrieEtClic);
    // Le premier signal du groupe fixe la reproduction (ici au chargement, sans action).
    expect(candidates[0]?.reproduction.action).toBeNull();
    expect(candidates[0]?.observations).toEqual([{ viewport: MOBILE.nom }]);
  });

  it('paliers fusionnés : la confiance retenue est la plus haute, quel que soit l’ordre des signaux', () => {
    // Symétrique de M01 pour un détecteur qui NE dépend PAS du viewport : ici
    // le regroupement amont est impossible (deux requêtes, deux actions), donc
    // c'est la fusion qui doit porter le palier haut.
    const { seuilMs, paliers } = CONFIG_TEST.lenteur;
    const confianceHaute = Math.max(...paliers.map((palier) => palier.confiance));
    const lentDesktop = reponse({ actionId: 'a1', viewport: DESKTOP.nom, dureeMs: seuilMs * 1.6 });
    const lentMobile = reponse({ actionId: 'a2', viewport: MOBILE.nom, dureeMs: seuilMs * 10 });
    const ctx = contexte([soumission('a1'), soumission('a2', { viewport: MOBILE.nom })]);
    const detecteurs = [creerDetecteurLenteur(CONFIG_TEST.lenteur, CONFIG_TEST.tiers)];

    // Les deux signaux portent bien des paliers différents avant fusion.
    expect(detecter([lentDesktop], ctx, detecteurs)[0]?.confiance).toBeLessThan(confianceHaute);
    expect(detecter([lentMobile], ctx, detecteurs)[0]?.confiance).toBe(confianceHaute);

    for (const ordre of [[lentDesktop, lentMobile], [lentMobile, lentDesktop]]) {
      const candidates = detecter(ordre, ctx, detecteurs);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.confiance).toBe(confianceHaute);
      expect(candidates[0]?.preuves).toHaveLength(2);
    }
  });

  it('une même ressource en 404 sur deux pages → 2 candidates (la page fait partie de la clé)', () => {
    const signaux = [
      reponse({ urlRessource: URL_LOGO, typeRessource: 'image', methode: 'GET', statut: 404, page: 'http://127.0.0.1:4800/' }),
      reponse({ urlRessource: URL_LOGO, typeRessource: 'image', methode: 'GET', statut: 404, page: URL_CONTACT }),
      reponse({ urlRessource: URL_LOGO, typeRessource: 'image', methode: 'GET', statut: 404, page: URL_CONTACT, viewport: MOBILE.nom }),
    ];
    const candidates = detecter(signaux, contexte(), tousLesDetecteurs);
    expect(candidates.map((candidate) => cheminDePage(candidate.urlOuEtape))).toEqual(['/', '/contact']);
    expect(candidates[1]?.preuves).toHaveLength(2);
  });

  it('le dédoublonnage ne modifie pas les candidates d’origine et ne duplique pas une preuve partagée', () => {
    const preuve = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0 });
    const [candidate] = creerDetecteurImage(CONFIG_TEST.image).detecter([preuve], contexte());
    if (candidate === undefined) {
      throw new Error('candidate attendue');
    }
    const resultat = dedoublonner([candidate, { ...candidate, preuves: [preuve] }], false);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]?.preuves).toEqual([preuve]);
    expect(candidate.preuves).toHaveLength(1);
    expect(resultat[0]).not.toBe(candidate);
  });

  it('clé de dédoublonnage : détecteur, catégorie, chemin de page, sélecteur, puis viewport si dépendant', () => {
    const [candidate] = creerDetecteurRecouvrement(CONFIG_TEST.recouvrement).detecter([interception({ viewport: MOBILE.nom })], contexte());
    if (candidate === undefined) {
      throw new Error('candidate attendue');
    }
    expect(cleDedoublonnage(candidate, false)).toBe(`d-recouvrement|mobile|/contact|${candidate.element?.selecteur ?? ''}`);
    expect(cleDedoublonnage(candidate, true)).toBe(`d-recouvrement|mobile|/contact|${candidate.element?.selecteur ?? ''}|mobile`);
  });

  it('observations : une candidate non fusionnée porte la liste de son seul viewport', () => {
    const signal = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: MOBILE.nom });
    const candidates = detecter([signal], contexte(), [creerDetecteurImage(CONFIG_TEST.image)]);
    expect(candidates[0]?.observations).toEqual([{ viewport: MOBILE.nom }]);
  });

  it('observations : un détecteur dépendant du viewport ne fusionne pas, chaque candidate garde le sien (asymétrie mobile)', () => {
    const signaux = [interception({ viewport: DESKTOP.nom }), interception({ viewport: MOBILE.nom })];
    const candidates = detecter(signaux, contexte(), [creerDetecteurRecouvrement(CONFIG_TEST.recouvrement)]);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.observations)).toEqual([[{ viewport: DESKTOP.nom }], [{ viewport: MOBILE.nom }]]);
    // Une anomalie vue en mobile seulement reste reconnaissable à ses observations.
    const mobileSeul = detecter([interception({ viewport: MOBILE.nom })], contexte(), [creerDetecteurRecouvrement(CONFIG_TEST.recouvrement)]);
    expect(mobileSeul.map((candidate) => candidate.observations)).toEqual([[{ viewport: MOBILE.nom }]]);
  });

  it('observations : ordre de première apparition, stable d’une exécution à l’autre, sans doublon', () => {
    const signaux = [
      etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: MOBILE.nom }),
      etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: DESKTOP.nom }),
      etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: MOBILE.nom }),
    ];
    const executer = (): unknown => detecter(signaux, contexte(), [creerDetecteurImage(CONFIG_TEST.image)])[0]?.observations;
    expect(executer()).toEqual([{ viewport: MOBILE.nom }, { viewport: DESKTOP.nom }]);
    expect(executer()).toEqual(executer());
  });

  it('observations : le dédoublonnage est idempotent et ne modifie pas les candidates d’origine', () => {
    const desktop = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: DESKTOP.nom });
    const mobile = etatImage({ largeurNaturelle: 0, hauteurNaturelle: 0, viewport: MOBILE.nom });
    const brutes = creerDetecteurImage(CONFIG_TEST.image).detecter([desktop, mobile], contexte());
    const attendues = [{ viewport: DESKTOP.nom }, { viewport: MOBILE.nom }];

    const premier = dedoublonner(brutes, false);
    expect(premier[0]?.observations).toEqual(attendues);
    expect(dedoublonner(premier, false)[0]?.observations).toEqual(attendues);
    expect(brutes.map((candidate) => candidate.observations)).toEqual([undefined, undefined]);
  });

  it('cheminDePage : chemin d’une URL absolue, valeur telle quelle sinon', () => {
    expect(cheminDePage('http://exemple.invalid/a/b?x=1#f')).toBe('/a/b');
    expect(cheminDePage('etape-3')).toBe('etape-3');
  });

  it('creerDetecteurs assemble les six détecteurs depuis la vraie config/scanner.json', async () => {
    const config = await chargerConfigScanner();
    const detecteurs = creerDetecteurs(config.detecteurs);
    expect(detecteurs.map((detecteur) => detecteur.nom)).toEqual([
      'd-http',
      'd-inerte',
      'd-echec-muet',
      'd-lenteur',
      'd-image',
      'd-recouvrement',
    ]);
    expect(detecteurs.filter((detecteur) => detecteur.dependDuViewport).map((detecteur) => detecteur.nom)).toEqual(['d-recouvrement']);
  });
});
