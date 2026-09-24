/**
 * Le rejeu des RÉDACTIONS : une cassette par rapport, la même clé, la même
 * garde réseau et la même garde d'écriture que les trois autres capacités.
 *
 * ── LE MÊME TROU, AU MÊME ENDROIT, À UN NOM PRÈS ────────────────────────────
 *
 * La brique 4c a trouvé et refermé un passe-plat sur `diagnostiquer` :
 * `clientRejouable` transmettait l'appel au client décoré, ce qui était sans
 * conséquence tant qu'aucun client ne savait diagnostiquer — et devenait un
 * chemin d'appel RÉSEAU depuis un run normal du banc le jour où l'un d'eux a
 * su. `rediger` portait EXACTEMENT le même passe-plat, et la brique 5 est
 * précisément le jour où un client a su.
 *
 * La première suite ci-dessous existe pour cela, et elle est écrite de la
 * seule façon qui prouve une garde : en faisant exploser la doublure si le
 * réseau est touché.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { VERSION } from '../../prompts/redaction/v1.js';
import {
  chargerConfigDiagnostic,
  chargerConfigProfilage,
  chargerConfigRapport,
  chargerConfigScanner,
} from '../scanner/config.js';
import {
  COMMANDE_ENREGISTREMENT_IA,
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_CASSETTE_ABSENTE,
  RAISON_REDACTION_INVALIDE,
  bornerContexteRedaction,
  chargerConfigNavigation,
  cleCassetteRedaction,
  clientRejouable,
  creerClientSansCapacite,
  depotCassettesFichiers,
  empreinteContratRapport,
  type Cassette,
  type ClientIaEnregistrable,
  type ContexteRedaction,
  type SectionFaits,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';

const configScanner = await chargerConfigScanner();
const profilage = await chargerConfigProfilage();
const navigation = await chargerConfigNavigation(configScanner.exploration);
const rapportConfig = await chargerConfigRapport();

const MODELE = configScanner.ia.modeles.redaction;
/** Forme résolue, volontairement distincte de l'alias : c'est le cas normal. */
const MODELE_SERVI = `${MODELE}-20260401`;
const EMPREINTE = empreinteContratRapport(rapportConfig);

const options = {
  enregistrement: false,
  modele: configScanner.ia.modeles.profilage,
  profilage,
  decision: { modele: configScanner.ia.modeles.navigation, config: navigation },
  diagnostic: { modele: configScanner.ia.modeles.diagnostic, config: await chargerConfigDiagnostic() },
  redaction: { modele: MODELE, config: rapportConfig },
};

function sectionDeTest(id: string): SectionFaits {
  return {
    id,
    lignes: ['catégorie: fonctionnel', 'gravité: bloquant', 'statut: confirmee', 'symptôme technique: bouton-sans-effet', 'pages: /contact (mobile)'],
  };
}

function contexteDeTest(surcharges: Partial<ContexteRedaction> = {}): ContexteRedaction {
  return {
    langue: 'fr',
    enTete: ['type de site: vitrine-contact'],
    sections: [sectionDeTest('s1')],
    ...surcharges,
  };
}

const REDACTION = JSON.stringify({
  synthese: 'Un défaut empêche vos visiteurs de vous écrire.',
  ligneMethode: 'Chaque signalement est re-vérifié avant d’être publié.',
  sections: [
    {
      sectionId: 's1',
      titre: 'Le bouton d’envoi ne répond pas',
      constat: 'Un clic sur le bouton ne déclenche rien.',
      impact: 'Tant que ce défaut persiste, aucune demande ne vous parvient.',
      actionSuggeree: 'Faire vérifier le script du formulaire de contact.',
    },
  ],
});

