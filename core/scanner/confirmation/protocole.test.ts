/**
 * Le protocole de bout en bout, avec un `Reexecuteur` FACTICE et les VRAIS
 * détecteurs : le factice ne décide jamais « reproduite », il rend des
 * signaux que la détection relit. Aucun navigateur ici.
 */
import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate, EntreeJournal, Reexecuteur, Signal, Viewport } from '../../types.js';
import { creerDetecteurHttp } from '../detection/d-http.js';
import { creerDetecteurLenteur } from '../detection/d-lenteur.js';
import { creerDetecteurRecouvrement } from '../detection/d-recouvrement.js';
import {
  BOUTON,
  CONFIG_TEST,
  DESKTOP,
  MOBILE,
  URL_CONTACT,
  interception,
  reponse,
  soumission,
} from '../detection/fabriques-test.js';
import { MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, autoDiagnosticMecanique } from './auto-diagnostic.js';
import { MOTIF_SOUS_SEUIL_RETENUE } from './calibration.js';
import {
  CONFIG_CONFIRMATION_TEST,
  candidateSimulee,
  contexteConfirmation,
  reexecuteurFactice,
  type RejeuScripte,
} from './fabriques-test.js';
import { NOM_PROTOCOLE_ANTI_FAUX_POSITIFS, creerProtocole } from './protocole.js';
import {
  MOTIF_CONFIANCE_SUFFISANTE,
  MOTIF_ECHEANCE_ATTEINTE,
  MOTIF_JAMAIS_REPRODUITE,
  MOTIF_REJEU_IMPOSSIBLE,
  MOTIF_REPRODUCTION_PARTIELLE,
  MOTIF_REPRODUITE,
} from './verdict.js';

const DETECTEURS = [
  creerDetecteurHttp(CONFIG_TEST.http),
  creerDetecteurLenteur(CONFIG_TEST.lenteur),
  creerDetecteurRecouvrement(CONFIG_TEST.recouvrement),
];

const protocole = creerProtocole({ config: CONFIG_CONFIRMATION_TEST, autoDiagnostic: autoDiagnosticMecanique });

interface Execution {
  journal: EntreeJournal[];
  rejeu: { appels: { viewport: string }[] };
}

/** Lance le protocole sur des candidates avec un re-exécuteur scripté. */
async function confirmer(candidates: AnomalieCandidate[], scripts: RejeuScripte[], surcharges: { echeance?: number } = {}) {
  const journal: EntreeJournal[] = [];
  const rejeu = reexecuteurFactice(scripts);
  const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS, ...surcharges });
  const resultat = await protocole.confirmer(candidates, contexte);
  return { resultat, journal, rejeu };
}

function typesJournal({ journal }: Execution): string[] {
  return journal.map((entree) => entree.type);
}

function details(journal: EntreeJournal[], type: string): Record<string, unknown> | undefined {
  return journal.find((entree) => entree.type === type)?.details as Record<string, unknown> | undefined;
}

