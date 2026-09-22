import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHEMIN_API_FORMULAIRE, PAGE_ACCUEIL, PAGE_CONFIRMATION, PAGE_CONTACT } from '../../../banc/gabarits/formulaire-contact/structure.js';
import { chemins, preparerBanc, signauxDe, soumissions, type BancEssai } from './aide-tests-banc.js';
import { normaliserUrl } from './explorateur.js';

let banc: BancEssai;

beforeAll(async () => {
  banc = await preparerBanc();
});

afterAll(async () => {
  await banc?.fermer();
});

describe('normaliserUrl', () => {
  it('garde la même origine, retire fragment et slash final, exclut le reste', () => {
    const origine = 'http://site.invalid';
    expect(normaliserUrl('http://site.invalid/contact/#haut', origine)).toBe('http://site.invalid/contact');
    expect(normaliserUrl('http://site.invalid/', origine)).toBe('http://site.invalid/');
    expect(normaliserUrl('http://autre.invalid/x', origine)).toBeNull();
    expect(normaliserUrl('mailto:a@b.invalid', origine)).toBeNull();
    expect(normaliserUrl('javascript:void(0)', origine)).toBeNull();
    expect(normaliserUrl('tel:+33', origine)).toBeNull();
    expect(normaliserUrl('pas une url', origine)).toBeNull();
  });
});

describe('explorateur sur le banc', () => {
  it('site sain : visite les trois pages sur les deux viewports, remplit et soumet, observe 200 puis navigation', async () => {
    const resultat = await banc.explorer([]);
    expect(resultat.parcours.arret).toBe('complet');
    for (const viewport of banc.config.viewports.map((v) => v.nom)) {
      expect(chemins(resultat, viewport)).toEqual([PAGE_ACCUEIL, PAGE_CONTACT, PAGE_CONFIRMATION]);
      const remplir = resultat.parcours.actions.find((a) => a.viewport === viewport && a.action.type === 'remplir');
      expect(remplir?.resultat).toBe('ok');
      if (remplir?.action.type === 'remplir') {
        expect(remplir.action.valeurs.map((v) => v.valeur)).toContain('test@zurvela-scan.invalid');
        expect(remplir.action.valeurs).toHaveLength(3);
      }
      const [soumission] = soumissions(resultat, viewport);
      expect(soumission?.resultat).toBe('ok');
      expect(soumission?.action.type === 'soumettre' && soumission.action.declencheur?.attributs['type']).toBe('submit');
      const id = soumission?.id ?? '';
      const reponses = signauxDe(resultat, 'reponse-reseau', id).filter((s) => new URL(s.urlRessource).pathname === CHEMIN_API_FORMULAIRE);
      expect(reponses).toHaveLength(1);
      expect(reponses[0]?.statut).toBe(200);
      expect(reponses[0]?.methode).toBe('POST');
      expect(reponses[0]?.interne).toBe(true);
      const navigations = signauxDe(resultat, 'navigation', id);
      expect(navigations.map((n) => new URL(n.vers).pathname)).toEqual([PAGE_CONFIRMATION]);
      expect((navigations[0]?.horodatage ?? '') > (reponses[0]?.horodatage ?? '')).toBe(true);
      const [fin] = signauxDe(resultat, 'fin-action', id);
      expect(fin?.effets.navigation).toBe(true);
      expect(fin?.effets.requetes).toBeGreaterThan(0);
    }
    expect(signauxDe(resultat, 'interception-clic')).toEqual([]);
    expect(signauxDe(resultat, 'erreur-js')).toEqual([]);
    expect(signauxDe(resultat, 'requete-echouee')).toEqual([]);
    expect(signauxDe(resultat, 'reponse-reseau').every((s) => s.statut < 400)).toBe(true);
    const images = signauxDe(resultat, 'etat-image');
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((i) => i.complete && i.largeurNaturelle > 0)).toBe(true);
    // Chaque signal est horodaté en ISO avec millisecondes, comparable aux autres.
    expect(resultat.signaux.every((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.horodatage))).toBe(true);
    // Journal : viewports, pages, actions, fin.
    const types = new Set(resultat.journal.map((e) => e.type));
    expect([...types]).toEqual(expect.arrayContaining(['exploration.viewport', 'exploration.page', 'action', 'exploration.fin']));
  }, 30_000);

  it('F01 (bouton mort) : la soumission réussit mais n’a aucun effet observable', async () => {
    const resultat = await banc.explorer(['F01']);
    for (const viewport of banc.config.viewports.map((v) => v.nom)) {
      expect(chemins(resultat, viewport)).toEqual([PAGE_ACCUEIL, PAGE_CONTACT]);
      const [soumission] = soumissions(resultat, viewport);
      expect(soumission?.resultat).toBe('ok');
      expect(soumission?.action.type === 'soumettre' && soumission.action.declencheur?.attributs['type']).toBe('button');
      const [fin] = signauxDe(resultat, 'fin-action', soumission?.id);
      expect(fin?.effets).toMatchObject({ requetes: 0, requetesEnAttente: 0, navigation: false, mutations: 0, mutationsZone: 0 });
    }
  }, 30_000);
});

describe('robustesse', () => {
  it('une page qui ne répond pas est enregistrée (statut null) et l’exploration rend un parcours', async () => {
    // Port ÉPHÉMÈRE fermé juste avant l'exploration : un port de la plage fixe
    // du banc pourrait être repris entre-temps par un autre fichier de test.
    const serveur = createServer(() => undefined);
    await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
    const adresse = serveur.address();
    const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
    await new Promise<void>((resoudre, rejeter) => serveur.close((erreur) => (erreur ? rejeter(erreur) : resoudre())));
    const resultat = await banc.explorerUrl(`http://127.0.0.1:${port}`);
    expect(resultat.parcours.arret).toBe('complet');
    expect(resultat.parcours.pages.map((p) => p.statutHttp)).toEqual([null, null]);
    expect(resultat.journal.filter((e) => e.type === 'exploration.page.echec')).toHaveLength(2);
  }, 30_000);

  it('une échéance déjà atteinte arrête l’exploration avant toute navigation', async () => {
    const resultat = await banc.explorer([], undefined, Date.now());
    expect(resultat.parcours.arret).toBe('echeance');
    expect(resultat.parcours.pages).toEqual([]);
    expect(resultat.parcours.actions).toEqual([]);
  }, 30_000);
});
