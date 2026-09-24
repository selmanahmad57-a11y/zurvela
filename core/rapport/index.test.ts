/**
 * L'ORCHESTRATION du rapport business, de bout en bout.
 *
 * Ce que ces tests éprouvent tient en une phrase : le rapport EXISTE toujours,
 * et il ne ment jamais. Quatre chemins y mènent — la rédaction réussie, le
 * mode dégradé, le site sain, et la langue non supportée — et aucun ne doit
 * produire un rapport faux, ni un rapport absent.
 */
import { describe, expect, it } from 'vitest';
import type { ClientIa, RedactionEstampillee, ResultatIa } from '../ia/index.js';
import { RAISON_CASSETTE_ABSENTE } from '../ia/index.js';
import { MOTIF_CONSTATEE_AU_REJEU } from '../scanner/confirmation/decouvertes.js';
import { CONFIG_RAPPORT_TEST, anomalie, rapportTechnique, resultatGroupe, tentative } from './aide-tests.js';
import {
  EVENEMENT_ECHEANCE_DEPASSEE,
  EVENEMENT_LANGUE_NON_SUPPORTEE,
  EVENEMENT_REDIGE,
  EVENEMENT_SANS_PROSE,
  EVENEMENT_SANS_SECTION,
  EVENEMENT_SECTION_NON_SITUEE,
  RAISON_ECHEANCE_REDACTION,
  redigerRapportBusiness,
} from './index.js';
import { rendreRapport } from './rendu.js';

const PROVENANCE = {
  versionPrompt: 'v1',
  modeleDemande: 'claude-opus-5',
  modeleServi: 'claude-opus-5-20260101',
  apresRelance: false,
};

/** Client muet : le mode dégradé, exactement celui d'un scan sans clé. */
const clientMuet: ClientIa = {
  mode: 'degrade',
  raisonDegrade: RAISON_CASSETTE_ABSENTE,
  profiler: async () => ({ disponible: false, raison: RAISON_CASSETTE_ABSENTE }),
  decider: async () => ({ disponible: false, raison: RAISON_CASSETTE_ABSENTE }),
  diagnostiquer: async () => ({ disponible: false, raison: RAISON_CASSETTE_ABSENTE }),
  rediger: async () => ({ disponible: false, raison: RAISON_CASSETTE_ABSENTE, coutApi: 0.004 }),
};

/** Client qui rédige : une phrase par champ, aucun chiffre, un identifiant par section. */
function clientQuiRedige(): ClientIa & { appelsFaits: number } {
  const etat = { appels: 0 };
  return {
    mode: 'actif',
    raisonDegrade: null,
    profiler: async () => ({ disponible: false, raison: 'hors-sujet' }),
    decider: async () => ({ disponible: false, raison: 'hors-sujet' }),
    diagnostiquer: async () => ({ disponible: false, raison: 'hors-sujet' }),
    rediger: async (contexte): Promise<ResultatIa<RedactionEstampillee>> => {
      etat.appels += 1;
      return {
        disponible: true,
        coutApi: 0.031,
        valeur: {
          synthese: `Synthèse en ${contexte.langue}.`,
          ligneMethode: 'Chaque signalement est re-vérifié avant publication.',
          sections: contexte.sections.map((section) => ({
            sectionId: section.id,
            titre: `Titre ${section.id}`,
            constat: `Constat ${section.id}`,
            impact: `Impact ${section.id}`,
            actionSuggeree: `Action ${section.id}`,
          })),
          provenance: PROVENANCE,
        },
      };
    },
    get appelsFaits() {
      return etat.appels;
    },
  } as ClientIa & { appelsFaits: number };
}

function journalDe(): { journaliser: (type: string, details?: unknown) => void; types: string[]; entrees: { type: string; details?: unknown }[] } {
  const entrees: { type: string; details?: unknown }[] = [];
  return {
    entrees,
    get types() {
      return entrees.map((entree) => entree.type);
    },
    journaliser: (type, details) => entrees.push({ type, details }),
  };
}

