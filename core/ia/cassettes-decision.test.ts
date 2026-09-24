/**
 * Le rejeu des DÉCISIONS : une cassette par décision, la même garde réseau que
 * le profilage, la même garde d'écriture à deux diagnostics.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../scanner/config.js';
import { VERSION } from '../../prompts/navigation/v2.js';
import { actionDe, etatDeTest } from './aide-tests-decision.js';
import type { EtatNormalise } from './etat-decision.js';
import {
  COMMANDE_ENREGISTREMENT_IA,
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_ACTION_INCONNUE,
  RAISON_CASSETTE_ABSENTE,
  chargerConfigNavigation,
  cleCassetteDecision,
  clientRejouable,
  creerClientSansCapacite,
  depotCassettesFichiers,
  empreinteContratNavigation,
  normaliserEtatDecision,
  type Cassette,
  type ClientIaEnregistrable,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';
import { chargerConfigDiagnostic, chargerConfigProfilage, chargerConfigRapport } from '../scanner/config.js';

const configScanner = await chargerConfigScanner();
const profilage = await chargerConfigProfilage();
const navigation = await chargerConfigNavigation(configScanner.exploration);

const MODELE_PROFILAGE = configScanner.ia.modeles.profilage;
const MODELE = configScanner.ia.modeles.navigation;
/** Forme résolue, volontairement distincte de l'alias : c'est le cas normal. */
const MODELE_SERVI = `${MODELE}-20251001`;
const EMPREINTE = empreinteContratNavigation(navigation);

const DECISION = { modele: MODELE, config: navigation };
/** Réglages de diagnostic : requis par `clientRejouable`, sans effet sur les décisions. */
const DIAGNOSTIC = { modele: configScanner.ia.modeles.diagnostic, config: await chargerConfigDiagnostic() };
/** Réglages de rédaction : requis par `clientRejouable`, sans effet sur les décisions. */
const REDACTION = { modele: configScanner.ia.modeles.redaction, config: await chargerConfigRapport() };
const options = {
  enregistrement: false,
  modele: MODELE_PROFILAGE,
  profilage,
  decision: DECISION,
  diagnostic: DIAGNOSTIC,
  redaction: REDACTION,
};

const ELECTION = JSON.stringify({ actionId: 'c3', raison: 'le formulaire de commande' });

const dossiers: string[] = [];
async function dossierNeuf(): Promise<string> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-decisions-'));
  dossiers.push(dossier);
  return dossier;
}
afterAll(async () => {
  await Promise.all(dossiers.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

function cleDe(etat = etatDeTest()): string {
  return cleCassetteDecision({
    versionPrompt: VERSION,
    empreinteContrat: EMPREINTE,
    modele: MODELE,
    etat: normaliserEtatDecision(etat, navigation),
  });
}

function cassetteDe(cle: string, reponse: string, modeleServi = MODELE_SERVI, apresRelance = false): Cassette {
  return {
    cle,
    metadonnees: {
      date: '2026-09-23T00:00:00.000Z',
      modeleDemande: MODELE,
      modeleServi,
      versionPrompt: VERSION,
      coutApi: 0.0007,
      apresRelance,
    },
    reponse,
  };
}

/** Client qui EXPLOSE si on l'appelle : une garde ne se relit pas, elle se déclenche. */
function clientQuiExplose(): ClientIaEnregistrable {
  return {
    ...creerClientSansCapacite('doublure'),
    deciderBrut: async (): Promise<ResultatIa<ReponseBrute>> => {
      throw new Error('le réseau a été touché depuis un run normal');
    },
  };
}

function clientQuiEnregistre(
  texte: string,
  modeleServi = MODELE_SERVI,
): ClientIaEnregistrable & { etatsVus: EtatNormalise[] } {
  const etatsVus: EtatNormalise[] = [];
  return {
    ...creerClientSansCapacite('doublure'),
    mode: 'actif',
    raisonDegrade: null,
    etatsVus,
    deciderBrut: async (etat): Promise<ResultatIa<ReponseBrute>> => {
      etatsVus.push(etat);
      return {
        disponible: true,
        valeur: { texte, coutApi: 0.0007, apresRelance: false, modeleServi },
        coutApi: 0.0007,
      };
    },
  };
}

describe('clientRejouable — décisions, mode normal', () => {
  it('cassette présente : décision rejouée, estampillée, SANS toucher le réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), ELECTION));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).decider(etatDeTest());
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur.actionId).toBe('c3');
    expect(resultat.valeur.provenance).toMatchObject({
      versionPrompt: VERSION,
      modeleDemande: MODELE,
      // Le modèle SERVI est rejoué depuis la cassette : une décision rejouée
      // doit nommer le modèle qui a réellement produit la réponse.
      modeleServi: MODELE_SERVI,
      actionId: 'c3',
    });
    expect(resultat.coutApi).toBe(0.0007);
  });

  it('le même état construit dans un autre ordre retrouve LA MÊME cassette', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), ELECTION));

    const reference = etatDeTest();
    const autrement = etatDeTest({ actions: [...reference.actions].reverse() });
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).decider(autrement);
    expect(resultat.disponible).toBe(true);
  });

  it('cassette absente : indisponible, message nommant la commande, SANS réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const journal: { type: string; details?: unknown }[] = [];
    const resultat = await clientRejouable(clientQuiExplose(), depot, {
      ...options,
      journaliser: (type, details) => journal.push({ type, details }),
    }).decider(etatDeTest());

    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
    if (resultat.disponible) return;
    expect(resultat.message).toContain(COMMANDE_ENREGISTREMENT_IA);
    expect(journal).toContainEqual({
      type: 'ia.cassette.absente',
      details: { cle: cleDe(), commande: COMMANDE_ENREGISTREMENT_IA },
    });
  });

  /**
   * Une énumération différente est une clé différente : la cassette manque, et
   * c'est un échec BRUYANT — jamais un appel réseau glissé dans une notation.
   */
  it('une énumération différente ne rejoue PAS la cassette voisine', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), ELECTION));

    const autre = etatDeTest({ actions: [actionDe('c1', '/a', 'A'), actionDe('c2', '/b', 'B')] });
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).decider(autre);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
  });

  /**
   * Le rejeu ne s'accorde aucune tolérance que la production n'a pas : une
   * réponse figée dont l'identifiant n'appartient plus au menu est rejetée au
   * rejeu comme elle l'aurait été à chaud.
   */
  it('une cassette dont l’identifiant n’est plus au menu est refusée, pas exécutée', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const etat = etatDeTest();
    await depot.ecrire(cassetteDe(cleDe(etat), JSON.stringify({ actionId: 'c9', raison: null })));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).decider(etat);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_ACTION_INCONNUE });
  });
});

