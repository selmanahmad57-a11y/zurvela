/**
 * La politique IA, sans réseau et sans navigateur : l'élection, le refus d'un
 * identifiant hors énumération, et le REPLI PAR DÉCISION sous toutes ses
 * causes. Le client est une doublure — `core/ia` n'est jamais touché ici.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ClientIa, DecisionEstampillee, ResultatIa } from '../../ia/index.js';
import { RAISON_ACTION_INCONNUE, RAISON_CASSETTE_ABSENTE } from '../../ia/index.js';
import type { ContexteDecision, EntreeJournal, EtatDecisionEnumere, PageVisitee, ProvenanceDecision } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { enumererActions } from './enumeration.js';
import { NOM_POLITIQUE_DETERMINISTE, politiqueDeterministe, RAISON_PLUS_RIEN } from './politique.js';
import { EVENEMENT_ELECTION, EVENEMENT_REPLI, NOM_POLITIQUE_IA, politiqueIa, RAISON_DECISION_EN_ERREUR } from './politique-ia.js';

const ORIGINE = 'http://site.invalid';

const remplissage: ConfigScanner['remplissage'] = {
  regles: [],
  valeurTexteParDefaut: 'Zurvela scan test',
  typesIgnores: ['hidden'],
};

const PROVENANCE: ProvenanceDecision = {
  versionPrompt: 'v1',
  modeleDemande: 'claude-haiku-4-5',
  modeleServi: 'claude-haiku-4-5-20251001',
  raison: 'le formulaire critique est plus proche par ici',
  apresRelance: false,
  actionId: 'c2',
};

const pageCourante: PageVisitee = {
  url: `${ORIGINE}/catalogue`,
  viewport: 'desktop',
  statutHttp: 200,
  liensInternes: [],
  formulaires: [],
  horodatage: new Date(0).toISOString(),
};

const contexte: ContexteDecision = {
  pageCourante,
  formulairesRemplis: [],
  formulairesSoumis: [],
  urlsEnAttente: [`${ORIGINE}/catalogue?page=2`, `${ORIGINE}/commande`],
  nbPagesVisitees: 3,
};

const actions = enumererActions(contexte, { remplissage, libelleMaxChars: 40, origine: ORIGINE, libelles: new Map() , soumission: 'site-possede' as const });

const etat: EtatDecisionEnumere = {
  page: '/catalogue',
  viewport: 'desktop',
  profil: null,
  actions,
  historique: [],
  nbPagesVisitees: 3,
  pagesRestantes: 2,
};

/** Doublure de client : aucune capacité, sauf `decider` qu'on pilote. */
function client(decider: ClientIa['decider']): ClientIa {
  return {
    mode: 'actif',
    raisonDegrade: null,
    profiler: () => Promise.resolve({ disponible: false, raison: 'doublure' }),
    decider,
    diagnostiquer: () => Promise.resolve({ disponible: false, raison: 'doublure' }),
    rediger: () => Promise.resolve({ disponible: false, raison: 'doublure' }),
  };
}

function bancEssai(decider: ClientIa['decider']): { politique: ReturnType<typeof politiqueIa>; journal: EntreeJournal[]; cout: () => number } {
  const journal: EntreeJournal[] = [];
  let total = 0;
  const politique = politiqueIa({
    ia: client(decider),
    deterministe: politiqueDeterministe(),
    journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
    cout: (montant) => {
      total += montant;
    },
  });
  return { politique, journal, cout: () => total };
}

function elu(actionId: string, coutApi = 0.0012): ResultatIa<DecisionEstampillee> {
  return { disponible: true, valeur: { actionId, raison: PROVENANCE.raison, provenance: { ...PROVENANCE, actionId } }, coutApi };
}

function details(journal: EntreeJournal[], type: string): Record<string, unknown> | undefined {
  return journal.find((entree) => entree.type === type)?.details as Record<string, unknown> | undefined;
}

