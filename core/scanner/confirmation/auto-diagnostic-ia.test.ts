/**
 * Le DÉCLENCHEMENT, ses trois bornes, et le mode dégradé.
 *
 * Ce que ces tests gardent avant tout, c'est l'ABSENCE d'appel : un modèle
 * consulté sur un groupe retenu, sur une cause déjà traitée par la mécanique,
 * ou au-delà du plafond, ce serait de l'argent dépensé pour reformuler ce que
 * le code sait déjà — et, dans le premier cas, une écriture sur un groupe que
 * le diagnostic ne doit jamais toucher.
 */
import { describe, expect, it } from 'vitest';
import type { ClientIa, ContexteDiagnostic, DiagnosticEstampille, ResultatIa } from '../../ia/index.js';
import type { AvisDiagnostic, ContexteConfirmation, EntreeJournal, ResultatGroupe, TentativeReexecution } from '../../types.js';
import type { ConfigDiagnostic } from '../config.js';
import { autoDiagnosticMecanique, MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE } from './auto-diagnostic.js';
import {
  creerAutoDiagnosticIa,
  estResidu,
  NOM_AUTO_DIAGNOSTIC_IA,
  RAISON_APPEL_LEVE,
  RAISON_DIAGNOSTIC_INACTIF,
  RAISON_PLAFOND_GROUPES,
  TYPE_JOURNAL_DIAGNOSTIC,
  TYPE_JOURNAL_DIAGNOSTIC_ABSENT,
} from './auto-diagnostic-ia.js';
import { consolider } from './consolidation.js';
import { candidateSimulee, contexteConfirmation, reexecuteurFactice } from './fabriques-test.js';
import {
  MOTIF_DECOUVERTE_DIAGNOSTIC_SITE,
  MOTIF_DIAGNOSTIC_INDETERMINE,
  MOTIF_DIAGNOSTIC_OUTIL,
  MOTIF_DIAGNOSTIC_SITE_ECARTE,
} from './pont-vocabulaires.js';

const CONFIG: ConfigDiagnostic = {
  actif: true,
  groupesMax: 3,
  extraitsMaxChars: 4000,
  extraitsMaxParGroupe: 12,
  maxTokensReponse: 512,
  relancesMax: 1,
  facteurConfianceDecouverte: 0.6,
};

/** Les plafonds de `CONFIG_CONFIRMATION_TEST.rejeu` : ils entrent dans les extraits, pas dans la décision. */
const BUDGETS_REJEU = { chargementPageMs: 15000, actionMs: 10000 };

const PROVENANCE = { versionPrompt: 'v1', modeleDemande: 'claude-opus-5', modeleServi: 'claude-opus-5-20260101', apresRelance: false };

/** Client IA factice : il n'enregistre QUE ce qu'on lui a demandé, et ce qu'il a répondu. */
function clientFactice(reponse: ResultatIa<DiagnosticEstampille>): ClientIa & { appels: ContexteDiagnostic[] } {
  const appels: ContexteDiagnostic[] = [];
  const indisponible = <T>(): Promise<ResultatIa<T>> => Promise.resolve({ disponible: false, raison: 'hors-sujet' });
  return {
    appels,
    mode: 'actif',
    raisonDegrade: null,
    profiler: () => indisponible(),
    decider: () => indisponible(),
    rediger: () => indisponible(),
    diagnostiquer: (contexte: ContexteDiagnostic) => {
      appels.push(contexte);
      return Promise.resolve(reponse);
    },
  };
}

function avisRendu(avis: DiagnosticEstampille['avis'], coutApi = 0.0042): ResultatIa<DiagnosticEstampille> {
  return { disponible: true, valeur: { avis, justification: `prose libre sur ${avis}`, provenance: PROVENANCE }, coutApi };
}

function tentative(surcharges: Partial<TentativeReexecution> = {}): TentativeReexecution {
  return { numero: 1, viewport: 'desktop', reproduite: false, echecOutillage: false, dureeMs: 10, ...surcharges };
}

const RESIDU = tentative({ echecOutillage: true, causeEchec: 'indetermine', erreur: 'delai-depasse', dureeMs: 10_412 });

function resultat(tentatives: TentativeReexecution[], verdict: ResultatGroupe['verdict'], motif = 'rejeu-impossible'): ResultatGroupe {
  const groupe = consolider([candidateSimulee()])[0];
  if (groupe === undefined) {
    throw new Error('groupe-absent');
  }
  return {
    groupe,
    verdict,
    motif,
    tentatives,
    tauxReproduction: null,
    confianceInitiale: groupe.confiance,
    confianceFinale: groupe.confiance,
    coutApi: 0,
  };
}

function contexteAvecJournal(): { contexte: ContexteConfirmation; journal: EntreeJournal[] } {
  const journal: EntreeJournal[] = [];
  return { journal, contexte: contexteConfirmation({ journal, reexecuteur: reexecuteurFactice([]), detecteurs: [] }) };
}

