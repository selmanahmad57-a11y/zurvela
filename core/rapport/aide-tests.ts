/**
 * Doublures partagées par les tests du rapport business : un rapport
 * technique minimal mais RÉALISTE — avec ses groupes, ses tentatives et ses
 * découvertes —, parce que c'est de là que tout le rapport client est dérivé.
 *
 * Réservé aux fichiers *.test.ts.
 */
import type {
  Anomalie,
  AnomalieCandidate,
  GroupeCause,
  Rapport,
  ResultatGroupe,
  TentativeReexecution,
  VerdictConfirmation,
} from '../types.js';
import type { ConfigRapport } from '../scanner/config.js';

export const CONFIG_RAPPORT_TEST: ConfigRapport = {
  langueRapport: 'fr',
  sectionsMax: 20,
  localisationsMaxParSection: 8,
  faitsMaxChars: 6000,
  cheminMaxChars: 120,
  symptomesMaxChars: 200,
  ligneMaxChars: 1400,
  maxTokensReponse: 4096,
  relancesMax: 1,
  appelMaxMs: 120000,
  dureeParSectionMs: 6000,
};

/** Une tentative exploitable (le rejeu a eu lieu) ou non (l'outil n'a pas su). */
export function tentative(numero: number, reproduite: boolean, exploitable = true): TentativeReexecution {
  return {
    numero,
    viewport: 'desktop',
    reproduite,
    echecOutillage: !exploitable,
    ...(exploitable ? {} : { causeEchec: 'outil' as const, erreur: 'delai-depasse' }),
    dureeMs: 1200,
  };
}

export interface OptionsAnomalie {
  categorie?: Anomalie['categorie'];
  gravite?: Anomalie['graviteEstimee'];
  verdict?: VerdictConfirmation;
  motif?: string;
  pages?: string[];
  viewports?: string[];
  /** Viewport porté par la localisation : marque une anomalie qui DÉPEND du viewport. */
  viewportLocalisation?: string;
  description?: string;
}

export function anomalie(groupe: string, options: OptionsAnomalie = {}): Anomalie {
  const pages = options.pages ?? ['/contact'];
  return {
    categorie: options.categorie ?? 'fonctionnel',
    description: options.description ?? 'bouton-sans-effet',
    urlOuEtape: pages[0] ?? '/contact',
    graviteEstimee: options.gravite ?? 'bloquant',
    confiance: 0.9,
    detecteur: 'D-INERTE',
    verdict: options.verdict ?? 'confirmee',
    ...(options.motif === undefined ? {} : { motif: options.motif }),
    groupe,
    localisations: pages.map((page) => ({
      urlOuEtape: page,
      ...(options.viewportLocalisation === undefined ? {} : { viewport: options.viewportLocalisation }),
    })),
    observations: (options.viewports ?? ['desktop', 'mobile']).map((viewport) => ({ viewport })),
  };
}

/** Un résultat de groupe cohérent avec l'anomalie : c'est lui qui porte les CHIFFRES du statut. */
export function resultatGroupe(cle: string, tentatives: TentativeReexecution[], verdict: VerdictConfirmation = 'confirmee'): ResultatGroupe {
  const representant = { description: 'bouton-sans-effet' } as unknown as AnomalieCandidate;
  const groupe: GroupeCause = {
    cle,
    representant,
    membres: [],
    localisations: [],
    observations: [],
    confiance: 0.9,
    descriptions: ['bouton-sans-effet'],
  };
  return {
    groupe,
    verdict,
    motif: 'reproduite',
    tentatives,
    tauxReproduction: tentatives.length === 0 ? null : tentatives.filter((t) => t.reproduite).length / tentatives.length,
    confianceInitiale: 0.9,
    confianceFinale: 0.92,
    coutApi: 0,
  };
}

export interface OptionsRapport {
  anomalies?: Anomalie[];
  groupes?: ResultatGroupe[];
  decouvertes?: Anomalie[];
  typeSite?: string;
}

export function rapportTechnique(options: OptionsRapport = {}): Rapport {
  const anomalies = options.anomalies ?? [anomalie('g1')];
  return {
    url: 'http://127.0.0.1:4800/',
    anomalies,
    coutApi: 0,
    dureeMs: 1000,
    journal: [],
    groupes: options.groupes ?? [resultatGroupe('g1', [tentative(1, true), tentative(2, true)])],
    ...(options.decouvertes === undefined ? {} : { decouvertes: options.decouvertes }),
    ...(options.typeSite === undefined
      ? {}
      : {
          profil: {
            typeSite: options.typeSite,
            natureLibre: null,
            langue: 'fr',
            confiance: 0.9,
            versionPrompt: 'v1',
            modeleDemande: 'claude-haiku-4-5',
            modeleServi: 'claude-haiku-4-5-20251001',
            apresRelance: false,
          },
        }),
  };
}
