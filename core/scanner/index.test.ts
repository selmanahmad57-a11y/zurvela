/**
 * Test du pipeline complet avec des doublures injectées (aucun navigateur) :
 * un explorateur qui rejoue un scénario simulé, un détecteur qui interprète
 * ses signaux, le protocole passe-plat.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { creerClientIa, type ClientIa } from '../ia/index.js';
import type {
  AnomalieCandidate,
  ContexteExploration,
  Detecteur,
  Explorateur,
  Observateur,
  Parcours,
  ProtocoleConfirmation,
  Signal,
} from '../types.js';
import { chargerConfigScanner, type ConfigScanner } from './config.js';
import { protocolePassePlat } from './confirmation/passe-plat.js';
import { creerScanner, type DependancesScanner } from './index.js';

const ORIGINE = 'http://127.0.0.1:4800';
const URL_CONTACT = `${ORIGINE}/contact`;
const BOUTON = { balise: 'button', selecteur: '#envoyer', attributs: { type: 'button' } };
const FORMULAIRE = { balise: 'form', selecteur: '#contact', attributs: { action: '/api/contact' } };

let config: ConfigScanner;
let ia: ClientIa;

beforeAll(async () => {
  config = await chargerConfigScanner();
  ia = creerClientIa(config.ia, {});
});

/** Observateur en mémoire, avec compteur d'instances pour vérifier « un observateur neuf par scan ». */
function fabriqueObservateur(): { fabrique: () => Observateur; instances: Observateur[] } {
  const instances: Observateur[] = [];
  const fabrique = (): Observateur => {
    const tampon: Signal[] = [];
    const observateur: Observateur = { emettre: (signal) => tampon.push(signal), signaux: () => [...tampon] };
    instances.push(observateur);
    return observateur;
  };
  return { fabrique, instances };
}

/** Signal simulé d'une soumission SANS effet (le cas F01), lié à l'action `a1`. */
function finActionInerte(viewport: string): Signal {
  return {
    type: 'fin-action',
    horodatage: new Date().toISOString(),
    page: URL_CONTACT,
    viewport,
    actionId: 'a1',
    effets: { requetes: 0, requetesEnAttente: 0, navigation: false, mutations: 0, mutationsZone: 0, mutationsHorsBruit: 0, attenteMs: 500 },
  };
}

function parcoursSimule(urlDepart: string, viewport: string): Parcours {
  const instant = new Date().toISOString();
  return {
    urlDepart,
    pages: [{ url: URL_CONTACT, viewport, statutHttp: 200, liensInternes: [], formulaires: [], horodatage: instant }],
    actions: [
      {
        id: 'a1',
        action: { type: 'soumettre', formulaire: FORMULAIRE, declencheur: BOUTON },
        page: URL_CONTACT,
        viewport,
        debut: instant,
        fin: instant,
        resultat: 'ok',
      },
    ],
    arret: 'complet',
  };
}

/** Explorateur simulé : émet un signal par viewport, journalise, rend le parcours ; mémorise le contexte reçu. */
function explorateurSimule(viewports: string[]): Explorateur & { contextes: ContexteExploration[] } {
  const contextes: ContexteExploration[] = [];
  return {
    nom: 'explorateur-simule',
    contextes,
    async explorer(contexte, observateur) {
      contextes.push(contexte);
      for (const viewport of viewports) {
        contexte.journaliser('exploration.viewport', { viewport });
        observateur.emettre(finActionInerte(viewport));
      }
      contexte.journaliser('exploration.fin', { arret: 'complet' });
      return parcoursSimule(contexte.urlDepart, viewports[0] ?? '');
    },
  };
}

/** Explorateur qui émet un signal puis lève : simule une panne en cours d'exploration. */
function explorateurEnPanne(message: string): Explorateur {
  return {
    nom: 'explorateur-en-panne',
    async explorer(contexte, observateur) {
      observateur.emettre(finActionInerte('desktop'));
      throw new Error(message);
    },
  };
}

/** Détecteur simulé : une candidate « element-sans-effet » par signal `fin-action` sans aucun effet. */
function detecteurInerteSimule(contexteVu: { viewports: string[] }): Detecteur {
  return {
    nom: 'd-inerte-simule',
    dependDuViewport: false,
    detecter(signaux, contexte) {
      contexteVu.viewports = contexte.viewports.map((viewport) => viewport.nom);
      return signaux.flatMap((signal): AnomalieCandidate[] => {
        if (signal.type !== 'fin-action' || signal.effets.requetes > 0 || signal.effets.mutations > 0 || signal.effets.navigation) {
          return [];
        }
        const action = contexte.parcours.actions.find((candidate) => candidate.id === signal.actionId) ?? null;
        const viewport = contexte.viewports.find((candidate) => candidate.nom === signal.viewport) ?? contexte.viewports[0];
        if (viewport === undefined) {
          return [];
        }
        return [
          {
            categorie: 'fonctionnel',
            description: 'element-sans-effet',
            urlOuEtape: signal.page,
            graviteEstimee: 'bloquant',
            confiance: 0.8,
            detecteur: 'd-inerte-simule',
            element: BOUTON,
            reproduction: { url: signal.page, viewport, action, actionsPrealables: [] },
            preuves: [signal],
          },
        ];
      });
    },
  };
}

