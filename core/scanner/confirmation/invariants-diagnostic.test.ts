/**
 * LES TROIS INVARIANTS NON NÉGOCIABLES du diagnostic, éprouvés de bout en
 * bout à travers le protocole réel — pas sur la table seule.
 *
 *   1. aucune écriture du diagnostic ne modifie un groupe RETENU ;
 *   2. aucune confiance ne monte jamais ;
 *   3. un avis ne promeut jamais un verdict.
 *
 * Une garantie ne se déclare pas, elle s'éprouve : chaque invariant est ici
 * confronté à un diagnostic HOSTILE, construit exprès pour le violer. Un
 * invariant que personne n'a essayé de faire tomber n'est pas prouvé
 * (METHODE §2).
 *
 * Le quatrième bloc éprouve le MODE DÉGRADÉ bit à bit : diagnostic coupé, la
 * sortie du protocole doit être rigoureusement celle d'avant la brique 4c.
 */
import { describe, expect, it } from 'vitest';
import type { ClientIa, DiagnosticEstampille, ResultatIa } from '../../ia/index.js';
import {
  VERDICTS_RETENUS,
  type AnomalieCandidate,
  type AutoDiagnostic,
  type EntreeJournal,
  type ResultatConfirmation,
} from '../../types.js';
import type { ConfigDiagnostic } from '../config.js';
import { creerDetecteurHttp } from '../detection/d-http.js';
import { creerDetecteurLenteur } from '../detection/d-lenteur.js';
import { creerDetecteurRecouvrement } from '../detection/d-recouvrement.js';
import { CONFIG_TEST } from '../detection/fabriques-test.js';
import { autoDiagnosticMecanique } from './auto-diagnostic.js';
import { creerAutoDiagnosticIa } from './auto-diagnostic-ia.js';
import {
  CONFIG_CONFIRMATION_TEST,
  candidateSimulee,
  contexteConfirmation,
  reexecuteurFactice,
  type RejeuScripte,
} from './fabriques-test.js';
import { MOTIF_DECOUVERTE_DIAGNOSTIC_SITE, MOTIF_DIAGNOSTIC_SITE_ECARTE } from './pont-vocabulaires.js';
import { creerProtocole } from './protocole.js';

const DETECTEURS = [
  creerDetecteurHttp(CONFIG_TEST.http, CONFIG_TEST.tiers),
  creerDetecteurLenteur(CONFIG_TEST.lenteur, CONFIG_TEST.tiers),
  creerDetecteurRecouvrement(CONFIG_TEST.recouvrement),
];

const CONFIG_DIAGNOSTIC: ConfigDiagnostic = {
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

/** Le RÉSIDU : un rejeu qui n'a pas eu lieu, sans qu'on sache à qui la faute. */
const RESIDU: RejeuScripte = { echecOutillage: true, causeEchec: 'indetermine', erreur: 'delai-depasse' };
/** Un rejeu qui reproduit le défaut : le groupe sera RETENU. */
const REPRODUIT: RejeuScripte = { enEchec: true };

function client(avis: DiagnosticEstampille['avis']): ClientIa {
  const indisponible = <T>(): Promise<ResultatIa<T>> => Promise.resolve({ disponible: false, raison: 'hors-sujet' });
  return {
    mode: 'actif',
    raisonDegrade: null,
    profiler: () => indisponible(),
    decider: () => indisponible(),
    rediger: () => indisponible(),
    diagnostiquer: () =>
      Promise.resolve<ResultatIa<DiagnosticEstampille>>({
        disponible: true,
        valeur: { avis, justification: 'prose du modèle', provenance: PROVENANCE },
        coutApi: 0.0021,
      }),
  };
}

/** Client sans capacité : le mode dégradé du diagnostic. */
const clientMuet: ClientIa = {
  mode: 'degrade',
  raisonDegrade: 'sans-capacite',
  profiler: () => Promise.resolve({ disponible: false, raison: 'sans-capacite' }),
  decider: () => Promise.resolve({ disponible: false, raison: 'sans-capacite' }),
  rediger: () => Promise.resolve({ disponible: false, raison: 'sans-capacite' }),
  diagnostiquer: () => Promise.resolve({ disponible: false, raison: 'sans-capacite' }),
};

async function confirmer(
  autoDiagnostic: AutoDiagnostic,
  scripts: RejeuScripte[],
  candidates: AnomalieCandidate[] = [candidateSimulee()],
): Promise<{ resultat: ResultatConfirmation; journal: EntreeJournal[] }> {
  const journal: EntreeJournal[] = [];
  const contexte = contexteConfirmation({ journal, reexecuteur: reexecuteurFactice(scripts), detecteurs: DETECTEURS });
  const protocole = creerProtocole({ config: CONFIG_CONFIRMATION_TEST, autoDiagnostic });
  return { resultat: await protocole.confirmer(candidates, contexte), journal };
}

function diagnosticIa(avis: DiagnosticEstampille['avis']): AutoDiagnostic {
  return creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client: client(avis), config: CONFIG_DIAGNOSTIC });
}

