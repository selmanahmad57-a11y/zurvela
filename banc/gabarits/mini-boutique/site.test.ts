/**
 * Le gabarit « mini-boutique » n'existe que pour UNE propriété : sous le
 * budget du scénario, un parcours en largeur épuise le budget AVANT
 * d'atteindre le formulaire critique.
 *
 * Cette propriété est structurelle, pas décorative — si elle cessait d'être
 * vraie (une page retirée du catalogue, un lien « Demander un devis » remonté sur
 * l'accueil), la politique déterministe atteindrait la cible, l'attendu
 * `{ deterministe: false }` deviendrait faux, et la mesure de discernement de
 * toute la brique s'éteindrait en silence. Les tests ci-dessous la vérifient
 * DANS LA PAGE RÉELLEMENT SERVIE, dans les deux langues, et non dans les
 * intentions du code.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerActionsInterdites, chargerConfigProfilage } from '../../../core/scanner/config.js';
import { apparier } from '../../../core/scanner/exploration/filtre-actions.js';
import { chargerConfig } from '../../config.js';
import { demarrerServeur } from '../../serveur.js';
import { POLITIQUE_DETERMINISTE, POLITIQUE_IA, type ConfigBanc, type Scenario, type ServeurScenario } from '../../types.js';
import { compterBalises } from '../../outils/transformations.js';
import { miniBoutique } from './index.js';
import {
  PAGE_CHARGE_MAINTENANCE,
  PAGES_CATALOGUE_SUITE,
  PAGES_PRODUIT,
  PAGE_ACCUEIL,
  PAGE_CATALOGUE,
  PAGE_DEVIS,
  PAGE_LIVRAISON,
  PAGE_PIEGE,
  SELECTEUR_BOUTON_DEVIS,
} from './structure.js';

const LANGUES = ['fr', 'en'];

/** Trace structurelle de F01 : un bouton `type="button"` (le sain n'en a aucun). */
const BOUTON_INERTE = { balise: 'button', attribut: 'type', valeur: 'button' };

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

/** Le budget déclaré pour ce gabarit : c'est lui qui rend vraies les atteintes attendues. */
function budget(): number {
  const pagesMax = config.scenarios.contraintes[miniBoutique.nom]?.pagesMax;
  expect(pagesMax).toBeDefined();
  return pagesMax ?? 0;
}

function scenario(bugsActifs: string[], langue: string): Scenario {
  const contraintes = config.scenarios.contraintes[miniBoutique.nom];
  return {
    id: `test--mini-boutique--${langue}`,
    gabarit: miniBoutique.nom,
    langue,
    bugsActifs,
    ...(contraintes === undefined ? {} : { contraintes: { ...contraintes } }),
  };
}

async function servir(bugsActifs: string[], langue: string): Promise<ServeurScenario> {
  const serveur = await demarrerServeur(scenario(bugsActifs, langue), miniBoutique, config);
  serveurs.push(serveur);
  return serveur;
}

async function page(serveur: ServeurScenario, chemin: string): Promise<string> {
  const reponse = await fetch(serveur.url + chemin);
  expect(reponse.status).toBe(200);
  return reponse.text();
}

/**
 * Liens INTERNES d'une page, dans l'ordre du document et dédoublonnés :
 * exactement l'ordre dans lequel l'exploration les enfile. Le moteur découvre
 * les liens dans l'ordre du DOM — c'est cet ordre-là que le budget tranche.
 */
function liensInternes(html: string): string[] {
  const trouves = [...html.matchAll(/href="(\/[^"#]*)"/g)].map((correspondance) => correspondance[1] ?? '');
  return [...new Set(trouves.filter((lien) => !lien.startsWith('/statique')))];
}

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.splice(0).map((serveur) => serveur.arreter()));
});