describe('redigerRapportBusiness — la rédaction aboutie', () => {
  it('pose la prose DANS les champs, sans toucher un seul fait', async () => {
    const rapport = rapportTechnique();
    const journal = journalDe();
    const { rapportBusiness, coutApi } = await redigerRapportBusiness({
      rapport,
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journal.journaliser,
      echeance: null,
    });

    expect(rapportBusiness.sansProse).toBe(false);
    expect(rapportBusiness.synthese).toBe('Synthèse en fr.');
    const section = rapportBusiness.sections[0];
    expect(section?.titre).toBe('Titre s1');
    // Les FAITS sont ceux de la structure, pas ceux d'une réponse de modèle.
    expect(section?.statut).toBe('confirmee');
    expect(section?.gravite).toBe('bloquant');
    expect(section?.statutFormule).toBe('Constaté, puis reproduit lors de nos 2 vérifications indépendantes.');
    expect(rapportBusiness.provenance).toEqual(PROVENANCE);
    expect(coutApi).toBe(0.031);
    expect(journal.types).toContain(EVENEMENT_REDIGE);
  });

  it('un modèle qui rend des faits ne peut PAS les substituer : seuls quatre champs sont recopiés', async () => {
    // Le modèle n'a aucun champ de fait dans son contrat. Même s'il en
    // inventait un, l'application de la prose recopie les faits de la
    // structure et pose le texte par-dessus — jamais l'inverse.
    const hostile: ClientIa = {
      ...clientQuiRedige(),
      rediger: async (contexte): Promise<ResultatIa<RedactionEstampillee>> => ({
        disponible: true,
        coutApi: 0,
        valeur: {
          synthese: 'Tout fonctionne.',
          ligneMethode: 'Méthode.',
          sections: contexte.sections.map((section) => ({
            sectionId: section.id,
            titre: 'Titre',
            constat: 'Constat',
            impact: 'Impact',
            actionSuggeree: 'Action',
            statut: 'confirmee',
            gravite: 'mineur',
          })) as never,
          provenance: PROVENANCE,
        },
      }),
    };
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique({ anomalies: [anomalie('g1', { gravite: 'bloquant' })], groupes: [] }),
      config: CONFIG_RAPPORT_TEST,
      ia: hostile,
      journaliser: journalDe().journaliser,
      echeance: null,
    });
    expect(rapportBusiness.sections[0]?.gravite).toBe('bloquant');
  });
});

