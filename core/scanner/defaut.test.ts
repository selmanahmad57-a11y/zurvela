/**
 * Test du pipeline COMPLET sur un scénario du banc (cahier §5.3) : le
 * scanner par défaut (vrai navigateur, vraie config, six détecteurs,
 * protocole anti-faux-positifs) scanne un mini-site servi en mémoire. Un
 * scénario bogué doit donner l'anomalie attendue, CONFIRMÉE par re-exécution,
 * le site sain aucune — et sans même ouvrir de navigateur de confirmation.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../../banc/config.js';
import { RAISON_CLE_ABSENTE, type ClientIa, type ContexteProfilage, type ProfilPage } from '../ia/index.js';
import { chargerConfigProfilage, chargerConfigScanner, type ConfigProfilage, type ConfigScanner } from './config.js';
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
let configProfilage: ConfigProfilage;
let scanner: Scanner;

beforeAll(async () => {
  configBanc = await chargerConfig();
  configScanner = await chargerConfigScanner();
  configProfilage = await chargerConfigProfilage();
  scanner = await creerScannerParDefaut();
});

/** Sert le scénario, le scanne avec le timeout du banc, arrête le serveur. */
async function scannerScenario(bugsActifs: string[], sujet: Scanner = scanner): Promise<Rapport> {
  const scenario: Scenario = { id: `test--${bugsActifs.join('-') || 'sain'}`, gabarit: formulaireContact.nom, langue: 'fr', bugsActifs };
  const serveur = await demarrerServeur(scenario, formulaireContact, configBanc);
  try {
    return await sujet(serveur.url, { timeoutMs: configBanc.scan.timeoutMs });
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

/**
 * Profilage IA de bout en bout, avec un vrai navigateur et un vrai mini-site,
 * mais un client IA FACTICE : aucun réseau ne doit jamais partir d'un test.
 */
describe('profilage IA sur le banc', () => {
  const PROFIL: ProfilPage = {
    typeSite: 'vitrine-contact',
    natureLibre: null,
    langue: 'fr',
    confiance: 0.88,
    versionPrompt: 'v1-test',
    modeleDemande: 'modele-test',
    modeleServi: 'modele-test-20260101',
    apresRelance: false,
  };

  /** Client IA factice : mémorise les contextes reçus, n'appelle rien. */
  function clientFactice(): ClientIa & { appels: ContexteProfilage[] } {
    const appels: ContexteProfilage[] = [];
    return {
      mode: 'actif',
      raisonDegrade: null,
      appels,
      profiler: async (contexte) => {
        appels.push(contexte);
        return { disponible: true, valeur: PROFIL, coutApi: 0.005 };
      },
      cleDecision: () => null,
      decider: () => Promise.resolve({ disponible: false, raison: 'hors-perimetre' }),
      diagnostiquer: () => Promise.resolve({ disponible: false, raison: 'hors-perimetre' }),
      rediger: () => Promise.resolve({ disponible: false, raison: 'hors-perimetre' }),
    };
  }

  it('un seul appel par scan, sur le texte de la page d’accueil déjà chargée, estampillé dans le rapport et facturé', async () => {
    const ia = clientFactice();
    const sujet = await creerScannerParDefaut({ ia });
    const rapport = await scannerScenario([], sujet);

    // UN appel, alors que l'exploration parcourt DEUX viewports.
    expect(ia.appels).toHaveLength(1);
    const contexte = ia.appels[0];
    expect(rapport.parcours?.pages.map((page) => page.viewport)).toContain('mobile');

    // Ce que le modèle reçoit : du texte, borné, jamais du balisage.
    // L'URL du contexte est celle de la page RÉELLEMENT chargée (normalisée),
    // pas la chaîne demandée au scan : c'est de cette page que vient le texte.
    expect(contexte?.url).toBe(new URL(rapport.url).href);
    expect(contexte?.texte.startsWith('title: ')).toBe(true);
    expect(contexte?.texte).toContain('body:');
    expect(contexte?.texte).not.toContain('<');
    expect(contexte?.texte.length).toBeGreaterThan(0);
    expect(contexte?.texte.length).toBeLessThanOrEqual(configProfilage.contexteMaxChars);
    expect(contexte?.langueDeclaree).toBe('fr');

    // Le profil, avec son estampille de provenance, et son coût dans le total.
    expect(rapport.profil).toEqual(PROFIL);
    expect(rapport.coutApi).toBeCloseTo(0.005, 10);
    expect(rapport.anomalies).toEqual([]);

    const extraction = rapport.journal.find((entree) => entree.type === 'profilage.extraction')?.details as
      | { viewport: string; nbChars: number; tronque: boolean }
      | undefined;
    expect(extraction?.viewport).toBe(configScanner.viewports[0]?.nom);
    expect(extraction?.nbChars).toBeGreaterThan(0);
    expect(extraction?.tronque).toBe(false);
    expect(rapport.journal.find((entree) => entree.type === 'profilage.fin')?.details).toMatchObject({
      typeSite: 'vitrine-contact',
      langue: 'fr',
      confiance: 0.88,
      coutApi: 0.005,
      versionPrompt: 'v1-test',
      modeleDemande: 'modele-test',
      modeleServi: 'modele-test-20260101',
    });
  }, 90_000);

  it('sans clé d’API : le scan reste vert, le rapport n’a pas de profil, le coût reste nul — mais le texte a bien été extrait', async () => {
    const rapport = await scannerScenario([]);

    expect(rapport.profil).toBeUndefined();
    expect(rapport.coutApi).toBe(0);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.parcours?.arret).toBe('complet');
    expect(rapport.journal.find((entree) => entree.type === 'profilage.indisponible')?.details).toMatchObject({
      raison: RAISON_CLE_ABSENTE,
      coutApi: 0,
    });
    // Le mode dégradé protège l'exécution, il ne doit rien AVEUGLER : la
    // commande d'extraction en page tourne à chaque scan, avec ou sans IA
    // (APPRENTISSAGES n°5).
    expect(rapport.journal.some((entree) => entree.type === 'profilage.extraction')).toBe(true);
    expect(rapport.journal.map((entree) => entree.type)).not.toContain('profilage.fin');
  }, 60_000);
});