describe('mini-boutique — déclaration du gabarit', () => {
  it('déclare un profil de boutique pris dans le vocabulaire de config/profilage.json', async () => {
    const profilage = await chargerConfigProfilage();
    expect(miniBoutique.profilAttendu).toEqual({ typeSite: 'boutique', langue: null });
    expect(profilage.typesSite).toContain(miniBoutique.profilAttendu?.typeSite);
    expect(miniBoutique.profilAttendu?.typeSite).not.toBe(profilage.valeurEchappement);
  });

  it('déclare ses DEUX cibles, dans les deux sens, et chacune est une page réellement servie', () => {
    expect(miniBoutique.cibles).toEqual([
      { page: PAGE_DEVIS, atteinteAttendue: { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: true } },
      { page: PAGE_PIEGE, atteinteAttendue: { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: false } },
    ]);
    for (const cible of miniBoutique.cibles ?? []) {
      expect(Object.keys(miniBoutique.routesPages)).toContain(cible.page);
    }
  });

  it('un budget de pages lui est déclaré en config : sans lui, aucune atteinte attendue ne serait jugeable', () => {
    expect(budget()).toBeGreaterThan(0);
  });

  it('porte F01 sur le formulaire critique, S03 sur l’accueil et S04 sur une fiche produit', () => {
    expect(miniBoutique.bugs.map((bug) => bug.id)).toEqual(['F01', 'S03', 'S04']);
    expect(miniBoutique.bugs.find((bug) => bug.id === 'F01')?.pages).toEqual([PAGE_DEVIS]);
    expect(miniBoutique.bugs.find((bug) => bug.id === 'S03')?.pages).toEqual([PAGE_ACCUEIL]);
    expect(miniBoutique.bugs.find((bug) => bug.id === 'S04')?.pages).toEqual([PAGE_CHARGE_MAINTENANCE]);
  });

  /**
   * LE FORMULAIRE CRITIQUE N'EST PAS TRANSACTIONNEL, et c'est une garde de
   * sécurité, pas une préférence de fiction. Le filtre d'actions destructives
   * arrête toute soumission de paiement (constitution §3) : si la cible
   * portait un libellé de commande, la mesure de navigation de toute la
   * brique dépendrait de la langue dans laquelle la liste noire a un trou.
   * Ce test confronte le libellé RÉELLEMENT SERVI, dans les deux langues, au
   * filtre RÉEL — pas à une intention.
   */
  it.each(LANGUES)('en %s, le déclencheur du formulaire critique n’est arrêté par aucun motif du filtre', async (langue) => {
    const [actionsInterdites, serveur] = await Promise.all([chargerActionsInterdites(), servir([], langue)]);
    const html = await page(serveur, PAGE_DEVIS);
    const libelle = /<button[^>]*data-role="devis-envoyer"[^>]*>([^<]*)</.exec(html)?.[1] ?? '';
    expect(libelle).not.toBe('');
    expect(apparier({ texte: [libelle], url: [PAGE_DEVIS], identifiant: [] }, actionsInterdites)).toEqual({ autorisee: true });
  });
});

