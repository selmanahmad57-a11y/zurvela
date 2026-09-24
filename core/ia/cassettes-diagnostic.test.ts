/**
 * Le rejeu des DIAGNOSTICS : une cassette par diagnostic, la même clé, la même
 * garde réseau et la même garde d'écriture à deux diagnostics que le profilage
 * et la navigation.
 *
 * ── LA GARDE QUI N'EXISTAIT PAS ─────────────────────────────────────────────
 *
 * Avant cette brique, `clientRejouable` passait `diagnostiquer` directement au
 * client décoré. C'était sans conséquence tant qu'aucun client ne savait
 * diagnostiquer ; le jour où l'un d'eux a su, c'était un chemin d'appel RÉSEAU
 * depuis un run normal du banc. La première suite ci-dessous existe pour cela,
 * et elle est écrite de la seule façon qui prouve une garde : en faisant
 * exploser la doublure si le réseau est touché.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { VERSION } from '../../prompts/diagnostic/v1.js';
import { chargerConfigDiagnostic, chargerConfigProfilage, chargerConfigScanner,
  chargerConfigRapport,
} from '../scanner/config.js';
import { contexteDeTest } from './aide-tests-diagnostic.js';
import {
  COMMANDE_ENREGISTREMENT_IA,
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_CASSETTE_ABSENTE,
  RAISON_DIAGNOSTIC_INVALIDE,
  chargerConfigNavigation,
  cleCassetteDiagnostic,
  clientRejouable,
  creerClientSansCapacite,
  depotCassettesFichiers,
  empreinteContratDiagnostic,
  normaliserContexteDiagnostic,
  type Cassette,
  type ClientIaEnregistrable,
  type ContexteDiagnostic,
  type ContexteDiagnosticNormalise,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';
import { AVIS_ADMIS, AVIS_AVEU } from './schema-diagnostic.js';

const configScanner = await chargerConfigScanner();
const profilage = await chargerConfigProfilage();
const navigation = await chargerConfigNavigation(configScanner.exploration);
const diagnosticConfig = await chargerConfigDiagnostic();

const MODELE = configScanner.ia.modeles.diagnostic;
/** Forme résolue, volontairement distincte de l'alias : c'est le cas normal. */
const MODELE_SERVI = `${MODELE}-20260401`;
const EMPREINTE = empreinteContratDiagnostic(diagnosticConfig);

const options = {
  enregistrement: false,
  modele: configScanner.ia.modeles.profilage,
  profilage,
  decision: { modele: configScanner.ia.modeles.navigation, config: navigation },
  diagnostic: { modele: MODELE, config: diagnosticConfig },
  /** Réglages de rédaction : requis par `clientRejouable`, sans effet sur les diagnostics. */
  redaction: { modele: configScanner.ia.modeles.redaction, config: await chargerConfigRapport() },
};

const AVIS = JSON.stringify({ avis: AVIS_AVEU, justification: 'le journal ne dit rien du code de réponse' });

