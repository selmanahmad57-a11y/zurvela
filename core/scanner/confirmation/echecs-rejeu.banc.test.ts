/**
 * LA FRONTIÈRE, TESTÉE ACTIVEMENT : `non-reproduite` / `limite-automatisation`
 * / découverte (cahier, annexes C et D).
 *
 * Constater que T01 est écarté ne suffit pas : il faut provoquer les deux
 * échecs de rejeu symétriques et vérifier que le protocole ne les confond
 * pas — c'est exactement la frontière que le secteur confond avec un défaut
 * du site.
 *
 * 1. Le SITE tombe entre le scan et la re-exécution (serveur du banc coupé
 *    par le test) : la page devient injoignable. Le protocole ne doit PAS se
 *    taire — il retient une DÉCOUVERTE (« site injoignable »), l'incident le
 *    plus grave qui existe, et ne l'impute pas à l'outillage.
 * 2. Le ROBOT tombe (navigateur fermé) : là, aucun constat n'est possible,
 *    le verdict est `limite-automatisation` — jamais `non-reproduite`.
 *
 * Ces deux cas vivent ICI, en Vitest, et JAMAIS en scénario du banc : une
 * anomalie découverte au rejeu n'appartient à aucun manifeste et compterait
 * mécaniquement en faux positif, faisant mentir l'instrument sur la
 * métrique qu'il doit protéger.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { formulaireContact } from '../../../banc/gabarits/formulaire-contact/index.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ServeurScenario } from '../../../banc/types.js';
import type { AnomalieCandidate, EntreeJournal, Parcours, ResultatConfirmation } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { creerDetecteurs, detecter } from '../detection/index.js';
import { DESCRIPTION_DOCUMENT_INJOIGNABLE, NOM_DETECTEUR_HTTP } from '../detection/d-http.js';
import { creerExplorateur } from '../exploration/explorateur.js';
import { creerFiltre } from '../exploration/filtre-actions.js';
import { politiqueDeterministe } from '../exploration/politique.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { creerReexecuteur } from '../reexecuteur.js';
import { autoDiagnosticMecanique } from './auto-diagnostic.js';
import { MOTIF_CONSTATEE_AU_REJEU } from './decouvertes.js';
import { creerProtocole } from './protocole.js';
import { MOTIF_REJEU_IMPOSSIBLE } from './verdict.js';

const ECHEANCE_MS = 40_000;

let config: ConfigScanner;
let navigateur: Browser;
let serveur: ServeurScenario;
let candidates: AnomalieCandidate[];
let urlDepart: string;
/** Le test coupe le serveur lui-même ; le nettoyage final ne doit pas le couper deux fois. */
let serveurCoupe = false;

async function couperServeur(): Promise<void> {
  if (!serveurCoupe) {
    serveurCoupe = true;
    await serveur.arreter();
  }
}