describe('estResidu — ce que le diagnostic existe pour examiner', () => {
  it('une tentative `indetermine` sous un verdict de limite d’automatisation : c’est le résidu', () => {
    expect(estResidu(resultat([RESIDU], 'limite-automatisation'), 'limite-automatisation')).toBe(true);
  });

  it('une cause `outil` n’est PAS le résidu : elle a déjà son circuit mécanique', () => {
    expect(estResidu(resultat([tentative({ echecOutillage: true, causeEchec: 'outil' })], 'limite-automatisation'), 'limite-automatisation')).toBe(false);
  });

  it('une cause `reseau-site` n’est PAS le résidu : elle remonte par les découvertes du rejeu', () => {
    expect(estResidu(resultat([tentative({ echecOutillage: true, causeEchec: 'reseau-site' })], 'limite-automatisation'), 'limite-automatisation')).toBe(false);
  });

  it('un groupe RETENU n’est jamais le résidu, même avec une tentative `indetermine`', () => {
    for (const verdict of ['confirmee', 'intermittente'] as const) {
      expect(estResidu(resultat([RESIDU, tentative({ reproduite: true })], verdict), verdict)).toBe(false);
    }
  });

  it('un verdict écarté qui n’est pas la limite d’automatisation n’est pas le résidu : le rejeu a conclu', () => {
    expect(estResidu(resultat([RESIDU], 'non-reproduite'), 'non-reproduite')).toBe(false);
    expect(estResidu(resultat([RESIDU], 'basse-confiance'), 'basse-confiance')).toBe(false);
  });
});

describe('creerAutoDiagnosticIa — le déclenchement', () => {
  it('porte son nom et n’appelle le modèle QU’UNE FOIS par groupe', async () => {
    const client = clientFactice(avisRendu('outil'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const { contexte } = contexteAvecJournal();
    expect(diagnostic.nom).toBe(NOM_AUTO_DIAGNOSTIC_IA);

    await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexte);

    expect(client.appels).toHaveLength(1);
  });

  it('n’appelle PAS le modèle sur les deux autres causes d’échec', async () => {
    for (const causeEchec of ['outil', 'reseau-site'] as const) {
      const client = clientFactice(avisRendu('site'));
      const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
      await diagnostic.diagnostiquer(resultat([tentative({ echecOutillage: true, causeEchec })], 'limite-automatisation'), contexteAvecJournal().contexte);
      expect(client.appels).toEqual([]);
    }
  });

  it('n’appelle PAS le modèle sur un groupe retenu : aucune écriture du diagnostic ne touche un groupe confirmé', async () => {
    const client = clientFactice(avisRendu('site'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const groupeRetenu = resultat([RESIDU, tentative({ numero: 2, reproduite: true })], 'confirmee', 'reproduite');

    const avis = await diagnostic.diagnostiquer(groupeRetenu, contexteAvecJournal().contexte);

    expect(client.appels).toEqual([]);
    expect(avis).toBeNull();
  });

  it('EXAMINE le groupe que la règle mécanique vient de faire basculer : c’est exactement le silence visé', async () => {
    // Verdict brut `non-reproduite`, une tentative `indetermine` : la règle
    // mécanique rend `limite-automatisation`. Se fier au verdict BRUT ferait
    // rater le cas le plus fréquent du résidu.
    const client = clientFactice(avisRendu('site'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });

    const avis = await diagnostic.diagnostiquer(resultat([RESIDU, tentative({ numero: 2 })], 'non-reproduite', 'jamais-reproduite'), contexteAvecJournal().contexte);

    expect(client.appels).toHaveLength(1);
    expect(avis?.motif).toBe(MOTIF_DIAGNOSTIC_SITE_ECARTE);
  });

  it('respecte le plafond `groupesMax` PAR SCAN, et journalise l’absence comme DÉCLARÉE', async () => {
    const client = clientFactice(avisRendu('outil'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: { ...CONFIG, groupesMax: 2 } });
    const { contexte, journal } = contexteAvecJournal();

    for (let appel = 0; appel < 5; appel += 1) {
      await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexte);
    }

    expect(client.appels).toHaveLength(2);
    const absences = journal.filter((entree) => entree.type === TYPE_JOURNAL_DIAGNOSTIC_ABSENT);
    expect(absences).toHaveLength(3);
    expect(absences[0]?.details).toMatchObject({ raison: RAISON_PLAFOND_GROUPES, declaree: true, groupesMax: 2 });
  });

  it('le plafond est celui du SCAN : un second contexte repart avec son budget entier', async () => {
    const client = clientFactice(avisRendu('outil'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: { ...CONFIG, groupesMax: 1 } });

    await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexteAvecJournal().contexte);
    await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexteAvecJournal().contexte);

    expect(client.appels).toHaveLength(2);
  });

  it('la porte `actif` ferme tout, et l’absence est DÉCLARÉE', async () => {
    const client = clientFactice(avisRendu('site'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: { ...CONFIG, actif: false } });
    const { contexte, journal } = contexteAvecJournal();

    const avis = await diagnostic.diagnostiquer(resultat([RESIDU, tentative({ numero: 2 })], 'non-reproduite', 'jamais-reproduite'), contexte);

    expect(client.appels).toEqual([]);
    // Comportement STRICTEMENT identique à la brique 4b : l'avis mécanique, rien d'autre.
    expect(avis).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, coutApi: 0 });
    expect(journal.at(-1)?.details).toMatchObject({ raison: RAISON_DIAGNOSTIC_INACTIF, declaree: true });
  });
});