const dossiers: string[] = [];
async function dossierNeuf(): Promise<string> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-diagnostics-'));
  dossiers.push(dossier);
  return dossier;
}
afterAll(async () => {
  await Promise.all(dossiers.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

function cleDe(contexte: ContexteDiagnostic = contexteDeTest()): string {
  return cleCassetteDiagnostic({
    versionPrompt: VERSION,
    empreinteContrat: EMPREINTE,
    modele: MODELE,
    contexte: normaliserContexteDiagnostic(contexte, diagnosticConfig),
  });
}

function cassetteDe(cle: string, reponse: string, modeleServi = MODELE_SERVI, apresRelance = false): Cassette {
  return {
    cle,
    metadonnees: {
      date: '2026-09-24T00:00:00.000Z',
      modeleDemande: MODELE,
      modeleServi,
      versionPrompt: VERSION,
      coutApi: 0.0123,
      apresRelance,
    },
    reponse,
  };
}

/** Client qui EXPLOSE si on l'appelle : une garde ne se relit pas, elle se déclenche. */
function clientQuiExplose(): ClientIaEnregistrable {
  return {
    ...creerClientSansCapacite('doublure'),
    diagnostiquerBrut: async (): Promise<ResultatIa<ReponseBrute>> => {
      throw new Error('le réseau a été touché depuis un run normal');
    },
  };
}

function clientQuiEnregistre(
  texte: string,
  modeleServi = MODELE_SERVI,
): ClientIaEnregistrable & { contextesVus: ContexteDiagnosticNormalise[] } {
  const contextesVus: ContexteDiagnosticNormalise[] = [];
  return {
    ...creerClientSansCapacite('doublure'),
    mode: 'actif',
    raisonDegrade: null,
    contextesVus,
    diagnostiquerBrut: async (contexte): Promise<ResultatIa<ReponseBrute>> => {
      contextesVus.push(contexte);
      return {
        disponible: true,
        valeur: { texte, coutApi: 0.0123, apresRelance: false, modeleServi },
        coutApi: 0.0123,
      };
    },
  };
}

describe('clientRejouable — diagnostics, mode normal', () => {
  it('cassette présente : avis rejoué, estampillé, SANS toucher le réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), AVIS));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).diagnostiquer(contexteDeTest());
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur.avis).toBe(AVIS_AVEU);
    expect(resultat.valeur.provenance).toEqual({
      versionPrompt: VERSION,
      modeleDemande: MODELE,
      // Le modèle SERVI est rejoué depuis la cassette : un avis rejoué doit
      // nommer le modèle qui a réellement produit la réponse.
      modeleServi: MODELE_SERVI,
      apresRelance: false,
    });
    expect(resultat.coutApi).toBe(0.0123);
  });

  /** Les trois avis se rejouent de la même façon : l'aveu n'est pas un cas à part. */
  for (const avis of AVIS_ADMIS) {
    it(`rejoue « ${avis} » comme un avis disponible`, async () => {
      const depot = depotCassettesFichiers(await dossierNeuf());
      const contexte = contexteDeTest({ groupe: `g-${avis}` });
      await depot.ecrire(cassetteDe(cleDe(contexte), JSON.stringify({ avis, justification: 'motif du journal' })));

      const resultat = await clientRejouable(clientQuiExplose(), depot, options).diagnostiquer(contexte);
      expect(resultat.disponible).toBe(true);
      if (!resultat.disponible) return;
      expect(resultat.valeur.avis).toBe(avis);
    });
  }

  it('cassette absente : indisponible, message nommant la commande, SANS réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const journal: { type: string; details?: unknown }[] = [];
    const resultat = await clientRejouable(clientQuiExplose(), depot, {
      ...options,
      journaliser: (type, details) => journal.push({ type, details }),
    }).diagnostiquer(contexteDeTest());

    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
    if (resultat.disponible) return;
    expect(resultat.message).toContain(COMMANDE_ENREGISTREMENT_IA);
    expect(journal).toContainEqual({
      type: 'ia.cassette.absente',
      details: { cle: cleDe(), commande: COMMANDE_ENREGISTREMENT_IA },
    });
  });

  /**
   * Un journal différent est une clé différente : la cassette manque, et c'est
   * un échec BRUYANT — jamais un appel réseau glissé dans une notation, jamais
   * l'avis du voisin servi à la place.
   */
  it('un journal différent ne rejoue PAS la cassette voisine', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), AVIS));

    const autre = contexteDeTest({ extraits: ['tentative 1 viewport=bureau reproduite=true dureeMs=812'] });
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).diagnostiquer(autre);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
  });

  /**
   * Ce que l'appelant n'a PAS tronqué n'entre pas dans la clé : deux contextes
   * qui produisent le même prompt borné produisent la même clé. Sans quoi une
   * borne appliquée au prompt seul laisserait le parc dépendre de la discipline
   * de l'appelant.
   */
  it('deux contextes que la borne rend identiques partagent la même cassette', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const long = 'w'.repeat(diagnosticConfig.extraitsMaxChars + 10);
    const encorePlusLong = 'w'.repeat(diagnosticConfig.extraitsMaxChars + 900);
    await depot.ecrire(cassetteDe(cleDe(contexteDeTest({ extraits: [long] })), AVIS));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).diagnostiquer(
      contexteDeTest({ extraits: [encorePlusLong] }),
    );
    expect(resultat.disponible).toBe(true);
  });

  /**
   * Le rejeu ne s'accorde aucune tolérance que la production n'a pas : une
   * réponse figée dont l'avis n'appartient pas au contrat est rejetée au rejeu
   * comme elle l'aurait été à chaud.
   */
  it('une cassette dont l’avis n’appartient pas au contrat est refusée', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const contexte = contexteDeTest();
    await depot.ecrire(
      cassetteDe(cleDe(contexte), JSON.stringify({ avis: 'reseau-site', justification: 'motif' })),
    );

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).diagnostiquer(contexte);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_DIAGNOSTIC_INVALIDE });
  });
});