describe('creerProtocole — verdicts', () => {
  it('2/2 : confirmee, RETENUE, enrichie des localisations et des observations du groupe', async () => {
    const candidate = candidateSimulee();
    const { resultat, journal, rejeu } = await confirmer([candidate], [{ enEchec: true }]);

    expect(protocole.nom).toBe(NOM_PROTOCOLE_ANTI_FAUX_POSITIFS);
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
    expect(rejeu.appels.map((appel) => appel.viewport)).toEqual([DESKTOP.nom, DESKTOP.nom]);
    expect(resultat.ecartees).toEqual([]);
    expect(resultat.retenues).toHaveLength(1);
    const [anomalie] = resultat.retenues;
    expect(anomalie?.verdict).toBe('confirmee');
    // L'anomalie porte son POURQUOI et la clé de son groupe : le rapport se
    // relit sans le journal (traçabilité, cahier §1a).
    expect(anomalie?.motif).toBe(MOTIF_REPRODUITE);
    expect(anomalie?.groupe).toBe(resultat.groupes?.[0]?.groupe.cle);
    expect(anomalie?.localisations).toEqual([{ urlOuEtape: URL_CONTACT }]);
    expect(anomalie?.observations).toEqual([{ viewport: DESKTOP.nom }]);
    // Un verdict confirmé RENFORCE la confiance du détecteur.
    expect(anomalie?.confiance).toBeGreaterThan(candidate.confiance);
    expect(resultat.coutApi).toBe(0);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: 1 });
    expect(details(journal, 'confirmation.verdict')).toMatchObject({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, taux: 1 });
  });

  it('1/2 : intermittente, RETENUE et marquée — un bug sur deux requêtes est un bug (I01)', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ enEchec: true }, { enEchec: false }]);
    expect(resultat.retenues).toHaveLength(1);
    expect(resultat.retenues[0]?.verdict).toBe('intermittente');
    expect(resultat.retenues[0]?.motif).toBe(MOTIF_REPRODUCTION_PARTIELLE);
    expect(resultat.groupes?.[0]).toMatchObject({ motif: MOTIF_REPRODUCTION_PARTIELLE, tauxReproduction: 0.5 });
  });

  it('0/2 : non-reproduite, ÉCARTÉE avec sa raison — le faux positif simulé (T01)', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ enEchec: false }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees).toHaveLength(1);
    expect(resultat.ecartees[0]).toMatchObject({ verdict: 'non-reproduite', raison: MOTIF_JAMAIS_REPRODUITE });
    // La candidate écartée garde ses preuves d'origine et son résultat de groupe.
    expect(resultat.ecartees[0]?.candidate).toBe(resultat.groupes?.[0]?.groupe.membres[0]);
    expect(resultat.ecartees[0]?.resultat?.tentatives).toHaveLength(2);
  });

  it('aucune tentative exploitable : limite-automatisation — distincte de non-reproduite', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ echecOutillage: true, erreur: 'page-inchargeable' }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('limite-automatisation');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_REJEU_IMPOSSIBLE);
    expect(resultat.groupes?.[0]?.tauxReproduction).toBeNull();
  });

  it('un rejeu partiellement impossible sans reproduction : l’auto-diagnostic corrige le verdict brut', async () => {
    const { resultat, journal } = await confirmer(
      [candidateSimulee()],
      [{ echecOutillage: true, erreur: 'navigateur-perdu' }, { enEchec: false }],
    );
    expect(resultat.groupes?.[0]?.verdict).toBe('limite-automatisation');
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE);
    expect(details(journal, 'confirmation.auto-diagnostic')).toMatchObject({
      verdictBrut: 'non-reproduite',
      verdict: 'limite-automatisation',
    });
  });

  it('garde le motif le plus précis quand l’auto-diagnostic ne change pas le verdict', async () => {
    const { resultat, journal } = await confirmer([candidateSimulee()], [{ echecOutillage: true }]);
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_REJEU_IMPOSSIBLE);
    expect(journal.map((entree) => entree.type)).not.toContain('confirmation.auto-diagnostic');
  });

  it('rétrograde en basse-confiance une intermittente trop faible, et l’écarte', async () => {
    const { resultat } = await confirmer([candidateSimulee({ confiance: 0.5 })], [{ enEchec: true }, { enEchec: false }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('basse-confiance');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_SOUS_SEUIL_RETENUE);
  });
});

describe('creerProtocole — consolidation, échéance, politique', () => {
  it('ne paie QU’UNE re-exécution par cause racine, et écarte tous les membres du groupe', async () => {
    const membres = [
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx' }),
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx', urlOuEtape: `${URL_CONTACT}?b=1` }),
    ];
    const { resultat, rejeu, journal } = await confirmer(membres, [{ enEchec: false }]);

    expect(resultat.groupes).toHaveLength(1);
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
    expect(resultat.ecartees.map((ecartee) => ecartee.candidate)).toEqual(membres);
    expect(details(journal, 'confirmation.debut')).toMatchObject({ nbCandidates: 2, nbGroupes: 1 });
  });

  it('échéance atteinte : les groupes restants sont limite-automatisation, SANS rejeu', async () => {
    const { resultat, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }], { echeance: Date.now() });
    expect(rejeu.appels).toEqual([]);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_ECHEANCE_ATTEINTE });
    expect(resultat.retenues).toEqual([]);
  });

  it('budget insuffisant pour une tentative ENTIÈRE : limite-automatisation, et surtout pas un verdict sur une tentative tronquée', async () => {
    // Il reste du temps (5 s) mais pas de quoi mener un rejeu jusqu'au bout
    // (marge 3 s + budget minimal 8 s). Une tentative écourtée ne se
    // distinguerait pas d'un rejeu complet qui n'aurait rien reproduit : le
    // verdict d'un défaut déterministe dépendrait alors du temps restant.
    const { resultat, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }], { echeance: Date.now() + 5000 });
    expect(rejeu.appels).toEqual([]);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_ECHEANCE_ATTEINTE, tauxReproduction: null });
    expect(resultat.retenues).toEqual([]);
  });

  it('politique économe : un groupe déjà très sûr est confirmé sans rejeu', async () => {
    const econome = creerProtocole({
      config: { ...CONFIG_CONFIRMATION_TEST, politique: 'econome' },
      autoDiagnostic: autoDiagnosticMecanique,
    });
    const journal: EntreeJournal[] = [];
    const rejeu = reexecuteurFactice([{ enEchec: false }]);
    const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS });

    const resultat = await econome.confirmer([candidateSimulee({ confiance: 0.95 }), candidateSimulee({ confiance: 0.7, urlOuEtape: `${URL_CONTACT}?b=1`, preuves: [reponse({ statut: 500, urlRessource: `${URL_CONTACT}/autre` })] })], contexte);

    expect(resultat.retenues[0]?.verdict).toBe('confirmee');
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_CONFIANCE_SUFFISANTE);
    expect(resultat.groupes?.[0]?.tentatives).toEqual([]);
    // Le groupe sous le seuil, lui, est bien re-exécuté.
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
  });

  it('sans candidate : rien à confirmer, rien à rejouer, journal quand même tenu', async () => {
    const { resultat, rejeu, journal } = await confirmer([], [{ enEchec: true }]);
    expect(resultat).toMatchObject({ retenues: [], ecartees: [], coutApi: 0, groupes: [] });
    expect(rejeu.appels).toEqual([]);
    expect(journal.map((entree) => entree.type)).toEqual(['confirmation.debut', 'confirmation.fin']);
  });

  it('journalise chaque étape, dans l’ordre (constitution §5)', async () => {
    const { journal, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }]);
    expect(typesJournal({ journal, rejeu })).toEqual([
      'confirmation.debut',
      'confirmation.groupe',
      'confirmation.tentative',
      'confirmation.tentative',
      'confirmation.verdict',
      'confirmation.fin',
    ]);
    expect(details(journal, 'confirmation.tentative')).toMatchObject({ numero: 1, viewport: DESKTOP.nom, reproduite: true, echecOutillage: false });
    expect(details(journal, 'confirmation.fin')).toMatchObject({ nbRetenues: 1, nbEcartees: 0, coutApi: 0 });
  });
});