const dossiers: string[] = [];
async function dossierNeuf(): Promise<string> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-redactions-'));
  dossiers.push(dossier);
  return dossier;
}
afterAll(async () => {
  await Promise.all(dossiers.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

function cleDe(contexte: ContexteRedaction = contexteDeTest()): string {
  return cleCassetteRedaction({
    versionPrompt: VERSION,
    empreinteContrat: EMPREINTE,
    modele: MODELE,
    contexte: bornerContexteRedaction(contexte, rapportConfig),
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
      coutApi: 0.0456,
      apresRelance,
    },
    reponse,
  };
}

/** Client qui EXPLOSE si on l'appelle : une garde ne se relit pas, elle se déclenche. */
function clientQuiExplose(): ClientIaEnregistrable {
  return {
    ...creerClientSansCapacite('doublure'),
    redigerBrut: async (): Promise<ResultatIa<ReponseBrute>> => {
      throw new Error('le réseau a été touché depuis un run normal');
    },
  };
}

function clientQuiEnregistre(
  texte: string,
  modeleServi = MODELE_SERVI,
): ClientIaEnregistrable & { contextesVus: ContexteRedaction[] } {
  const contextesVus: ContexteRedaction[] = [];
  return {
    ...creerClientSansCapacite('doublure'),
    mode: 'actif',
    raisonDegrade: null,
    contextesVus,
    redigerBrut: async (contexte): Promise<ResultatIa<ReponseBrute>> => {
      contextesVus.push(contexte);
      return { disponible: true, valeur: { texte, coutApi: 0.0456, apresRelance: false, modeleServi }, coutApi: 0.0456 };
    },
  };
}

describe('clientRejouable — rédactions, mode normal', () => {
  it('cassette présente : prose rejouée, estampillée, SANS toucher le réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), REDACTION));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).rediger(contexteDeTest());
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur.sections[0]?.sectionId).toBe('s1');
    expect(resultat.valeur.provenance).toEqual({
      versionPrompt: VERSION,
      modeleDemande: MODELE,
      // Le modèle SERVI est rejoué depuis la cassette : une prose rejouée doit
      // nommer le modèle qui l'a réellement écrite.
      modeleServi: MODELE_SERVI,
      apresRelance: false,
    });
    expect(resultat.coutApi).toBe(0.0456);
  });

  it('cassette ABSENTE : indisponibilité nommée, commande citée, et AUCUN appel', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).rediger(contexteDeTest());
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
    expect(resultat.disponible ? '' : resultat.message).toContain(COMMANDE_ENREGISTREMENT_IA);
  });

  it('deux LANGUES sont deux cassettes : le croisé du banc en dépend', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(contexteDeTest({ langue: 'fr' })), REDACTION));
    const client = clientRejouable(clientQuiExplose(), depot, options);

    await expect(client.rediger(contexteDeTest({ langue: 'fr' }))).resolves.toMatchObject({ disponible: true });
    // La cassette française n'est PAS rejouée pour un rapport anglais : ce
    // serait servir une prose française à un lecteur anglophone.
    await expect(client.rediger(contexteDeTest({ langue: 'en' }))).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_CASSETTE_ABSENTE,
    });
  });

  it('le validateur est construit sur l’énumération DU MOMENT : une cassette périmée est rejetée au rejeu', async () => {
    // Le rejeu ne s'accorde aucune tolérance que la production n'a pas — sans
    // quoi l'instrument mesurerait un moteur plus permissif que le vrai.
    const depot = depotCassettesFichiers(await dossierNeuf());
    const contexte = contexteDeTest({ sections: [sectionDeTest('s1'), sectionDeTest('s2')] });
    await depot.ecrire(cassetteDe(cleDe(contexte), REDACTION));

    await expect(clientRejouable(clientQuiExplose(), depot, options).rediger(contexte)).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_REDACTION_INVALIDE,
    });
  });

  it('une cassette dont la prose porte un CHIFFRE est rejetée au rejeu comme elle l’aurait été à chaud', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const chiffree = JSON.stringify({ ...JSON.parse(REDACTION), synthese: 'Nous avons relevé 2 défauts.' });
    await depot.ecrire(cassetteDe(cleDe(), chiffree));

    await expect(clientRejouable(clientQuiExplose(), depot, options).rediger(contexteDeTest())).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_REDACTION_INVALIDE,
    });
  });
});

describe('clientRejouable — rédactions, mode enregistrement', () => {
  it('écrit la cassette avec ses métadonnées complètes, et rend la valeur', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(REDACTION);
    const resultat = await clientRejouable(client, depot, { ...options, enregistrement: true }).rediger(contexteDeTest());

    expect(resultat).toMatchObject({ disponible: true });
    const ecrite = await depot.lire(cleDe());
    expect(ecrite?.metadonnees).toMatchObject({
      modeleDemande: MODELE,
      modeleServi: MODELE_SERVI,
      versionPrompt: VERSION,
      coutApi: 0.0456,
      apresRelance: false,
    });
  });

  it('le client décoré reçoit le contexte BORNÉ : la cassette fige la réponse du prompt qui a calculé sa clé', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const client = clientQuiEnregistre(REDACTION);
    const debordant = contexteDeTest({ sections: [sectionDeTest('s1'), sectionDeTest('s2'), sectionDeTest('s3')] });
    await clientRejouable(client, depot, {
      ...options,
      enregistrement: true,
      redaction: { modele: MODELE, config: { ...rapportConfig, sectionsMax: 1 } },
    }).rediger(debordant);
    expect(client.contextesVus[0]?.sections.map((section) => section.id)).toEqual(['s1']);
  });

  it('refuse une réponse DIFFÉRENTE sous une clé existante, et nomme la vraie cause', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cle = cleDe();
    await depot.ecrire(cassetteDe(cle, REDACTION));
    const autre = JSON.stringify({ ...JSON.parse(REDACTION), synthese: 'Une autre synthèse.' });

    // Modèle servi IDENTIQUE : prompt modifié sans incrément, ou variabilité
    // propre du modèle. La garde nomme les deux sans trancher — prétendre le
    // contraire serait le défaut qu'elle existe pour éviter.
    await expect(depot.ecrire(cassetteDe(cle, autre))).rejects.toThrow(DIVERGENCE_PROMPT_SANS_INCREMENT);
    // Modèle servi DIFFÉRENT : l'alias a glissé vers un autre instantané. Le
    // parc est à renouveler, et le versionnement du prompt n'y est pour rien.
    await expect(depot.ecrire(cassetteDe(cle, autre, `${MODELE}-20270101`))).rejects.toThrow(DIVERGENCE_GLISSEMENT_ALIAS);
  });

  it('réécrire la MÊME réponse ne touche pas le fichier : la cassette committée reste stable', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe(cleDe(), REDACTION));
    await expect(
      clientRejouable(clientQuiEnregistre(REDACTION), depot, { ...options, enregistrement: true }).rediger(contexteDeTest()),
    ).resolves.toMatchObject({ disponible: true });
  });
});