describe('clientRejouable — décisions, mode enregistrement', () => {
  it('appelle le client, écrit la cassette avec ses métadonnées et rend la décision', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(ELECTION);
    const decore = clientRejouable(client, depot, {
      ...options,
      enregistrement: true,
      maintenant: () => new Date('2026-09-23T12:00:00.000Z'),
    });

    const resultat = await decore.decider(etatDeTest());
    expect(resultat.disponible).toBe(true);

    const cassette = await depot.lire(cleDe());
    expect(cassette).toEqual({
      cle: cleDe(),
      metadonnees: {
        date: '2026-09-23T12:00:00.000Z',
        modeleDemande: MODELE,
        modeleServi: MODELE_SERVI,
        versionPrompt: VERSION,
        coutApi: 0.0007,
        apresRelance: false,
      },
      reponse: ELECTION,
    });
  });

  /**
   * Le client concret reçoit l'état NORMALISÉ, celui-là même qui a servi à
   * calculer la clé : une cassette ne peut pas être enregistrée sous la clé
   * d'un prompt et produite par un autre.
   */
  it('le client reçoit l’état NORMALISÉ, celui qui a servi à calculer la clé', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(ELECTION);
    const desordre = etatDeTest({ actions: [...etatDeTest().actions].reverse() });
    await clientRejouable(client, depot, { ...options, enregistrement: true }).decider(desordre);

    expect(client.etatsVus).toHaveLength(1);
    expect(client.etatsVus[0]).toEqual(normaliserEtatDecision(etatDeTest(), navigation));
  });

  /** La garde à deux diagnostics s'applique inchangée aux cassettes de décision. */
  it('refuse une réponse DIFFÉRENTE sous une clé existante, et nomme la vraie cause', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cle = cleDe();
    await depot.ecrire(cassetteDe(cle, ELECTION));

    const memeModele = cassetteDe(cle, JSON.stringify({ actionId: 'c1', raison: null }));
    await expect(depot.ecrire(memeModele)).rejects.toThrow(DIVERGENCE_PROMPT_SANS_INCREMENT);

    const aliasGlisse = cassetteDe(cle, JSON.stringify({ actionId: 'c1', raison: null }), `${MODELE}-20260401`);
    await expect(depot.ecrire(aliasGlisse)).rejects.toThrow(DIVERGENCE_GLISSEMENT_ALIAS);
  });
});