const detecteurMuet: Detecteur = { nom: 'd-muet', dependDuViewport: false, detecter: () => [] };

function dependances(surcharges: Partial<DependancesScanner> = {}): DependancesScanner {
  return {
    config,
    explorateur: explorateurSimule(['desktop', 'mobile']),
    observateur: fabriqueObservateur().fabrique,
    detecteurs: [detecteurMuet],
    protocole: protocolePassePlat,
    ia,
    ...surcharges,
  };
}

describe('creerScanner', () => {
  it('enchaîne exploration → détection → confirmation et rend un rapport complet, journalisé, coût 0', async () => {
    const explorateur = explorateurSimule(['desktop', 'mobile']);
    const contexteDetection = { viewports: [] as string[] };
    const scanner = creerScanner(dependances({ explorateur, detecteurs: [detecteurInerteSimule(contexteDetection), detecteurMuet] }));
    const avant = Date.now();

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.url).toBe(ORIGINE);
    expect(rapport.coutApi).toBe(0);
    expect(rapport.dureeMs).toBeGreaterThanOrEqual(0);
    expect(rapport.parcours?.arret).toBe('complet');
    expect(rapport.parcours?.pages).toHaveLength(1);

    // Le contexte d'exploration : URL de départ et échéance = début + timeout.
    expect(explorateur.contextes).toHaveLength(1);
    expect(explorateur.contextes[0]?.urlDepart).toBe(ORIGINE);
    expect(explorateur.contextes[0]?.echeance).toBeGreaterThanOrEqual(avant + 60000);
    expect(explorateur.contextes[0]?.echeance).toBeLessThanOrEqual(Date.now() + 60000);

    // La détection reçoit les viewports de la config et tous les signaux ; le
    // même élément constaté sur deux viewports est dédoublonné (détecteur
    // indépendant du viewport) avec fusion des preuves.
    expect(contexteDetection.viewports).toEqual(config.viewports.map((viewport) => viewport.nom));
    expect(rapport.candidates).toHaveLength(1);
    expect(rapport.candidates?.[0]?.preuves).toHaveLength(2);
    // La fusion n'efface pas où l'anomalie a été vue : les deux viewports restent listés.
    expect(rapport.candidates?.[0]?.observations).toEqual([{ viewport: 'desktop' }, { viewport: 'mobile' }]);

    // Passe-plat : la retenue est la candidate, confiance et localisation intactes.
    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.anomalies[0]).toMatchObject({
      categorie: 'fonctionnel',
      description: 'element-sans-effet',
      urlOuEtape: URL_CONTACT,
      confiance: 0.8,
      element: BOUTON,
      detecteur: 'd-inerte-simule',
    });
    expect(rapport.anomalies[0]?.reproduction?.action?.id).toBe('a1');
    expect(rapport.anomalies[0]?.reproduction?.actionsPrealables).toEqual([]);
    expect(rapport.anomalies[0]?.observations).toEqual([{ viewport: 'desktop' }, { viewport: 'mobile' }]);
    expect(rapport.ecartees).toEqual([]);

    // Journal : l'ordre des étapes, avec les entrées de l'explorateur et du protocole intercalées.
    expect(rapport.journal.map((entree) => entree.type)).toEqual([
      'scan.debut',
      'ia.mode',
      'exploration.viewport',
      'exploration.viewport',
      'exploration.fin',
      'detection.fin',
      'confirmation.passe-plat',
      'scan.fin',
    ]);
    expect(rapport.journal[0]?.details).toMatchObject({
      url: ORIGINE,
      timeoutMs: 60000,
      explorateur: 'explorateur-simule',
      detecteurs: ['d-inerte-simule', 'd-muet'],
      protocole: 'passe-plat',
    });
    expect(rapport.journal[1]?.details).toEqual({ mode: 'degrade', raison: 'cle-absente' });
    expect(rapport.journal.find((entree) => entree.type === 'detection.fin')?.details).toEqual({
      nbSignaux: 2,
      nbCandidates: 1,
      parDetecteur: { 'd-inerte-simule': 1, 'd-muet': 0 },
    });
    expect(rapport.journal.at(-1)?.details).toMatchObject({ coutApi: 0, nbAnomalies: 1, arret: 'complet' });
    for (const entree of rapport.journal) {
      expect(entree.horodatage).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // Le rapport est sérialisable tel quel (journalisation JSON, constitution §5).
    expect(JSON.parse(JSON.stringify(rapport))).toEqual(rapport);
  });

  it('rend un rapport vide (aucune anomalie, aucune candidate) quand les détecteurs ne trouvent rien', async () => {
    const scanner = creerScanner(dependances());
    const rapport = await scanner(ORIGINE, { timeoutMs: 1000 });
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.candidates).toEqual([]);
    expect(rapport.ecartees).toEqual([]);
    expect(rapport.coutApi).toBe(0);
  });

  it('capture une exception d’exploration : rapport partiel (arret erreur, scan.erreur), détection sur les signaux collectés', async () => {
    const contexteDetection = { viewports: [] as string[] };
    const scanner = creerScanner(
      dependances({ explorateur: explorateurEnPanne('navigateur perdu'), detecteurs: [detecteurInerteSimule(contexteDetection)] }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 1000 });

    expect(rapport.parcours).toEqual({ urlDepart: ORIGINE, pages: [], actions: [], arret: 'erreur' });
    const erreur = rapport.journal.find((entree) => entree.type === 'scan.erreur');
    expect(erreur?.details).toEqual({ etape: 'exploration', message: 'navigateur perdu' });
    expect(rapport.journal.map((entree) => entree.type)).toEqual([
      'scan.debut',
      'ia.mode',
      'scan.erreur',
      'detection.fin',
      'confirmation.passe-plat',
      'scan.fin',
    ]);
    // Le signal émis avant la panne est bien passé à la détection.
    expect(rapport.candidates).toHaveLength(1);
    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.anomalies[0]?.reproduction?.action).toBeNull();
  });

  it('rend un rapport même si l’explorateur rejette avec autre chose qu’une Error', async () => {
    const explorateur: Explorateur = { nom: 'rejet-brut', explorer: () => Promise.reject('panne brute') };
    const rapport = await creerScanner(dependances({ explorateur }))(ORIGINE, { timeoutMs: 1000 });
    expect(rapport.parcours?.arret).toBe('erreur');
    expect(rapport.journal.find((entree) => entree.type === 'scan.erreur')?.details).toEqual({ etape: 'exploration', message: 'panne brute' });
  });

  it('additionne le coût de la confirmation et rapporte les candidates écartées par le protocole', async () => {
    const contexteDetection = { viewports: [] as string[] };
    const protocoleSevere: ProtocoleConfirmation = {
      nom: 'protocole-severe',
      async confirmer(candidates, contexte) {
        contexte.journaliser('confirmation.severe', { nb: candidates.length });
        expect(contexte.urlDepart).toBe(ORIGINE);
        expect(contexte.options).toEqual({ timeoutMs: 2000 });
        expect(contexte.echeance).toBeGreaterThan(Date.now());
        return { retenues: [], ecartees: candidates.map((candidate) => ({ candidate, raison: 'non-reproduite' })), coutApi: 0.25 };
      },
    };
    const scanner = creerScanner(dependances({ detecteurs: [detecteurInerteSimule(contexteDetection)], protocole: protocoleSevere }));

    const rapport = await scanner(ORIGINE, { timeoutMs: 2000 });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.candidates).toHaveLength(1);
    expect(rapport.ecartees).toHaveLength(1);
    expect(rapport.ecartees?.[0]?.raison).toBe('non-reproduite');
    expect(rapport.coutApi).toBe(0.25);
    expect(rapport.journal.map((entree) => entree.type)).toContain('confirmation.severe');
    expect(rapport.journal.at(-1)?.details).toMatchObject({ coutApi: 0.25, nbAnomalies: 0 });
  });

  it('refuse une URL de départ non http(s) SANS explorer (aucun navigateur lancé, aucun fichier local lu)', async () => {
    const explorateur: Explorateur = {
      nom: 'explorateur-jamais-appele',
      explorer: () => Promise.reject(new Error('ne doit pas être appelé')),
    };
    const scanner = creerScanner(dependances({ explorateur }));
    for (const url of ['file:///etc/passwd', 'data:text/html,<h1>x</h1>', 'javascript:alert(1)', 'pas une url']) {
      const rapport = await scanner(url, { timeoutMs: 1000 });
      expect(rapport.parcours?.arret).toBe('erreur');
      expect(rapport.anomalies).toEqual([]);
      expect(rapport.journal.find((entree) => entree.type === 'scan.erreur')?.details).toMatchObject({ etape: 'url' });
      expect(rapport.journal.at(-1)?.type).toBe('scan.fin');
    }
  });

  it('crée un observateur neuf à chaque scan : les signaux d’un scan ne fuient pas dans le suivant', async () => {
    const { fabrique, instances } = fabriqueObservateur();
    const scanner = creerScanner(dependances({ observateur: fabrique }));

    const premier = await scanner(ORIGINE, { timeoutMs: 1000 });
    const second = await scanner(ORIGINE, { timeoutMs: 1000 });

    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
    expect(premier.journal.find((entree) => entree.type === 'detection.fin')?.details).toMatchObject({ nbSignaux: 2 });
    expect(second.journal.find((entree) => entree.type === 'detection.fin')?.details).toMatchObject({ nbSignaux: 2 });
  });
});