beforeAll(async () => {
  const base = await chargerConfigScanner();
  // Mêmes resserrages que les autres tests d'intégration : seules les
  // ATTENTES du chemin nominal sont raccourcies, jamais les délais d'échec.
  config = { ...base, exploration: { ...base.exploration, attenteEffetMaxMs: 3000, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  // Plage de ports RÉSERVÉE à ce fichier : il COUPE son serveur puis rejoue
  // sur la même URL. Dans la plage commune, le serveur d'un autre fichier de
  // test (exécutés en parallèle) peut reprendre le port entre les deux, et
  // le rejeu atteindrait alors un site bien vivant — le test mesurerait le
  // voisin au lieu de la panne.
  const configBanc = { ...(await chargerConfig()), serveur: { portDeBase: 4890, nombrePortsEssayes: 10 } };
  serveur = await demarrerServeur(
    { id: 'test--echecs-rejeu-f01', gabarit: formulaireContact.nom, langue: 'fr', bugsActifs: ['F01'] },
    formulaireContact,
    configBanc,
  );
  urlDepart = serveur.url;
  navigateur = await lancerNavigateur(config);

  const observateur = creerObservateur();
  const deterministe = politiqueDeterministe(config.remplissage);
  const explorateur = creerExplorateur({
    config,
    politique: deterministe,
    secours: deterministe,
    filtre: creerFiltre(await chargerActionsInterdites()),
    navigateur,
  });
  const parcours: Parcours = await explorateur.explorer(
    { urlDepart, echeance: Date.now() + ECHEANCE_MS, journaliser: () => undefined },
    observateur,
  );
  candidates = detecter(observateur.signaux(), { urlDepart, parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
  expect(candidates.length).toBeGreaterThan(0);
}, 90_000);

afterAll(async () => {
  await navigateur?.close();
  await couperServeur();
});

/** Confirme les candidates du scan avec le VRAI re-exécuteur, et rend le journal produit. */
async function confirmer(): Promise<{ resultat: ResultatConfirmation; journal: EntreeJournal[] }> {
  const journal: EntreeJournal[] = [];
  const journaliser = (type: string, details?: unknown): void => {
    journal.push({ horodatage: new Date().toISOString(), type, details });
  };
  const protocole = creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique });
  const resultat = await protocole.confirmer(candidates, {
    urlDepart,
    options: { timeoutMs: ECHEANCE_MS },
    echeance: Date.now() + ECHEANCE_MS,
    journaliser,
    reexecuteur: creerReexecuteur({ navigateur, config, journaliser }),
    detecteurs: creerDetecteurs(config.detecteurs),
    viewports: config.viewports,
  });
  return { resultat, journal };
}

describe('échecs de rejeu — à qui la faute ?', () => {
  it('le SITE tombe entre le scan et le rejeu → découverte RETENUE, jamais un silence', async () => {
    await couperServeur();
    const { resultat, journal } = await confirmer();

    // 1. Le moteur ne se tait pas : l'incident est retenu, avec son motif.
    const decouvertes = resultat.decouvertes ?? [];
    expect(decouvertes.length).toBeGreaterThan(0);
    const injoignable = decouvertes.find((anomalie) => anomalie.description === DESCRIPTION_DOCUMENT_INJOIGNABLE);
    expect(injoignable).toMatchObject({
      detecteur: NOM_DETECTEUR_HTTP,
      verdict: 'confirmee',
      // Confiance du détecteur, SANS calibration : constatée une fois, pas re-confirmée.
      confiance: config.detecteurs.http.confianceDocumentInjoignable,
      graviteEstimee: config.detecteurs.http.graviteDocumentInjoignable,
    });
    // Elle est aussi dans les retenues : c'est le rapport final qui la porte.
    expect(resultat.retenues).toContain(injoignable);
    // Et elle porte son statut DANS le rapport : motif « constatée une fois »
    // et clé de son groupe de découverte, sans passer par le journal.
    expect(injoignable?.motif).toBe(MOTIF_CONSTATEE_AU_REJEU);
    expect(resultat.groupes?.some((groupe) => groupe.groupe.cle === injoignable?.groupe)).toBe(true);
    expect(journal.filter((entree) => entree.type === 'confirmation.decouverte')).toHaveLength(decouvertes.length);
    expect(journal.some((entree) => (entree.details as { motif?: string } | undefined)?.motif === MOTIF_CONSTATEE_AU_REJEU)).toBe(true);

    // 2. L'échec est imputé au SITE, pas au robot : la tentative reste exploitable.
    const tentatives = journal
      .filter((entree) => entree.type === 'confirmation.tentative')
      .map((entree) => entree.details as { causeEchec?: string; observations?: Record<string, unknown> });
    expect(tentatives.length).toBeGreaterThan(0);
    for (const tentative of tentatives) {
      expect(tentative.causeEchec).toBe('reseau-site');
      // CE QUE LE REJEU A OBSERVÉ, y compris quand il a échoué — c'est là
      // que cela sert. Un serveur coupé laisse une trace RÉSEAU : c'est ce
      // qui distingue « le site s'est tu » de « le robot n'a pas su agir »,
      // et sans ce champ le journal ne la portait nulle part.
      expect(tentative.observations).toMatchObject({ nbPages: 0, statutDocument: null, arreteA: 'naviguer' });
      // La ressource est NOMMÉE, pas seulement comptée : « une requête a
      // échoué » ne dit pas si c'est celle dont l'anomalie parle.
      const echecs = tentative.observations?.['echecsReseau'] as string[];
      expect(echecs.length).toBeGreaterThan(0);
      expect(echecs.every((echec) => echec.includes(urlDepart))).toBe(true);
    }
    // 3. Et donc AUCUN groupe n'est classé « limite d'automatisation ».
    for (const groupe of resultat.groupes ?? []) {
      expect(groupe.verdict).not.toBe('limite-automatisation');
    }
  }, 90_000);

  it('le ROBOT tombe (navigateur perdu) → limite-automatisation, jamais non-reproduite', async () => {
    // Le serveur est déjà coupé ; ici c'est l'outil qui manque, et cela
    // change tout : aucun constat n'est possible, donc aucune conclusion.
    await navigateur.close();
    const { resultat, journal } = await confirmer();

    const groupes = resultat.groupes ?? [];
    expect(groupes.length).toBeGreaterThan(0);
    for (const groupe of groupes) {
      expect(groupe.verdict).toBe('limite-automatisation');
      expect(groupe.motif).toBe(MOTIF_REJEU_IMPOSSIBLE);
      expect(groupe.tauxReproduction).toBeNull();
    }
    // Rien n'est affirmé ni découvert quand le robot n'a rien pu observer.
    expect(resultat.retenues).toEqual([]);
    expect(resultat.decouvertes).toEqual([]);
    const tentatives = journal.filter((entree) => entree.type === 'confirmation.tentative').map((entree) => entree.details as { causeEchec?: string });
    expect(tentatives.length).toBeGreaterThan(0);
    for (const tentative of tentatives) {
      expect(tentative.causeEchec).toBe('outil');
    }
    // Le contraste avec le cas précédent est LA mesure de ce champ : ici le
    // rejeu n'a rien observé du tout — aucune erreur réseau, aucun signal.
    // Le même « échec » se lit différemment selon ce qui a été vu.
    const observations = journal
      .filter((entree) => entree.type === 'confirmation.tentative')
      .map((entree) => (entree.details as { observations?: Record<string, unknown> }).observations);
    for (const observation of observations) {
      expect(observation).toMatchObject({ nbPages: 0, nbSignaux: 0, echecsReseau: [], requetesEnAttente: [], nbActions: 0 });
    }
  }, 90_000);
});