describe('l’effet NOMINAL d’un avis « cause site »', () => {
  it('le groupe reste écarté, et une découverte paraît dans le troisième état épistémique', async () => {
    const { resultat } = await confirmer(diagnosticIa('site'), [RESIDU]);

    // Le groupe : écarté, verdict non promu, motif qui dit les deux moitiés.
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_DIAGNOSTIC_SITE_ECARTE });
    expect(resultat.ecartees).toHaveLength(1);
    // La découverte : confiance d'origine (0,8) × 0,6, motif `diagnostic-site`.
    expect(resultat.decouvertes).toHaveLength(1);
    expect(resultat.decouvertes?.[0]).toMatchObject({ motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE, confiance: 0.8 * 0.6 });
    // Elle est publiée : se taire au moment où le modèle impute le site serait
    // exactement le silence que la brique existe pour réduire.
    expect(resultat.retenues).toEqual(resultat.decouvertes);
    expect(resultat.coutApi).toBeCloseTo(0.0021, 10);
  });

  it('un avis « outil » ne publie rien : seul « site » ouvre le canal des découvertes', async () => {
    const { resultat } = await confirmer(diagnosticIa('outil'), [RESIDU]);
    expect(resultat.decouvertes).toEqual([]);
    expect(resultat.retenues).toEqual([]);
  });

  it('un aveu `indetermine` ne publie rien non plus, mais le silence porte désormais un motif', async () => {
    const { resultat } = await confirmer(diagnosticIa('indetermine'), [RESIDU]);
    expect(resultat.decouvertes).toEqual([]);
    expect(resultat.groupes?.[0]?.motif).toBe('diagnostic-indetermine');
  });
});

