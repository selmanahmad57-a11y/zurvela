/**
 * Test du pipeline COMPLET sur un scénario du banc (cahier §5.3) : le
 * scanner par défaut (vrai navigateur, vraie config, six détecteurs,
 * protocole anti-faux-positifs) scanne un mini-site servi en mémoire. Un
 * scénario bogué doit donner l'anomalie attendue, CONFIRMÉE par re-exécution,
 * le site sain aucune — et sans même ouvrir de navigateur de confirmation.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../../banc/config.js';
import { chargerConfigScanner, type ConfigScanner } from './config.js';
import { formulaireContact } from '../../banc/gabarits/formulaire-contact/index.js';
import { PAGE_CONTACT } from '../../banc/gabarits/formulaire-contact/structure.js';
import { demarrerServeur } from '../../banc/serveur.js';
import type { ConfigBanc, Scenario } from '../../banc/types.js';
import type { Rapport, Scanner } from '../types.js';
import { NOM_PROTOCOLE_ANTI_FAUX_POSITIFS } from './confirmation/protocole.js';
import { creerScannerParDefaut, NOM_EXPLORATEUR_NAVIGATEUR } from './defaut.js';
import { NOM_DETECTEUR_INERTE } from './detection/d-inerte.js';

let configBanc: ConfigBanc;
let configScanner: ConfigScanner;
let scanner: Scanner;

beforeAll(async () => {
  configBanc = await chargerConfig();
  configScanner = await chargerConfigScanner();
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
    // Le protocole a RE-EXÉCUTÉ le bouton mort et l'a confirmé.
    expect(anomalie?.verdict).toBe('confirmee');
    expect(rapport.ecartees).toEqual([]);
    const types = rapport.journal.map((entree) => entree.type);
    expect(types[0]).toBe('scan.debut');
    expect(types).toEqual(
      expect.arrayContaining([
        'ia.mode',
        'exploration.fin',
        'detection.fin',
        'confirmation.debut',
        'confirmation.groupe',
        'confirmation.tentative',
        'confirmation.verdict',
        'confirmation.fin',
        'rejeu.debut',
        'rejeu.action',
        'rejeu.fin',
      ]),
    );
    expect(types[types.length - 1]).toBe('scan.fin');
    // La preuve du rejeu de l'état : le remplissage précède la soumission.
    const actionsRejouees = rapport.journal
      .filter((entree) => entree.type === 'rejeu.action')
      .map((entree) => (entree.details as { type: string }).type);
    expect(actionsRejouees.slice(0, 3)).toEqual(['naviguer', 'remplir', 'soumettre']);
    const debut = rapport.journal.find((entree) => entree.type === 'scan.debut')?.details as
      | { explorateur: string; protocole: string }
      | undefined;
    expect(debut?.explorateur).toBe(NOM_EXPLORATEUR_NAVIGATEUR);
    expect(debut?.protocole).toBe(NOM_PROTOCOLE_ANTI_FAUX_POSITIFS);
    // L'échéance du scan est SOUPLE (docs/DETTES.md n°6) : le pipeline cesse
    // d'ENGAGER du travail neuf à l'approche de l'échéance, mais n'interrompt
    // pas ce qui est en vol. Le dépassement est donc borné par l'opération la
    // plus longue qu'un rejeu peut avoir en cours — une borne DÉRIVÉE de la
    // config, pas un chiffre choisi pour faire passer le test. L'invariant
    // fort (« rendre son parcours avant l'échéance quand le site ne répond
    // pas ») est éprouvé par explorateur.adversaire.test.ts, et la durée
    // réelle par scénario est mesurée par le banc, en exécution séquentielle.
    expect(rapport.dureeMs).toBeLessThan(configBanc.scan.timeoutMs + configScanner.confirmation.rejeu.actionMs);
  }, 90_000);

  it('site sain : aucune candidate, aucune anomalie, AUCUN rejeu (la confirmation ne coûte rien sans candidate)', async () => {
    const rapport = await scannerScenario([]);
    expect(rapport.candidates).toEqual([]);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.ecartees).toEqual([]);
    expect(rapport.parcours?.actions.some((action) => action.action.type === 'soumettre' && action.resultat === 'ok')).toBe(true);
    expect(rapport.journal.map((entree) => entree.type)).not.toContain('rejeu.debut');
    expect(rapport.journal.find((entree) => entree.type === 'confirmation.debut')?.details).toMatchObject({ nbCandidates: 0, nbGroupes: 0 });
  }, 60_000);
});