describe('politiqueIa — l’élection', () => {
  it('exécute l’action du MOTEUR désignée par l’identifiant, recopie la provenance, compte le coût', async () => {
    const cible = actions[1];
    if (cible === undefined) {
      throw new Error('énumération vide');
    }
    const { politique, journal, cout } = bancEssai(() => Promise.resolve(elu(cible.id)));

    const decision = await politique.decider(contexte, etat);

    expect(politique.nom).toBe(NOM_POLITIQUE_IA);
    expect(decision.politique).toBe(NOM_POLITIQUE_IA);
    // Identité d'OBJET : c'est l'acte du moteur, pas une reconstruction.
    expect(decision.action).toBe(cible.action);
    expect(decision.provenance).toEqual({ ...PROVENANCE, actionId: cible.id });
    expect(decision.raisonRepli).toBeUndefined();
    expect(cout()).toBeCloseTo(0.0012, 6);
    expect(details(journal, EVENEMENT_ELECTION)).toMatchObject({
      actionId: cible.id,
      type: 'naviguer',
      versionPrompt: 'v1',
      modeleDemande: 'claude-haiku-4-5',
      modeleServi: 'claude-haiku-4-5-20251001',
    });
  });

  it('n’élit JAMAIS une action absente de l’énumération, même nommée avec aplomb', async () => {
    const { politique, journal } = bancEssai(() => Promise.resolve(elu('c99')));

    const decision = await politique.decider(contexte, etat);

    expect(decision.politique).toBe(NOM_POLITIQUE_DETERMINISTE);
    expect(decision.raisonRepli).toBe(RAISON_ACTION_INCONNUE);
    expect(decision.provenance).toBeUndefined();
    expect(decision.action).toEqual({ type: 'naviguer', url: `${ORIGINE}/catalogue?page=2` });
    expect(details(journal, EVENEMENT_REPLI)).toMatchObject({ raison: RAISON_ACTION_INCONNUE, actionId: 'c99' });
    expect(journal.some((entree) => entree.type === EVENEMENT_ELECTION)).toBe(false);
  });
});

describe('politiqueIa — le repli PAR DÉCISION', () => {
  it('une cassette absente fait trancher CETTE décision par la déterministe, et le dit', async () => {
    const { politique, journal } = bancEssai(() =>
      Promise.resolve({ disponible: false, raison: RAISON_CASSETTE_ABSENTE, message: 'lancer pnpm banc:enregistrer-ia' }),
    );

    const decision = await politique.decider(contexte, etat);

    expect(decision.politique).toBe(NOM_POLITIQUE_DETERMINISTE);
    expect(decision.raisonRepli).toBe(RAISON_CASSETTE_ABSENTE);
    expect(decision.action).toEqual({ type: 'naviguer', url: `${ORIGINE}/catalogue?page=2` });
    expect(details(journal, EVENEMENT_REPLI)).toMatchObject({
      raison: RAISON_CASSETTE_ABSENTE,
      page: '/catalogue',
      viewport: 'desktop',
      message: 'lancer pnpm banc:enregistrer-ia',
    });
  });

  it('compte le coût d’un appel qui a échoué APRÈS avoir dépensé', async () => {
    const { politique, cout } = bancEssai(() => Promise.resolve({ disponible: false, raison: 'reponse-invalide', coutApi: 0.0007 }));
    await politique.decider(contexte, etat);
    expect(cout()).toBeCloseTo(0.0007, 6);
  });

  it('un client qui LÈVE ne tue pas le scan : la décision se replie', async () => {
    const { politique, journal } = bancEssai(() => Promise.reject(new Error('socket fermée')));

    const decision = await politique.decider(contexte, etat);

    expect(decision.politique).toBe(NOM_POLITIQUE_DETERMINISTE);
    expect(decision.raisonRepli).toBe(RAISON_DECISION_EN_ERREUR);
    expect(details(journal, EVENEMENT_REPLI)).toMatchObject({ raison: RAISON_DECISION_EN_ERREUR, message: 'socket fermée' });
  });

  it('le repli est PAR DÉCISION : l’appel suivant réinterroge le modèle', async () => {
    const reponses: ResultatIa<DecisionEstampillee>[] = [
      { disponible: false, raison: RAISON_CASSETTE_ABSENTE },
      elu(actions[1]?.id ?? ''),
    ];
    const decider = vi.fn(() => Promise.resolve(reponses.shift() ?? { disponible: false, raison: 'epuise' } as ResultatIa<DecisionEstampillee>));
    const { politique } = bancEssai(decider);

    const premiere = await politique.decider(contexte, etat);
    const seconde = await politique.decider(contexte, etat);

    expect(premiere.politique).toBe(NOM_POLITIQUE_DETERMINISTE);
    expect(seconde.politique).toBe(NOM_POLITIQUE_IA);
    expect(decider).toHaveBeenCalledTimes(2);
  });

  it('le repli reste possible quand il ne reste que `terminer` à faire', async () => {
    const seul: ContexteDecision = { ...contexte, urlsEnAttente: [] };
    const etatSeul: EtatDecisionEnumere = {
      ...etat,
      actions: enumererActions(seul, { remplissage, libelleMaxChars: 40, origine: ORIGINE, libelles: new Map() , soumission: 'site-possede' as const }),
    };
    const { politique } = bancEssai(() => Promise.resolve({ disponible: false, raison: RAISON_CASSETTE_ABSENTE }));

    const decision = await politique.decider(seul, etatSeul);

    expect(decision.action).toEqual({ type: 'terminer', raison: RAISON_PLUS_RIEN });
    expect(decision.politique).toBe(NOM_POLITIQUE_DETERMINISTE);
  });
});
