/**
 * Le gabarit du cahier P2-2 — « tiers-au-robot ». Ces tests ne notent pas le
 * moteur (le banc le fait) : ils garantissent que la seconde origine sert ce
 * que le gabarit promet — une police au navigateur et pas au robot (W01), une
 * panne au script d'avis (W02) — et que le site sain n'en dépend pas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../../core/scanner/config.js';
import { chargerConfig } from '../config.js';
import { demarrerServeur } from '../serveur.js';
import type { ConfigBanc, ServeurScenario } from '../types.js';
import { tiersAuRobot } from './tiers-au-robot/index.js';
import { CHEMIN_MESURE_TIERCE, CHEMIN_POLICE_TIERCE, CHEMIN_SCRIPT_AVIS, PAGE_ACCUEIL } from './tiers-au-robot/structure.js';

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.map((serveur) => serveur.arreter()));
});

async function servir(bugsActifs: string[], langue = 'fr'): Promise<ServeurScenario> {
  const serveur = await demarrerServeur({ id: `test--tiers-au-robot--${langue}`, gabarit: tiersAuRobot.nom, langue, bugsActifs }, tiersAuRobot, config);
  serveurs.push(serveur);
  return serveur;
}

describe('tiers-au-robot — une seconde origine qui répond AUTREMENT au robot (P2-2, contrat 6)', () => {
  it('W01 : la police est servie au navigateur AVEC l’en-tête CORS, au robot SANS — même corps, autre réponse', async () => {
    const serveur = await servir(['W01']);
    expect(serveur.origineTierce).not.toBeNull();
    const enTete = String(config.bugs['W01']?.['enTeteRobot']);
    const auNavigateur = await fetch(`${serveur.origineTierce}${CHEMIN_POLICE_TIERCE}`);
    const auRobot = await fetch(`${serveur.origineTierce}${CHEMIN_POLICE_TIERCE}`, { headers: { [enTete]: '1' } });
    expect(auNavigateur.headers.get('access-control-allow-origin')).toBe('*');
    // Le contrôle qui peut échouer : sans cette différence, W01 mesurerait un
    // tiers en panne, pas un tiers qui sert autrement le robot.
    expect(auRobot.headers.get('access-control-allow-origin')).toBeNull();
    expect(await auRobot.text()).toBe(await auNavigateur.text());
    const accueil = await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain(`${serveur.origineTierce}${CHEMIN_POLICE_TIERCE}`);
  });

  it('W02 : l’accueil charge le script d’avis puis l’APPELLE ; la seconde origine est en panne', async () => {
    const serveur = await servir(['W02'], 'en');
    const accueil = await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain(`src="${serveur.origineTierce}${CHEMIN_SCRIPT_AVIS}"`);
    expect(accueil).toContain('window.AvisTiers.afficher(');
    expect((await fetch(`${serveur.origineTierce}${CHEMIN_SCRIPT_AVIS}`)).status).toBe(503);
  });

  it('W03 : la balise de mesure tient les premières visites, puis tombe — et la page ne la rappelle JAMAIS', async () => {
    // Le croisement que rien n'éprouvait : une panne tierce qui n'arrive que
    // pendant le rejeu, donc une DÉCOUVERTE sans effet visible
    // (APPRENTISSAGES n°25). Les deux contrôles qui peuvent échouer : une
    // panne dès la première visite (ce ne serait plus une découverte), et un
    // appel de la page au script (ce ne serait plus « sans effet »).
    const serveur = await servir(['W03']);
    const seuil = Number(config.bugs['W03']?.['visitesAvantPanne']);
    const url = `${serveur.origineTierce}${CHEMIN_MESURE_TIERCE}`;
    for (let visite = 1; visite <= seuil; visite += 1) {
      const accueil = await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
      expect(accueil).toContain(`src="${url}"`);
      // Rien n'appelle la balise : son échec ne peut produire aucune erreur.
      expect(accueil).not.toContain('__mesure(');
      expect((await fetch(url)).status).toBe(200);
    }
    await fetch(serveur.url + PAGE_ACCUEIL);
    expect((await fetch(url)).status).toBe(503);
  });

  it('sain : aucune seconde origine, aucune référence tierce', async () => {
    const serveur = await servir([]);
    expect(serveur.origineTierce).toBeNull();
    expect(await (await fetch(serveur.url + PAGE_ACCUEIL)).text()).not.toContain('widget');
  });

  it('l’en-tête du robot de W01 est bien celui du moteur : sinon W01 cesserait en silence de viser le robot', async () => {
    const scanner = await chargerConfigScanner();
    expect(String(config.bugs['W01']?.['enTeteRobot']).toLowerCase()).toBe(scanner.robot.enTete.toLowerCase());
  });
});
