/**
 * Le gabarit du cahier P2-4 — « site-charge ». Ces tests ne notent pas le
 * moteur (le banc le fait) : ils garantissent que le gabarit produit bien
 * la CAUSE de la lourdeur, et non sa surface.
 *
 * Ils affirment ce que le GABARIT produit — beaucoup de causes distinctes,
 * des pages retardées —, jamais ce que le moteur en fait. La saturation est
 * une MESURE du cahier (la ligne « avant » du budget de rejeu), pas un
 * attendu permanent : le jour où P2-4 répare le budget, le gabarit devra
 * cesser de saturer sans qu'aucun test n'ait à changer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../config.js';
import { demarrerServeur } from '../serveur.js';
import type { ConfigBanc, ServeurScenario } from '../types.js';
import { siteCharge } from './site-charge/index.js';
import { NB_PAGES, PAGES_RAYON, PAGE_ACCUEIL, PREFIXE_MANQUANTE } from './site-charge/structure.js';

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.map((serveur) => serveur.arreter()));
});

async function servir(bugsActifs: string[]): Promise<ServeurScenario> {
  const serveur = await demarrerServeur({ id: `test--site-charge--${bugsActifs.join('-')}`, gabarit: siteCharge.nom, langue: 'fr', bugsActifs }, siteCharge, config);
  serveurs.push(serveur);
  return serveur;
}

describe('site-charge — la CAUSE de la lourdeur, pas sa surface', () => {
  it('chaque page appelle des ressources absentes à des adresses DISTINCTES : autant de causes racines', async () => {
    // C'est l'UNICITÉ des adresses qui fait le nombre de groupes. Des
    // ressources absentes partagées entre les pages ne feraient qu'une
    // cause, et le gabarit mesurerait la rapidité d'un petit site
    // (APPRENTISSAGES n°30).
    const serveur = await servir(['Z01']);
    const par = Number(config.bugs['Z01']?.['ressourcesParPage']);
    const adresses = new Set<string>();
    for (const chemin of [PAGE_ACCUEIL, ...PAGES_RAYON]) {
      const html = await (await fetch(serveur.url + chemin)).text();
      const trouvees = [...html.matchAll(new RegExp(`${PREFIXE_MANQUANTE}-[a-z0-9-]+\\.svg`, 'g'))].map((m) => m[0]);
      expect(trouvees).toHaveLength(par);
      for (const adresse of trouvees) {
        adresses.add(adresse);
      }
    }
    // Aucune adresse partagée entre deux pages : le compte des causes est
    // le produit, pas le maximum.
    expect(adresses.size).toBe((NB_PAGES + 1) * par);
    expect(adresses.size).toBeGreaterThanOrEqual(40);
  });

  it('les ressources sont réellement ABSENTES : 404 du serveur statique, pas une image vide', async () => {
    const serveur = await servir(['Z01']);
    expect((await fetch(`${serveur.url}${PREFIXE_MANQUANTE}--1.svg`)).status).toBe(404);
  });

  it('les pages sont RETARDÉES : un rejeu recharge, donc son coût est celui d’un chargement', async () => {
    // La seconde moitié de la cause. Beaucoup de groupes sans rejeux
    // coûteux ne mettrait rien sous tension : le budget tiendrait.
    const serveur = await servir(['Z01']);
    const delai = Number(config.bugs['Z01']?.['delaiPageMs']);
    expect(delai).toBeGreaterThan(0);
    const debut = Date.now();
    await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
    expect(Date.now() - debut).toBeGreaterThanOrEqual(delai);
  });

  it('sain : aucune ressource absente, et la page répond sans retard', async () => {
    const serveur = await servir([]);
    const html = await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
    expect(html).not.toContain(PREFIXE_MANQUANTE);
  });
});
