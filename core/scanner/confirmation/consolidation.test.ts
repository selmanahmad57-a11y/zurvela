/**
 * Les cas de consolidation sont éprouvés sur les candidates des VRAIS
 * détecteurs : c'est la seule preuve que « V01 fait un groupe » tient pour
 * les signaux que le moteur produit réellement, et pas seulement pour des
 * candidates écrites à la main.
 */
import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate } from '../../types.js';
import { detecter } from '../detection/index.js';
import { DESCRIPTION_404_INTERNE, creerDetecteurHttp } from '../detection/d-http.js';
import { DESCRIPTION_IMAGE_CASSEE, creerDetecteurImage } from '../detection/d-image.js';
import { creerDetecteurInerte } from '../detection/d-inerte.js';
import { creerDetecteurRecouvrement } from '../detection/d-recouvrement.js';
import {
  INTERCEPTEUR,
  BOUTON,
  CONFIG_TEST,
  DESKTOP,
  FORMULAIRE,
  LOGO,
  MOBILE,
  URL_ACCUEIL,
  URL_CONTACT,
  URL_LOGO,
  contexte,
  etatImage,
  finAction,
  interception,
  reponse,
  soumission,
} from '../detection/fabriques-test.js';
import { candidateSimulee } from './fabriques-test.js';
import { consolider, identiteCause, identiteHorsViewport } from './consolidation.js';

const detecteurHttp = creerDetecteurHttp(CONFIG_TEST.http, CONFIG_TEST.tiers);
const detecteurImage = creerDetecteurImage(CONFIG_TEST.image);
const detecteurInerte = creerDetecteurInerte(CONFIG_TEST.inerte);
const detecteurRecouvrement = creerDetecteurRecouvrement(CONFIG_TEST.recouvrement);

/** Signaux du logo introuvable (V01) sur une page et un viewport. */
function signauxLogoCasse(page: string, viewport: string) {
  return [
    reponse({ page, viewport, urlRessource: URL_LOGO, methode: 'GET', statut: 404, typeRessource: 'image' }),
    etatImage({ page, viewport, complete: true, largeurNaturelle: 0, hauteurNaturelle: 0 }),
  ];
}

describe('identiteCause', () => {
  it('fait du signal réseau une cause INDÉPENDANTE du détecteur (méthode + chemin de la ressource)', () => {
    const http = candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx' });
    const muet = candidateSimulee({ detecteur: 'd-echec-muet', description: 'echec-muet', element: BOUTON });
    expect(identiteCause(http)).toBe('reseau:POST:/api/contact');
    expect(identiteCause(muet)).toBe(identiteCause(http));
  });

  it('distingue deux ressources et deux méthodes, et ignore la requête (le chemin seul identifie la ressource)', () => {
    const avecRequete = candidateSimulee({ preuves: [reponse({ statut: 500, urlRessource: `${URL_CONTACT}?page=2` })] });
    const autre = candidateSimulee({ preuves: [reponse({ statut: 500, urlRessource: URL_CONTACT })] });
    const enGet = candidateSimulee({ preuves: [reponse({ statut: 500, urlRessource: URL_CONTACT, methode: 'GET' })] });
    expect(identiteCause(avecRequete)).toBe('reseau:POST:/contact');
    expect(identiteCause(autre)).toBe(identiteCause(avecRequete));
    expect(identiteCause(enGet)).not.toBe(identiteCause(autre));
  });

  it('sans signal réseau : détecteur + élément — un bouton mort et un bouton recouvert sont deux causes', () => {
    const mort = candidateSimulee({ detecteur: 'd-inerte', element: BOUTON, preuves: [finAction()] });
    const recouvert = candidateSimulee({ detecteur: 'd-recouvrement', element: BOUTON, preuves: [finAction()] });
    expect(identiteCause(mort)).toBe(`d-inerte:element:${BOUTON.selecteur}`);
    expect(identiteCause(recouvert)).not.toBe(identiteCause(mort));
  });

  it('ajoute le viewport quand la candidate en dépend, et l’ôte pour la comparaison de contre-épreuve', () => {
    const surMobile = candidateSimulee({ detecteur: 'd-recouvrement', element: BOUTON, viewport: MOBILE.nom, preuves: [finAction()] });
    const surDesktop = candidateSimulee({ detecteur: 'd-recouvrement', element: BOUTON, viewport: DESKTOP.nom, preuves: [finAction()] });
    expect(identiteCause(surMobile)).toBe(`d-recouvrement:element:${BOUTON.selecteur}:mobile`);
    expect(identiteCause(surMobile)).not.toBe(identiteCause(surDesktop));
    expect(identiteHorsViewport(surMobile)).toBe(identiteHorsViewport(surDesktop));
  });

  it('sans élément ni signal réseau : détecteur + chemin de page', () => {
    const candidate = candidateSimulee({ detecteur: 'd-inerte', element: undefined, preuves: [finAction()] });
    expect(identiteCause(candidate)).toBe('d-inerte:page:/contact');
  });
});