describe('redigerRapportBusiness — le rapport existe TOUJOURS', () => {
  it('mode dégradé : rapport STRUCTUREL, lisible, statuts corrects, zéro prose', async () => {
    const journal = journalDe();
    const { rapportBusiness, coutApi } = await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: clientMuet,
      journaliser: journal.journaliser,
      echeance: null,
    });

    expect(rapportBusiness.sansProse).toBe(true);
    expect(rapportBusiness.sections).toHaveLength(1);
    expect(rapportBusiness.sections[0]?.statutFormule).not.toBe('');
    expect(rapportBusiness.sections[0]?.localisations).not.toHaveLength(0);
    expect(rapportBusiness.provenance).toBeUndefined();
    // Le coût DÉPENSÉ sans rien produire reste compté : un coût invisible ment.
    expect(coutApi).toBe(0.004);
    expect(journal.types).toContain(EVENEMENT_SANS_PROSE);
  });

  it('site SAIN : aucune section, aucun appel payé, et le rapport le dit', async () => {
    // Un site sans anomalie ne doit pas coûter un appel de modèle pour qu'on
    // lui écrive qu'il va bien.
    const client = clientQuiRedige();
    const journal = journalDe();
    const { rapportBusiness, coutApi } = await redigerRapportBusiness({
      rapport: rapportTechnique({ anomalies: [], groupes: [] }),
      config: CONFIG_RAPPORT_TEST,
      ia: client,
      journaliser: journal.journaliser,
      echeance: null,
    });
    expect(rapportBusiness.sections).toHaveLength(0);
    expect(coutApi).toBe(0);
    expect(journal.types).toContain(EVENEMENT_SANS_SECTION);
  });

  it('ÉCHÉANCE dépassée : aucun appel engagé, rien de facturé, et la raison est journalisée', async () => {
    // La porte est consultée AVANT de dépenser. Un appel engagé hors délai
    // coûte de l'argent pour un rapport que personne n'attendra plus — et
    // c'est le cas NOMINAL d'un gros site, pas un cas de bord : le protocole
    // de confirmation est piloté par la même échéance et la consomme.
    const client = clientQuiRedige();
    const journal = journalDe();
    const { rapportBusiness, coutApi } = await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: client,
      journaliser: journal.journaliser,
      echeance: 1_000,
      // Une échéance ne se teste pas en attendant vraiment.
      maintenant: () => 1_000,
    });
    expect(client.appelsFaits).toBe(0);
    expect(coutApi).toBe(0);
    expect(rapportBusiness.sansProse).toBe(true);
    expect(rapportBusiness.sections).toHaveLength(1);
    expect(journal.entrees.find((entree) => entree.type === EVENEMENT_ECHEANCE_DEPASSEE)?.details).toMatchObject({
      raison: RAISON_ECHEANCE_REDACTION,
      nbSections: 1,
    });
  });

  it('ÉCHÉANCE non atteinte : la porte laisse passer — sans quoi le contrôle précédent ne prouverait rien', async () => {
    const client = clientQuiRedige();
    const journal = journalDe();
    await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: client,
      journaliser: journal.journaliser,
      echeance: 1_001,
      maintenant: () => 1_000,
    });
    expect(client.appelsFaits).toBe(1);
    expect(journal.types).not.toContain(EVENEMENT_ECHEANCE_DEPASSEE);
  });

  it('rapport PARTIEL : la prose ne couvre pas tout, le compte le dit et le rendu le signale', async () => {
    // La rédaction se fait en un appel sur un bloc de faits BORNÉ. Quand une
    // section en sort, elle reste publiée sans explication : le compte des
    // sections rédigées est ce qui permet au rendu de le dire.
    const partiel: ClientIa = {
      mode: 'actif',
      raisonDegrade: null,
      profiler: async () => ({ disponible: false, raison: 'hors-sujet' }),
      decider: async () => ({ disponible: false, raison: 'hors-sujet' }),
      diagnostiquer: async () => ({ disponible: false, raison: 'hors-sujet' }),
      rediger: async (contexte): Promise<ResultatIa<RedactionEstampillee>> => ({
        disponible: true,
        coutApi: 0.02,
        valeur: {
          synthese: 'Synthèse partielle.',
          ligneMethode: 'Chaque signalement est re-vérifié avant publication.',
          // Une seule section rédigée : exactement ce que produit une éviction
          // par la borne de faits.
          sections: contexte.sections.slice(0, 1).map((section) => ({
            sectionId: section.id,
            titre: `Titre ${section.id}`,
            constat: `Constat ${section.id}`,
            impact: `Impact ${section.id}`,
            actionSuggeree: `Action ${section.id}`,
          })),
          provenance: PROVENANCE,
        },
      }),
    };
    const journal = journalDe();
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique({
        anomalies: [anomalie('g1'), anomalie('g2', { categorie: 'visuel', gravite: 'mineur' })],
        groupes: [
          resultatGroupe('g1', [tentative(1, true), tentative(2, true)]),
          resultatGroupe('g2', [tentative(1, true), tentative(2, true)]),
        ],
      }),
      config: CONFIG_RAPPORT_TEST,
      ia: partiel,
      journaliser: journal.journaliser,
      echeance: null,
    });
    expect(rapportBusiness.sections).toHaveLength(2);
    expect(rapportBusiness.nbSectionsRedigees).toBe(1);
    // `sansProse` reste FAUX — il y a bien de la prose : c'est précisément
    // pourquoi il ne suffit pas à décrire ce rapport-là.
    expect(rapportBusiness.sansProse).toBe(false);
    expect(rendreRapport(rapportBusiness)).toContain('n’a pas été rédigé');
  });

  it('une anomalie NON SITUÉE est journalisée, jamais publiée sous un statut faux', async () => {
    const orpheline = { ...anomalie('g9'), verdict: undefined };
    const journal = journalDe();
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique({ anomalies: [anomalie('g1'), orpheline], groupes: [] }),
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journal.journaliser,
      echeance: null,
    });
    expect(rapportBusiness.sections).toHaveLength(1);
    expect(journal.types).toContain(EVENEMENT_SECTION_NON_SITUEE);
  });
});

