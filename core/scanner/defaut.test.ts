/**
 * Test du pipeline COMPLET sur un scénario du banc (cahier §5.3) : le
 * scanner par défaut (vrai navigateur, vraie config, six détecteurs,
 * passe-plat) scanne un mini-site servi en mémoire. Un scénario bogué doit
 * donner l'anomalie attendue, le site sain aucune.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../../banc/config.js';
import { formulaireContact } from '../../banc/gabarits/formulaire-contact/index.js';
import { PAGE_CONTACT } from '../../banc/gabarits/formulaire-contact/structure.js';
import { demarrerServeur } from '../../banc/serveur.js';
import type { ConfigBanc, Scenario } from '../../banc/types.js';
import type { Rapport, Scanner } from '../types.js';
import { creerScannerParDefaut, NOM_EXPLORATEUR_NAVIGATEUR } from './defaut.js';
import { NOM_DETECTEUR_INERTE } from './detection/d-inerte.js';

let configBanc: ConfigBanc;
let scanner: Scanner;

beforeAll(async () => {
  configBanc = await chargerConfig();
  scanner = await creerScannerParDefaut();
});

/** Sert le scénario, le scanne avec le timeout du banc, arrête le serveur. */
async function scannerScenario(bugsActifs: string[]): Promise<Rapport> {
  const scenario: Scenario = { id: `test--${bugsActifs.join('-') || 'sain'}`, gabarit: formulaireContact.nom, langue: 'fr', bugsActifs };
  const serveur = await demarrerServeur(scenario, formulaireContact, configBanc);
  try {
    return await scanner(serveur.url, { timeoutMs: configBanc.scan.timeoutMs });
  } finally {
    await serveur.arreter();
  }
}

describe('scanner par défaut sur le banc', () => {
  it('F01 : rend un rapport complet où le bouton mort est une anomalie fonctionnelle sur /contact, coût 0', async () => {
    const rapport = await scannerScenario(['F01']);
    expect(rapport.coutApi).toBe(0);
    expect(rapport.parcours?.arret).toBe('complet');
    expect(rapport.anomalies).toHaveLength(1);
    const [anomalie] = rapport.anomalies;
    expect(anomalie?.detecteur).toBe(NOM_DETECTEUR_INERTE);
    expect(anomalie?.categorie).toBe('fonctionnel');
    expect(new URL(anomalie?.urlOuEtape ?? '').pathname).toBe(PAGE_CONTACT);
    expect(anomalie?.confiance).toBeGreaterThan(0);
    expect(anomalie?.element?.balise).toBe('button');
    expect(anomalie?.reproduction?.action?.action.type).toBe('soumettre');
    const types = rapport.journal.map((entree) => entree.type);
    expect(types[0]).toBe('scan.debut');
    expect(types).toEqual(expect.arrayContaining(['ia.mode', 'exploration.fin', 'detection.fin', 'confirmation.passe-plat']));
    expect(types[types.length - 1]).toBe('scan.fin');
    const debut = rapport.journal.find((entree) => entree.type === 'scan.debut')?.details as { explorateur: string } | undefined;
    expect(debut?.explorateur).toBe(NOM_EXPLORATEUR_NAVIGATEUR);
    expect(rapport.dureeMs).toBeLessThan(configBanc.scan.timeoutMs);
  }, 30_000);

  it('site sain : aucune candidate, aucune anomalie', async () => {
    const rapport = await scannerScenario([]);
    expect(rapport.candidates).toEqual([]);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.parcours?.actions.some((action) => action.action.type === 'soumettre' && action.resultat === 'ok')).toBe(true);
  }, 30_000);
});