describe('clientRejouable — diagnostics, mode enregistrement', () => {
  it('appelle le client, écrit la cassette avec ses métadonnées et rend l’avis', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(AVIS);
    const decore = clientRejouable(client, depot, {
      ...options,
      enregistrement: true,
      maintenant: () => new Date('2026-09-24T12:00:00.000Z'),
    });

    const resultat = await decore.diagnostiquer(contexteDeTest());
    expect(resultat.disponible).toBe(true);

    expect(await depot.lire(cleDe())).toEqual({
      cle: cleDe(),
      metadonnees: {
        date: '2026-09-24T12:00:00.000Z',
        modeleDemande: MODELE,
        modeleServi: MODELE_SERVI,
        versionPrompt: VERSION,
        coutApi: 0.0123,
        apresRelance: false,
      },
      reponse: AVIS,
    });
  });

  /**
   * Le client concret reçoit le contexte NORMALISÉ, celui-là même qui a servi à
   * calculer la clé : une cassette ne peut pas être enregistrée sous la clé
   * d'un prompt et produite par un autre.
   */
  it('le client reçoit le contexte NORMALISÉ, celui qui a servi à calculer la clé', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(AVIS);
    const brut = contexteDeTest({ groupe: 'g-x\navec un saut de ligne' });
    await clientRejouable(client, depot, { ...options, enregistrement: true }).diagnostiquer(brut);

    expect(client.contextesVus).toHaveLength(1);
    expect(client.contextesVus[0]).toEqual(normaliserContexteDiagnostic(brut, diagnosticConfig));
    expect(client.contextesVus[0]?.groupe).not.toContain('\n');
  });

  /** La garde à deux diagnostics s'applique inchangée aux cassettes de diagnostic. */
  it('refuse une réponse DIFFÉRENTE sous une clé existante, et nomme la vraie cause', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cle = cleDe();
    await depot.ecrire(cassetteDe(cle, AVIS));

    const autreAvis = JSON.stringify({ avis: 'outil', justification: 'rejeu interrompu' });
    await expect(depot.ecrire(cassetteDe(cle, autreAvis))).rejects.toThrow(DIVERGENCE_PROMPT_SANS_INCREMENT);
    await expect(depot.ecrire(cassetteDe(cle, autreAvis, `${MODELE}-20260901`))).rejects.toThrow(
      DIVERGENCE_GLISSEMENT_ALIAS,
    );
  });
});

/**
 * L'empreinte de contrat couvre ce que `VERSION` ne protège pas : les bornes de
 * config ET le vocabulaire des avis, tous deux écrits en toutes lettres dans le
 * prompt.
 */
describe('empreinteContratDiagnostic', () => {
  it('change quand une borne qui compose le prompt change', () => {
    const autre = { ...diagnosticConfig, extraitsMaxChars: diagnosticConfig.extraitsMaxChars + 1 };
    expect(empreinteContratDiagnostic(autre)).not.toBe(EMPREINTE);
  });

  it('ne change PAS pour un réglage étranger au prompt et à l’appel', () => {
    for (const autre of [
      { ...diagnosticConfig, relancesMax: diagnosticConfig.relancesMax + 1 },
      { ...diagnosticConfig, groupesMax: diagnosticConfig.groupesMax + 1 },
      { ...diagnosticConfig, facteurConfianceDecouverte: diagnosticConfig.facteurConfianceDecouverte / 2 },
      { ...diagnosticConfig, actif: !diagnosticConfig.actif },
    ]) {
      expect(empreinteContratDiagnostic(autre)).toBe(EMPREINTE);
    }
  });
});