describe('mini-boutique — servi dans les deux langues', () => {
  it.each(LANGUES)('sert chaque page déclarée en %s, dans la bonne langue et sans emplacement i18n résiduel', async (langue) => {
    const serveur = await servir([], langue);
    for (const chemin of Object.keys(miniBoutique.routesPages)) {
      const html = await page(serveur, chemin);
      expect(html).toContain(`<html lang="${langue}">`);
      expect(html).not.toMatch(/\{\{/);
    }
  });

  it.each(LANGUES)('en %s, le formulaire critique porte les quatre champs et le bouton d’envoi', async (langue) => {
    const serveur = await servir([], langue);
    const devis = await page(serveur, PAGE_DEVIS);
    for (const champ of ['nom', 'email', 'adresse', 'article']) {
      expect(devis).toContain(`name="${champ}"`);
    }
    expect(compterBalises(devis, SELECTEUR_BOUTON_DEVIS)).toBe(1);
    expect(compterBalises(devis, BOUTON_INERTE)).toBe(0);
  });
});

/**
 * LE COEUR DU GABARIT. Ces trois tests décrivent, ensemble, la raison d'être
 * de mini-boutique : le catalogue occupe le budget, la cible est à profondeur
 * 2, et la page piège n'est liée par rien.
 */
describe('mini-boutique — la cible est HORS de portée d’un parcours en largeur', () => {
  it('l’accueil ne lie NI le formulaire critique NI la page piège : la cible est à profondeur 2', async () => {
    const serveur = await servir([], 'fr');
    const liens = liensInternes(await page(serveur, PAGE_ACCUEIL));
    expect(liens).not.toContain(PAGE_DEVIS);
    expect(liens).not.toContain(PAGE_PIEGE);
  });

  it('les premiers liens que l’accueil enfile épuisent le budget SANS atteindre une fiche produit', async () => {
    const serveur = await servir([], 'fr');
    const liens = liensInternes(await page(serveur, PAGE_ACCUEIL)).filter((lien) => lien !== PAGE_ACCUEIL);
    // Un parcours en largeur visite l'accueil, puis les `budget - 1` premiers
    // liens de sa file. Aucune fiche produit ne doit s'y trouver : sans fiche
    // produit visitée, le lien « Commander » n'entre jamais dans la file, et
    // la cible reste hors du parcours déterministe.
    const visitesApresAccueil = liens.slice(0, budget() - 1);
    expect(visitesApresAccueil.length).toBe(budget() - 1);
    for (const produit of PAGES_PRODUIT) {
      expect(visitesApresAccueil).not.toContain(produit);
    }
    // Et il RESTE des liens en attente : le budget est bien la contrainte qui
    // mord, pas la taille du site.
    expect(liens.length).toBeGreaterThan(budget() - 1);
  });

  it('chaque fiche produit lie le formulaire critique : la cible est atteignable, mais seulement en y allant', async () => {
    const serveur = await servir([], 'fr');
    for (const produit of PAGES_PRODUIT) {
      expect(liensInternes(await page(serveur, produit))).toContain(PAGE_DEVIS);
    }
  });

  it('le catalogue paginé et la page livraison occupent la file avant toute fiche produit', async () => {
    const serveur = await servir([], 'fr');
    const liens = liensInternes(await page(serveur, PAGE_ACCUEIL));
    // Seules les fiches RÉELLEMENT liées depuis l'accueil comptent : celles
    // qui ne le sont pas n'entrent dans la file qu'après une page de
    // catalogue, donc encore plus tard.
    const indicesProduits = PAGES_PRODUIT.map((produit) => liens.indexOf(produit)).filter((indice) => indice >= 0);
    expect(indicesProduits.length).toBeGreaterThan(0);
    const premierProduit = Math.min(...indicesProduits);
    for (const remplissage of [PAGE_CATALOGUE, PAGE_LIVRAISON, ...PAGES_CATALOGUE_SUITE]) {
      expect(liens.indexOf(remplissage)).toBeGreaterThanOrEqual(0);
      expect(liens.indexOf(remplissage)).toBeLessThan(premierProduit);
    }
  });

  it('aucune page du site sain ne lie la page piège : elle n’est atteignable que par la charge de S03', async () => {
    const serveur = await servir([], 'fr');
    for (const chemin of Object.keys(miniBoutique.routesPages)) {
      expect(liensInternes(await page(serveur, chemin))).not.toContain(PAGE_PIEGE);
    }
  });
});

describe('mini-boutique — F01 sur le formulaire critique', () => {
  it.each(LANGUES)('en %s, rend le bouton d’envoi du devis inerte, et lui seul', async (langue) => {
    const avecBug = await servir(['F01'], langue);
    expect(compterBalises(await page(avecBug, PAGE_DEVIS), BOUTON_INERTE)).toBe(1);
    // Les autres pages du site sont intactes : le bug est isolé et réversible.
    for (const chemin of Object.keys(miniBoutique.routesPages).filter((route) => route !== PAGE_DEVIS)) {
      expect(compterBalises(await page(avecBug, chemin), BOUTON_INERTE)).toBe(0);
    }
  });
});