describe('creerAutoDiagnosticIa — ce que l’avis produit', () => {
  it('traduit par le pont, journalise avis, provenance, motif et coût, et porte la justification terminale', async () => {
    const client = clientFactice(avisRendu('site', 0.0031));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const { contexte, journal } = contexteAvecJournal();

    const avis = await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexte);

    expect(avis).toEqual({
      verdict: 'limite-automatisation',
      motif: MOTIF_DIAGNOSTIC_SITE_ECARTE,
      coutApi: 0.0031,
      decouverte: { facteurConfiance: 0.6, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
      provenance: PROVENANCE,
      justification: 'prose libre sur site',
    });
    const entree = journal.find((ligne) => ligne.type === TYPE_JOURNAL_DIAGNOSTIC);
    expect(entree?.details).toMatchObject({
      avis: 'site',
      verdict: 'limite-automatisation',
      motif: MOTIF_DIAGNOSTIC_SITE_ECARTE,
      provenance: PROVENANCE,
      justification: 'prose libre sur site',
      coutApi: 0.0031,
    });
  });

  it('un avis « outil » n’émet aucune découverte', async () => {
    const client = clientFactice(avisRendu('outil'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const avis = await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexteAvecJournal().contexte);
    expect(avis?.motif).toBe(MOTIF_DIAGNOSTIC_OUTIL);
    expect(avis?.decouverte).toBeUndefined();
  });

  it('un aveu `indetermine` est une RÉPONSE : le silence demeure, mais il est motivé', async () => {
    const client = clientFactice(avisRendu('indetermine'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const avis = await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexteAvecJournal().contexte);
    expect(avis).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_DIAGNOSTIC_INDETERMINE });
  });

  it('montre au modèle des EXTRAITS de journal, pas un objet du moteur : la clé, la description technique, et des lignes de journal', async () => {
    const client = clientFactice(avisRendu('outil'));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const cible = resultat([RESIDU], 'limite-automatisation');

    await diagnostic.diagnostiquer(cible, contexteAvecJournal().contexte);

    const contexteMontre = client.appels[0];
    expect(contexteMontre?.groupe).toBe(cible.groupe.cle);
    expect(contexteMontre?.description).toBe('reponse-5xx');
    expect(contexteMontre?.extraits.every((ligne) => ligne.startsWith('confirmation.'))).toBe(true);
  });
});

describe('creerAutoDiagnosticIa — mode dégradé', () => {
  const indisponible = (surcharges: Partial<{ coutApi: number }> = {}): ResultatIa<DiagnosticEstampille> => ({
    disponible: false,
    raison: 'cassette-absente',
    message: 'lancer la commande d’enregistrement',
    ...surcharges,
  });

  it('un appel indisponible rend EXACTEMENT l’avis mécanique : le diagnostic est un affineur, jamais un prérequis', async () => {
    const client = clientFactice(indisponible());
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });
    const { contexte, journal } = contexteAvecJournal();

    const avecIa = await diagnostic.diagnostiquer(resultat([RESIDU, tentative({ numero: 2 })], 'non-reproduite', 'jamais-reproduite'), contexte);
    const sansIa = await autoDiagnosticMecanique.diagnostiquer(
      resultat([RESIDU, tentative({ numero: 2 })], 'non-reproduite', 'jamais-reproduite'),
      contexte,
    );

    expect(avecIa).toEqual(sansIa);
    // L'absence est SUBIE : on a demandé, on n'a pas obtenu.
    expect(journal.find((ligne) => ligne.type === TYPE_JOURNAL_DIAGNOSTIC_ABSENT)?.details).toMatchObject({
      raison: 'cassette-absente',
      declaree: false,
      coutApi: 0,
    });
  });

  it('un appel qui a DÉPENSÉ avant d’échouer fait remonter son coût : un coût dépensé qui ne se voit pas est un coût qui ment', async () => {
    const client = clientFactice(indisponible({ coutApi: 0.0007 }));
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client, config: CONFIG });

    const avis: AvisDiagnostic | null = await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexteAvecJournal().contexte);

    expect(avis).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, coutApi: 0.0007 });
    expect(avis?.decouverte).toBeUndefined();
  });

  it('ne lève jamais : un client qui explose ne tue pas un scan pour cause d’IA', async () => {
    const quiExplose: ClientIa = { ...clientFactice(avisRendu('site')), diagnostiquer: () => Promise.reject(new Error('reseau')) };
    const diagnostic = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client: quiExplose, config: CONFIG });
    const { contexte, journal } = contexteAvecJournal();

    const avis = await diagnostic.diagnostiquer(resultat([RESIDU], 'limite-automatisation'), contexte);

    expect(avis).toEqual({ verdict: 'limite-automatisation', motif: MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, coutApi: 0 });
    expect(journal.at(-1)?.details).toMatchObject({ raison: RAISON_APPEL_LEVE, declaree: false });
  });
});
