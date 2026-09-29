/**
 * Les trois gabarits du cahier P2-1 — ce que la campagne 6b a cassé, en
 * miniature. Ces tests ne notent pas le moteur (le banc le fait) ; ils
 * garantissent que chaque gabarit SERT ce qu'il promet : les pages dans les
 * deux langues, le bug là où il est déclaré et nulle part ailleurs, et — pour
 * le site lent — un retard qui frappe la requête et jamais le démarrage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../config.js';
import { demarrerServeur } from '../serveur.js';
import type { ConfigBanc, Gabarit, Scenario, ServeurScenario } from '../types.js';
import { catalogueBoutons } from './catalogue-boutons/index.js';
import { PAGE_IMAGE_CASSEE, PAGES_SUITE } from './catalogue-boutons/structure.js';
import { formulairePuisNavigation } from './formulaire-puis-navigation/index.js';
import { PAGE_CATALOGUE, PAGE_INSCRIPTION } from './formulaire-puis-navigation/structure.js';
import { siteLent } from './site-lent/index.js';
import { PAGE_LENTE } from './site-lent/structure.js';
import { genererScenarios } from '../scenarios/generer.js';
import { deriverManifeste } from '../scenarios/manifeste.js';
import { calqueAuRejeu } from './calque-au-rejeu/index.js';
import { ROLE_CALQUE } from './calque-au-rejeu/bugs/d02-calque-au-rejeu.js';
import { PAGE_ACCUEIL as ACCUEIL_VITRINE, PAGES_OFFRE } from './calque-au-rejeu/structure.js';

const LANGUES = ['fr', 'en'] as const;
let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.map((serveur) => serveur.arreter()));
});

function scenario(gabarit: Gabarit, bugsActifs: string[], langue: string): Scenario {
  const contraintes = config.scenarios.contraintes[gabarit.nom];
  return { id: `test--${gabarit.nom}--${langue}`, gabarit: gabarit.nom, langue, bugsActifs, ...(contraintes === undefined ? {} : { contraintes: { ...contraintes } }) };
}

async function servir(gabarit: Gabarit, bugsActifs: string[], langue: string, attendre?: (delaiMs: number) => Promise<void>): Promise<ServeurScenario> {
  const serveur = await demarrerServeur(scenario(gabarit, bugsActifs, langue), gabarit, config, attendre === undefined ? {} : { attendre });
  serveurs.push(serveur);
  return serveur;
}

async function page(serveur: ServeurScenario, chemin: string): Promise<string> {
  const reponse = await fetch(serveur.url + chemin);
  expect(reponse.status).toBe(200);
  return reponse.text();
}

async function statut(serveur: ServeurScenario, chemin: string): Promise<number> {
  return (await fetch(serveur.url + chemin)).status;
}

describe.each([formulairePuisNavigation, catalogueBoutons, siteLent, calqueAuRejeu])('$nom — servi dans les deux langues', (gabarit) => {
  it.each(LANGUES)('sert chaque page déclarée en %s, dans la bonne langue et sans emplacement i18n résiduel', async (langue) => {
    const serveur = await servir(gabarit, [], langue);
    for (const chemin of Object.keys(gabarit.routesPages)) {
      const html = await page(serveur, chemin);
      expect(html).toContain(`<html lang="${langue}">`);
      expect(html).not.toMatch(/\{\{/);
    }
  });
});

describe('formulaire-puis-navigation — remplir, puis naviguer vers le défaut (C-09)', () => {
  it('l’inscription porte un formulaire remplissable ET un lien vers le catalogue : l’ordre « remplir puis naviguer » est imposé par le site', async () => {
    const serveur = await servir(formulairePuisNavigation, [], 'fr');
    const inscription = await page(serveur, PAGE_INSCRIPTION);
    expect(inscription).toContain('name="nom"');
    expect(inscription).toContain('name="email"');
    expect(inscription).toContain(`href="${PAGE_CATALOGUE}"`);
  });

  it('sain, l’image vedette du catalogue existe ; sous N01, elle pointe vers une ressource absente — et seule cette page change', async () => {
    const sain = await servir(formulairePuisNavigation, [], 'fr');
    expect(await statut(sain, '/statique/images/vedette.svg')).toBe(200);
    const casse = await servir(formulairePuisNavigation, ['N01'], 'fr');
    const chemin = config.bugs['N01']?.['cheminRessourceIntrouvable'];
    expect(typeof chemin).toBe('string');
    expect(await page(casse, PAGE_CATALOGUE)).toContain(`src="${String(chemin)}"`);
    expect(await statut(casse, String(chemin))).toBe(404);
    expect(await page(casse, PAGE_INSCRIPTION)).toBe(await page(sain, PAGE_INSCRIPTION));
  });
});

describe('catalogue-boutons — vingt formulaires sans champ par page (C-10)', () => {
  it('chaque page porte vingt formulaires réduits à un bouton, et pas un seul champ de saisie', async () => {
    const serveur = await servir(catalogueBoutons, [], 'fr');
    for (const chemin of ['/', ...PAGES_SUITE]) {
      const html = await page(serveur, chemin);
      expect(html.match(/<form /g)).toHaveLength(20);
      expect(html).not.toContain('<input');
    }
  });

  it('le gabarit s’explore sans soumission, comme la campagne : la contrainte est déclarée en config', () => {
    expect(config.scenarios.contraintes[catalogueBoutons.nom]?.soumission).toBe('aucune');
  });

  it('sous K01, seule la DERNIÈRE page porte l’image cassée : le défaut n’est vu que si l’exploration y arrive', async () => {
    const serveur = await servir(catalogueBoutons, ['K01'], 'en');
    const chemin = String(config.bugs['K01']?.['cheminRessourceIntrouvable']);
    expect(await page(serveur, PAGE_IMAGE_CASSEE)).toContain(`src="${chemin}"`);
    expect(await page(serveur, '/')).not.toContain(chemin);
    expect(await statut(serveur, chemin)).toBe(404);
  });
});

describe('site-lent — le retard frappe la requête, jamais le démarrage (C-06)', () => {
  it('sous L02, la première visite de la page lente attend le long délai, les autres pages le délai commun ; le démarrage du serveur n’attend rien', async () => {
    const attentes: number[] = [];
    const attendre = (delaiMs: number): Promise<void> => {
      attentes.push(delaiMs);
      return Promise.resolve();
    };
    const serveur = await servir(siteLent, ['L02'], 'fr', attendre);
    // Le contrôle qui peut échouer : un retard appliqué à la vérification des
    // pages au démarrage se verrait ici, avant la première requête.
    expect(attentes).toEqual([]);
    await page(serveur, PAGE_LENTE);
    await page(serveur, PAGE_LENTE);
    await page(serveur, '/p/2');
    await page(serveur, '/');
    const { delaiPageMs, delaiPremiereVisiteMs } = config.bugs['L02'] as { delaiPageMs: number; delaiPremiereVisiteMs: number };
    expect(attentes).toEqual([delaiPremiereVisiteMs, delaiPageMs, delaiPageMs, delaiPageMs]);
    expect(delaiPremiereVisiteMs).toBeGreaterThan(delaiPageMs);
  });

  it('sain, aucune attente : le site est instantané', async () => {
    const attentes: number[] = [];
    const serveur = await servir(siteLent, [], 'en', (delaiMs) => {
      attentes.push(delaiMs);
      return Promise.resolve();
    });
    await page(serveur, PAGE_LENTE);
    expect(attentes).toEqual([]);
  });
});

describe('calque-au-rejeu — un calque que seule la vérification voit (clôture de P2-1, dette n°20)', () => {
  const calque = `data-role="${ROLE_CALQUE}"`;

  it('sous D02, l’accueil est SANS calque pendant les visites de l’exploration, et AVEC au-delà — la vérification du démarrage ne compte pas', async () => {
    const serveur = await servir(calqueAuRejeu, ['D01', 'D02'], 'fr');
    const seuil = Number(config.bugs['D02']?.['visitesAvantCalque']);
    expect(Number.isInteger(seuil) && seuil > 0).toBe(true);
    // Le contrôle qui peut échouer : si le démarrage consommait une visite,
    // le calque paraîtrait une visite trop tôt — dès l'exploration.
    for (let visite = 1; visite <= seuil; visite += 1) {
      expect(await page(serveur, ACCUEIL_VITRINE)).not.toContain(calque);
    }
    expect(await page(serveur, ACCUEIL_VITRINE)).toContain(calque);
    expect(await page(serveur, ACCUEIL_VITRINE)).toContain(calque);
    // Les pages d'offre ne portent jamais de calque, et ne comptent pas.
    for (const chemin of PAGES_OFFRE) {
      expect(await page(serveur, chemin)).not.toContain(calque);
    }
  });

  it('le calque recouvre les TROIS boutons d’un seul bloc : une cause, trois interceptions', async () => {
    const serveur = await servir(calqueAuRejeu, ['D01', 'D02'], 'en');
    const seuil = Number(config.bugs['D02']?.['visitesAvantCalque']);
    for (let visite = 0; visite < seuil; visite += 1) {
      await page(serveur, ACCUEIL_VITRINE);
    }
    const html = await page(serveur, ACCUEIL_VITRINE);
    const bloc = html.slice(html.indexOf('class="offres"'), html.indexOf('</section>'));
    expect(bloc.match(/data-role="offre-\d"/g)).toHaveLength(3);
    expect(bloc).toContain(calque);
  });

  it('sous D01, la vitrine pointe vers une ressource absente ; sain, elle existe', async () => {
    const casse = await servir(calqueAuRejeu, ['D01'], 'fr');
    const chemin = String(config.bugs['D01']?.['cheminRessourceIntrouvable']);
    expect(await page(casse, ACCUEIL_VITRINE)).toContain(`src="${chemin}"`);
    expect(await statut(casse, chemin)).toBe(404);
    const sain = await servir(calqueAuRejeu, [], 'fr');
    expect(await statut(sain, '/statique/images/vitrine.svg')).toBe(200);
  });

  it('D02 n’a pas de scénario seul — il n’y serait jamais constatable — mais sa combinaison avec D01 existe', () => {
    const ids = genererScenarios(calqueAuRejeu, config).map((scenario) => scenario.id);
    expect(ids.some((id) => /--d02--/.test(id))).toBe(false);
    expect(ids).toContain('calque-au-rejeu--d01-d02--fr');
    expect(ids).toContain('calque-au-rejeu--d01--en');
    // Sans combinaison déclarée, le générateur refuse : D02 disparaîtrait sans rougir.
    const sansCombinaison = { ...config, scenarios: { ...config.scenarios, combinaisons: {} } };
    expect(() => genererScenarios(calqueAuRejeu, sansCombinaison)).toThrow(/seulementEnCombinaison/);
  });

  it('le manifeste porte les DEUX attendus de D02 : verdict « decouverte » à gravité bornée (contrat 8), et cause unique (C-16)', () => {
    const scenarioCombine = genererScenarios(calqueAuRejeu, config).find((candidat) => candidat.id === 'calque-au-rejeu--d01-d02--fr');
    expect(scenarioCombine).toBeDefined();
    const attendus = deriverManifeste(scenarioCombine!, calqueAuRejeu).attendus;
    expect(attendus.find((attendu) => attendu.nature === 'bug' && attendu.bugId === 'D02')).toMatchObject({
      categorie: 'fonctionnel',
      gravite: 'important',
      verdictAttendu: 'decouverte',
      causeUnique: true,
    });
    expect(attendus.find((attendu) => attendu.nature === 'bug' && attendu.bugId === 'D01')).toMatchObject({ verdictAttendu: 'confirmee' });
  });
});