describe('la LANGUE du rapport', () => {
  it('celle du scan prime sur celle de la config : un site anglais peut se lire en français', async () => {
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journalDe().journaliser,
      langueDemandee: 'en',
      echeance: null,
    });
    expect(rapportBusiness.langue).toBe('en');
    expect(rapportBusiness.sections[0]?.statutFormule).toBe('Observed, then reproduced in each of our 2 independent re-checks.');
  });

  it('une langue SANS formulations vérifiées retombe sur celle de la config, et le DIT', async () => {
    // Le modèle sait écrire l'allemand ; nous n'avons pas relu les
    // formulations de statut en allemand. Servir un statut français à un
    // lecteur allemand serait une promesse dont on ne connaît pas la teneur —
    // et un rapport absent serait pire. Le journal porte l'écart, et le banc,
    // qui compare la langue rendue à la langue demandée, le voit rouge.
    const journal = journalDe();
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journal.journaliser,
      echeance: null,
      langueDemandee: 'de',
    });
    expect(rapportBusiness.langue).toBe('fr');
    expect(journal.entrees.find((entree) => entree.type === EVENEMENT_LANGUE_NON_SUPPORTEE)?.details).toMatchObject({
      demandee: 'de',
      appliquee: 'fr',
    });
  });

  it('une CONFIG dont la langue n’a pas de formulations lève au premier usage, plutôt que jamais', async () => {
    // Le schéma JSON ne peut pas connaître la liste (elle vit en code) : la
    // configuration est donc vérifiée ici, bruyamment.
    await expect(
      redigerRapportBusiness({
        rapport: rapportTechnique(),
        config: { ...CONFIG_RAPPORT_TEST, langueRapport: 'de' },
        ia: clientQuiRedige(),
        journaliser: journalDe().journaliser,
      echeance: null
      }),
    ).rejects.toThrow('langueRapport');
  });
});

describe('les quatre statuts, de bout en bout', () => {
  it('chacun arrive dans le rapport avec sa formulation propre', async () => {
    const rapport = rapportTechnique({
      anomalies: [
        anomalie('g1', { verdict: 'confirmee' }),
        anomalie('g2', { verdict: 'intermittente' }),
        anomalie('g3', { motif: MOTIF_CONSTATEE_AU_REJEU }),
        anomalie('g4', { motif: 'diagnostic-site' }),
      ],
      groupes: [
        resultatGroupe('g1', [tentative(1, true), tentative(2, true)]),
        resultatGroupe('g2', [tentative(1, true), tentative(2, false)], 'intermittente'),
      ],
    });
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport,
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journalDe().journaliser,
      echeance: null,
    });
    const parGroupe = new Map(rapportBusiness.sections.map((section) => [section.groupe, section]));
    expect(parGroupe.get('g1')?.statut).toBe('confirmee');
    expect(parGroupe.get('g2')?.statut).toBe('intermittente');
    expect(parGroupe.get('g3')?.statut).toBe('constatee-au-rejeu');
    expect(parGroupe.get('g4')?.statut).toBe('diagnostic-site');
    expect(new Set(rapportBusiness.sections.map((section) => section.statutFormule)).size).toBe(4);
  });
});

/**
 * DE BOUT EN BOUT : de `redigerRapportBusiness` au texte rendu.
 *
 * La revue a relevé que la garantie « un site sain n'est pas déclaré dégradé »
 * n'était éprouvée que sur un `RapportBusiness` fabriqué à la main, jamais sur
 * la sortie réelle du moteur. Une régression du couplage `sections: []` /
 * `sansProse: true` aurait rompu la garde du rendu sans faire échouer un seul
 * test.
 */
describe('du moteur au texte : la chaîne complète', () => {
  it('un site SAIN produit un rapport lisible qui n’annonce aucune panne de rédaction', async () => {
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique({ anomalies: [], groupes: [] }),
      config: CONFIG_RAPPORT_TEST,
      ia: clientQuiRedige(),
      journaliser: journalDe().journaliser,
      echeance: null,
    });
    const texte = rendreRapport(rapportBusiness);
    expect(texte).toContain('Aucune anomalie n’a été retenue');
    expect(texte).not.toContain('n’a pas pu être produite');
  });

  it('un scan AVEC anomalies mais SANS IA annonce, lui, sa forme structurée', async () => {
    const { rapportBusiness } = await redigerRapportBusiness({
      rapport: rapportTechnique(),
      config: CONFIG_RAPPORT_TEST,
      ia: clientMuet,
      journaliser: journalDe().journaliser,
      echeance: null,
    });
    const texte = rendreRapport(rapportBusiness);
    expect(texte).toContain('sous sa forme structurée');
    // Et il reste lisible : statut, gravité, localisation.
    expect(texte).toContain('Constaté, puis reproduit lors de nos 2 vérifications indépendantes.');
    expect(texte).toContain('/contact');
  });
});