describe('INVARIANT 1 — aucune écriture du diagnostic ne modifie un groupe RETENU', () => {
  it('le diagnostic IA n’est même pas consulté sur un groupe reproduit', async () => {
    const { resultat } = await confirmer(diagnosticIa('site'), [REPRODUIT]);
    expect(resultat.retenues[0]?.verdict).toBe('confirmee');
    expect(resultat.decouvertes).toEqual([]);
    expect(resultat.coutApi).toBe(0);
  });

  it('un diagnostic HOSTILE qui réclamerait une découverte sur un groupe retenu n’en obtient AUCUNE', async () => {
    // On essaie de faire mentir l'invariant : ce faux diagnostic rend une
    // découverte pour TOUT groupe, retenu compris, en ignorant le résidu.
    // Le protocole ne publie que dans la branche « écartée » — l'invariant
    // est structurel, il ne dépend pas de la politesse de l'appelant.
    const hostile: AutoDiagnostic = {
      nom: 'hostile',
      diagnostiquer: (resultat) =>
        Promise.resolve({
          verdict: resultat.verdict,
          motif: 'hostile',
          coutApi: 0,
          decouverte: { facteurConfiance: 0.6, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
        }),
    };

    const { resultat } = await confirmer(hostile, [REPRODUIT]);

    expect(resultat.retenues[0]?.verdict).toBe('confirmee');
    expect(resultat.decouvertes).toEqual([]);
  });

  it('la garde sait pourtant s’allumer : le MÊME diagnostic hostile publie bien sur un groupe écarté', async () => {
    // Sans ce contre-cas, le test précédent passerait aussi si le protocole
    // avait cessé d'émettre la moindre découverte — un vert qui ne prouve rien.
    const hostile: AutoDiagnostic = {
      nom: 'hostile',
      diagnostiquer: (resultat) =>
        Promise.resolve({
          verdict: resultat.verdict,
          motif: 'hostile',
          coutApi: 0,
          decouverte: { facteurConfiance: 0.6, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
        }),
    };

    const { resultat } = await confirmer(hostile, [RESIDU]);

    expect(resultat.decouvertes).toHaveLength(1);
  });
});

describe('INVARIANT 2 — aucune confiance ne monte, jamais', () => {
  it('la découverte sur avis est STRICTEMENT sous la confiance d’origine du détecteur', async () => {
    const { resultat } = await confirmer(diagnosticIa('site'), [RESIDU]);
    const origine = resultat.groupes?.[0]?.confianceInitiale ?? 0;
    expect(resultat.decouvertes?.[0]?.confiance).toBeLessThan(origine);
  });

  it('un facteur HOSTILE supérieur à 1 ne remonte rien : le code tient la borne que le schéma déclare', async () => {
    const hostile: AutoDiagnostic = {
      nom: 'hostile',
      diagnostiquer: (resultat) =>
        Promise.resolve({
          verdict: resultat.verdict,
          motif: 'hostile',
          coutApi: 0,
          decouverte: { facteurConfiance: 5, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
        }),
    };

    const { resultat } = await confirmer(hostile, [RESIDU]);

    expect(resultat.decouvertes?.[0]?.confiance).toBe(resultat.groupes?.[0]?.confianceInitiale);
  });

  it('un facteur HOSTILE négatif ne publie pas une confiance négative : la borne BASSE tient aussi', async () => {
    // La jumelle basse du test précédent, et elle garde un chemin que rien
    // d'autre ne garde : la découverte sur avis est le seul producteur
    // d'`Anomalie.confiance` qui ne passe pas par `calibrer()`, donc le seul
    // qui échappe au plancher de `calibration.ts`. Sans la borne, −0,8
    // ressortirait tel quel dans `decouvertes` ET dans `retenues`.
    const hostile: AutoDiagnostic = {
      nom: 'hostile',
      diagnostiquer: (resultat) =>
        Promise.resolve({
          verdict: resultat.verdict,
          motif: 'hostile',
          coutApi: 0,
          decouverte: { facteurConfiance: -1, motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE },
        }),
    };

    const { resultat } = await confirmer(hostile, [RESIDU]);

    expect(resultat.decouvertes?.[0]?.confiance).toBe(0);
    for (const anomalie of [...(resultat.decouvertes ?? []), ...resultat.retenues]) {
      expect(anomalie.confiance).toBeGreaterThanOrEqual(0);
      expect(anomalie.confiance).toBeLessThanOrEqual(1);
    }
  });

  it('le diagnostic ne touche pas la confiance finale du groupe : elle est celle du mode dégradé', async () => {
    const avec = await confirmer(diagnosticIa('site'), [RESIDU]);
    const sans = await confirmer(autoDiagnosticMecanique, [RESIDU]);
    expect(avec.resultat.groupes?.[0]?.confianceFinale).toBe(sans.resultat.groupes?.[0]?.confianceFinale);
  });
});

describe('INVARIANT 3 — un avis ne promeut jamais un verdict', () => {
  it('sur les trois avis possibles, le groupe d’origine reste ÉCARTÉ', async () => {
    for (const avis of ['outil', 'site', 'indetermine'] as const) {
      const { resultat } = await confirmer(diagnosticIa(avis), [RESIDU]);
      const groupe = resultat.groupes?.[0];
      expect(VERDICTS_RETENUS).not.toContain(groupe?.verdict);
      expect(resultat.ecartees).toHaveLength(1);
      // Ce qui est éventuellement retenu est une DÉCOUVERTE, jamais le groupe :
      // elle ne porte pas sa clé de cause racine d'origine comme un verdict promu.
      expect(resultat.retenues.every((anomalie) => anomalie.motif === MOTIF_DECOUVERTE_DIAGNOSTIC_SITE)).toBe(true);
    }
  });
});

describe('MODE DÉGRADÉ — bit à bit identique à la brique 4b', () => {
  it('client sans capacité : la sortie du protocole est celle du diagnostic mécanique seul', async () => {
    const degrade = creerAutoDiagnosticIa({ mecanique: autoDiagnosticMecanique, budgetsRejeu: BUDGETS_REJEU, client: clientMuet, config: CONFIG_DIAGNOSTIC });
    const avec = await confirmer(degrade, [RESIDU]);
    const sans = await confirmer(autoDiagnosticMecanique, [RESIDU]);
    expect(avec.resultat).toEqual(sans.resultat);
  });

  it('porte `actif` fermée : même sortie, et pas un seul appel au modèle', async () => {
    const ferme = creerAutoDiagnosticIa({
      mecanique: autoDiagnosticMecanique,
      budgetsRejeu: BUDGETS_REJEU,
      client: client('site'),
      config: { ...CONFIG_DIAGNOSTIC, actif: false },
    });
    const avec = await confirmer(ferme, [RESIDU]);
    const sans = await confirmer(autoDiagnosticMecanique, [RESIDU]);
    expect(avec.resultat).toEqual(sans.resultat);
    expect(avec.resultat.coutApi).toBe(0);
  });

  it('le dégradé ne se contente pas d’être égal : le cas NON dégradé, lui, diffère bien', async () => {
    // Le contre-cas des deux tests précédents. Sans lui, ils passeraient aussi
    // si le diagnostic n'avait jamais aucun effet.
    const avec = await confirmer(diagnosticIa('site'), [RESIDU]);
    const sans = await confirmer(autoDiagnosticMecanique, [RESIDU]);
    expect(avec.resultat).not.toEqual(sans.resultat);
  });
});