describe('creerProtocole — détecteur gradué et contre-épreuve', () => {
  const candidateLente = (): AnomalieCandidate =>
    candidateSimulee({
      detecteur: 'd-lenteur',
      description: 'reponse-lente',
      categorie: 'performance',
      graviteEstimee: 'important',
      confiance: 0.95,
      preuves: [reponse({ statut: 200, actionId: 'a1', dureeMs: 9000 })],
    });

  it('enregistre la mesure brute de chaque tentative et l’agrège (D-LENTEUR est le seul détecteur gradué)', async () => {
    const { resultat, journal } = await confirmer([candidateLente()], [{ dureeMs: 9000 }, { dureeMs: 5000 }]);
    expect(resultat.groupes?.[0]?.verdict).toBe('confirmee');
    expect(resultat.groupes?.[0]?.mesureAgregee).toBe(7000);
    expect(details(journal, 'confirmation.tentative')).toMatchObject({ mesureMs: 9000 });
  });

  it('une lenteur qui ne se reproduit plus est écartée (L01)', async () => {
    const { resultat } = await confirmer([candidateLente()], [{ dureeMs: 100 }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('non-reproduite');
    expect(resultat.groupes?.[0]?.mesureAgregee).toBeUndefined();
  });

  it('anomalie de viewport : contre-épreuve dans l’AUTRE viewport, l’asymétrie attendue renforce la confiance', async () => {
    const candidate = candidateSimulee({
      detecteur: 'd-recouvrement',
      description: 'clic-intercepte',
      categorie: 'mobile',
      viewport: MOBILE.nom,
      element: BOUTON,
      confiance: CONFIG_TEST.recouvrement.confianceGeometrie,
      observations: [{ viewport: MOBILE.nom }],
      preuves: [interception({ viewport: MOBILE.nom })],
      reproduction: { url: URL_CONTACT, viewport: MOBILE, action: soumission('a1', { viewport: MOBILE.nom }), actionsPrealables: [] },
    });
    // Le recouvrement n'existe QUE sur mobile : c'est ce que la contre-épreuve doit constater.
    const rejeu: Reexecuteur & { viewports: string[] } = {
      viewports: [],
      rejouer(reproduction, viewport: Viewport) {
        rejeu.viewports.push(viewport.nom);
        const signaux: Signal[] = viewport.mobile ? [interception({ viewport: viewport.nom, page: reproduction.url })] : [];
        return Promise.resolve({
          signaux,
          parcours: { urlDepart: reproduction.url, pages: [], actions: [], arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 as const },
          echecOutillage: false,
          dureeMs: 5,
        });
      },
    };
    const journal: EntreeJournal[] = [];
    const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS });

    const resultat = await protocole.confirmer([candidate], contexte);

    expect(rejeu.viewports).toEqual([MOBILE.nom, MOBILE.nom, DESKTOP.nom]);
    expect(resultat.groupes?.[0]?.contreEpreuve).toEqual({ viewport: DESKTOP.nom, reproduite: false, echecOutillage: false, attendue: true });
    expect(details(journal, 'confirmation.contre-epreuve')).toMatchObject({ viewport: DESKTOP.nom, attendue: true });
    // Bonus de contre-épreuve appliqué en plus du facteur de verdict.
    const attendue =
      candidate.confiance * CONFIG_CONFIRMATION_TEST.calibration.facteurVerdict.confirmee * (1 + CONFIG_CONFIRMATION_TEST.calibration.bonusContreEpreuve);
    expect(resultat.retenues[0]?.confiance).toBeCloseTo(attendue, 10);
  });
});