describe('consolider', () => {
  it('V01 : le logo 404 vu par D-IMAGE et par D-HTTP, sur deux pages et deux viewports, fait UN groupe', () => {
    const signaux = [
      ...signauxLogoCasse(URL_ACCUEIL, DESKTOP.nom),
      ...signauxLogoCasse(URL_ACCUEIL, MOBILE.nom),
      ...signauxLogoCasse(URL_CONTACT, DESKTOP.nom),
      ...signauxLogoCasse(URL_CONTACT, MOBILE.nom),
    ];
    const candidates = detecter(signaux, contexte(), [detecteurHttp, detecteurImage]);
    // Quatre signalements après dédoublonnage : deux détecteurs × deux pages.
    expect(candidates).toHaveLength(4);

    const groupes = consolider(candidates);

    expect(groupes).toHaveLength(1);
    const [groupe] = groupes;
    expect(groupe?.cle).toBe('reseau:GET:/statique/images/logo.svg');
    expect(groupe?.membres).toHaveLength(4);
    // Les pages restent listées, les viewports aussi : rien de la localisation n'est perdu.
    expect(groupe?.localisations.map((lieu) => lieu.urlOuEtape)).toEqual([URL_ACCUEIL, URL_CONTACT, URL_ACCUEIL, URL_CONTACT]);
    expect(groupe?.observations).toEqual([{ viewport: DESKTOP.nom }, { viewport: MOBILE.nom }]);
    // Confiance MAXIMALE des membres : le double signal de D-IMAGE (0,95) l'emporte sur le 404 (0,85).
    expect(groupe?.confiance).toBe(CONFIG_TEST.image.confianceSignalDouble);
    // Représentant : aucun membre n'a d'action, le mieux fourni en preuves
    // gagne — D-IMAGE porte l'état de l'image EN PLUS des preuves réseau.
    expect(groupe?.representant.detecteur).toBe(detecteurImage.nom);
    const preuvesHttp = groupe?.membres.find((membre) => membre.detecteur === detecteurHttp.nom)?.preuves.length ?? 0;
    expect(groupe?.representant.preuves.length).toBeGreaterThan(preuvesHttp);
    expect(groupe?.representant.preuves.some((preuve) => preuve.type === 'etat-image')).toBe(true);
    // Le représentant n'efface pas le point de vue des autres : les deux
    // lectures du même défaut restent lisibles depuis le groupe.
    expect(groupe?.descriptions).toEqual([DESCRIPTION_404_INTERNE, DESCRIPTION_IMAGE_CASSEE]);
  });

  it('F01 + M01 : un bouton mort et un bouton masqué au mobile font DEUX groupes (causes distinctes)', () => {
    const action = soumission('a1', { viewport: DESKTOP.nom });
    const signaux = [
      finAction({
        actionId: 'a1',
        viewport: DESKTOP.nom,
        effets: { requetes: 0, requetesEnAttente: 0, navigation: false, mutations: 0, mutationsZone: 0, mutationsHorsBruit: 0, attenteMs: 500 },
      }),
      interception({ viewport: MOBILE.nom, element: BOUTON }),
    ];
    const candidates = detecter(signaux, contexte([action]), [detecteurInerte, detecteurRecouvrement]);

    const groupes = consolider(candidates);

    expect(groupes.map((groupe) => groupe.cle)).toEqual([
      `d-inerte:element:${BOUTON.selecteur}`,
      // Le recouvrement se nomme par son intercepteur (P2-2, contrat 4).
      `d-recouvrement:element:${INTERCEPTEUR.selecteur}:mobile`,
    ]);
    // L'asymétrie « mobile uniquement » survit à la consolidation.
    expect(groupes[1]?.observations).toEqual([{ viewport: MOBILE.nom }]);
    expect(groupes[0]?.observations).toEqual([{ viewport: DESKTOP.nom }]);
  });

  it('choisit pour représentant le membre qui porte une action déclenchante, même s’il a moins de preuves', () => {
    const sansAction = candidateSimulee({
      detecteur: 'd-http',
      description: 'ressource-interne-404',
      reproduction: { url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: DESKTOP, action: null, actionsPrealables: [] },
      preuves: [reponse({ statut: 500 }), reponse({ statut: 500 }), reponse({ statut: 500 })],
    });
    const avecAction = candidateSimulee({ detecteur: 'd-echec-muet', description: 'echec-muet' });

    const [groupe] = consolider([sansAction, avecAction]);

    expect(groupe?.membres).toHaveLength(2);
    expect(groupe?.representant).toBe(avecAction);
  });

  it('à égalité d’action et de preuves, garde le PREMIER entré : la consolidation est déterministe', () => {
    const premier = candidateSimulee({ detecteur: 'd-http' });
    const second = candidateSimulee({ detecteur: 'd-echec-muet' });
    expect(consolider([premier, second])[0]?.representant).toBe(premier);
    expect(consolider([second, premier])[0]?.representant).toBe(second);
  });

  it('conserve l’ordre d’apparition des groupes et ne perd aucune candidate', () => {
    const membres: AnomalieCandidate[] = [
      candidateSimulee({ detecteur: 'd-inerte', element: BOUTON, preuves: [finAction()] }),
      candidateSimulee({ preuves: [reponse({ statut: 500 })] }),
      candidateSimulee({ detecteur: 'd-inerte', element: FORMULAIRE, preuves: [finAction()] }),
    ];
    const groupes = consolider(membres);
    expect(groupes).toHaveLength(3);
    expect(groupes.flatMap((groupe) => groupe.membres)).toEqual(membres);
  });

  it('garde les descriptions DISTINCTES des membres, dans l’ordre de première apparition', () => {
    const groupes = consolider([
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx' }),
      candidateSimulee({ detecteur: 'd-echec-muet', description: 'echec-muet' }),
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx', urlOuEtape: `${URL_CONTACT}?b=1` }),
    ]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.membres).toHaveLength(3);
    expect(groupes[0]?.descriptions).toEqual(['reponse-5xx', 'echec-muet']);
  });

  it('sans candidate, aucun groupe', () => {
    expect(consolider([])).toEqual([]);
  });

  it('dédoublonne les localisations identiques mais garde les viewports de chaque membre', () => {
    const jumelle = (viewport: string): AnomalieCandidate =>
      candidateSimulee({ element: LOGO, viewport, observations: [{ viewport }] });
    const [groupe] = consolider([jumelle(DESKTOP.nom), jumelle(MOBILE.nom), jumelle(DESKTOP.nom)]);
    expect(groupe?.membres).toHaveLength(3);
    expect(groupe?.localisations).toHaveLength(2);
    expect(groupe?.observations).toEqual([{ viewport: DESKTOP.nom }, { viewport: MOBILE.nom }]);
  });
});
