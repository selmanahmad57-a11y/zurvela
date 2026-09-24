/**
 * Test du pipeline complet avec des doublures injectées (aucun navigateur) :
 * un explorateur qui rejoue un scénario simulé, un détecteur qui interprète
 * ses signaux, le protocole passe-plat.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  RAISON_CLE_ABSENTE,
  creerClientIa,
  type ClientIa,
  type ContexteProfilage,
  type ProfilPage,
  type RedactionEstampillee,
  type ResultatIa,
} from '../ia/index.js';
import type {
  AnomalieCandidate,
  ContexteConfirmation,
  ContexteExploration,
  Detecteur,
  Explorateur,
  Observateur,
  Parcours,
  ProtocoleConfirmation,
  Reexecuteur,
  Signal,
} from '../types.js';
import { chargerConfigScanner, type ConfigProfilage, type ConfigRapport, type ConfigScanner } from './config.js';
import { autoDiagnosticMecanique } from './confirmation/auto-diagnostic.js';
import { protocolePassePlat } from './confirmation/passe-plat.js';
import { reexecuteurFactice } from './confirmation/fabriques-test.js';
import { creerProtocole } from './confirmation/protocole.js';
import { MOTIF_REPRODUITE } from './confirmation/verdict.js';
import { DESCRIPTION_404_INTERNE, creerDetecteurHttp } from './detection/d-http.js';
import { DESCRIPTION_IMAGE_CASSEE, creerDetecteurImage } from './detection/d-image.js';
import { creerScanner, RAISON_CONFIRMATION_EN_ERREUR, type DependancesScanner, type SessionRejeu } from './index.js';
import {
  RAISON_CONTEXTE_ABSENT,
  RAISON_PROFILAGE_EN_ERREUR,
  type CollecteProfilage,
  type ExplorateurProfilant,
} from './profilage.js';

const ORIGINE = 'http://127.0.0.1:4800';
const URL_CONTACT = `${ORIGINE}/contact`;
const BOUTON = { balise: 'button', selecteur: '#envoyer', attributs: { type: 'button' } };
const FORMULAIRE = { balise: 'form', selecteur: '#contact', attributs: { action: '/api/contact' } };
const URL_LOGO = `${ORIGINE}/statique/logo.svg`;
const LOGO = { balise: 'img', selecteur: 'img#logo', attributs: { id: 'logo' } };
/** Clé structurelle du groupe que forment les deux lectures du logo mort (méthode + chemin de la ressource). */
const CLE_GROUPE_LOGO = 'reseau:GET:/statique/logo.svg';

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
    arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0,
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
      contexte.journaliser('exploration.fin', { arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 });
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

/**
 * Le logo interne répond 404 APRÈS la soumission `a1`, et l'image reste sans
 * dimension : un seul défaut, deux lectures — la cause technique
 * (`ressource-interne-404`, portée par D-HTTP, qui tient l'action à rejouer)
 * et le symptôme visible (`image-cassee`, porté par D-IMAGE).
 */
function signauxLogoMort(page: string, viewport: string): Signal[] {
  const horodatage = new Date().toISOString();
  return [
    {
      type: 'reponse-reseau',
      horodatage,
      page,
      viewport,
      actionId: 'a1',
      urlRessource: URL_LOGO,
      methode: 'GET',
      statut: 404,
      typeRessource: 'image',
      dureeMs: 12,
      interne: true,
    },
    // Sans `actionId` : c'est l'état de l'image, pas l'effet de l'action —
    // c'est ce qui prive D-IMAGE du contexte de rejeu, et lui coûte le rôle
    // de représentant.
    { type: 'etat-image', horodatage, page, viewport, ressource: URL_LOGO, element: LOGO, complete: true, largeurNaturelle: 0, hauteurNaturelle: 0 },
  ];
}

/** Explorateur qui rejoue la scène du logo mort sur un seul viewport. */
function explorateurLogoMort(viewport: string): Explorateur {
  return {
    nom: 'explorateur-logo-mort',
    async explorer(contexte, observateur) {
      for (const signal of signauxLogoMort(URL_CONTACT, viewport)) {
        observateur.emettre(signal);
      }
      return parcoursSimule(contexte.urlDepart, viewport);
    },
  };
}

/** Re-exécuteur qui re-constate exactement la même scène : le défaut se reproduit. */
const reexecuteurLogoMort: Reexecuteur = {
  rejouer: (reproduction, viewport) =>
    Promise.resolve({
      signaux: signauxLogoMort(reproduction.url, viewport.nom),
      parcours: parcoursSimule(reproduction.url, viewport.nom),
      echecOutillage: false,
      dureeMs: 20,
    }),
};

/** Session de rejeu simulée : compte ses ouvertures et ses fermetures (elle doit être fermée dans TOUS les cas). */
function fabriqueSession(): { ouvrir: DependancesScanner['ouvrirRejeu']; ouvertures: number; fermetures: number } {
  const suivi = {
    ouvertures: 0,
    fermetures: 0,
    ouvrir: (): SessionRejeu => {
      suivi.ouvertures += 1;
      return {
        reexecuteur: reexecuteurFactice([]),
        fermer: () => {
          suivi.fermetures += 1;
          return Promise.resolve();
        },
      };
    },
  };
  return suivi;
}

function dependances(surcharges: Partial<DependancesScanner> = {}): DependancesScanner {
  return {
    config,
    explorateur: explorateurSimule(['desktop', 'mobile']),
    observateur: fabriqueObservateur().fabrique,
    detecteurs: [detecteurMuet],
    protocole: protocolePassePlat,
    ouvrirRejeu: fabriqueSession().ouvrir,
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
    // Le passe-plat ne consolide ni ne rejoue : le rapport ne prétend PAS le
    // contraire avec des listes vides. Son comportement est inchangé.
    expect(rapport.groupes).toBeUndefined();
    expect(rapport.decouvertes).toBeUndefined();

    // Journal : l'ordre des étapes, avec les entrées de l'explorateur et du protocole intercalées.
    expect(rapport.journal.map((entree) => entree.type)).toEqual([
      'scan.debut',
      'ia.mode',
      'exploration.viewport',
      'exploration.viewport',
      'exploration.fin',
      // Ce que les décisions de navigation ont coûté : zéro en politique
      // déterministe, mais le chiffre est TOUJOURS publié — un coût qu'on ne
      // voit que lorsqu'il est non nul est un coût qu'on ne surveille pas.
      'exploration.cout',
      // Le profilage n'est pas assemblé dans ces dépendances : il se TAIT
      // bruyamment plutôt que de disparaître du journal.
      'profilage.indisponible',
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

    expect(rapport.parcours).toEqual({ urlDepart: ORIGINE, pages: [], actions: [], arret: 'erreur', enAttenteALArret: 0, pagesRestantesALArret: 0 });
    const erreur = rapport.journal.find((entree) => entree.type === 'scan.erreur');
    expect(erreur?.details).toEqual({ etape: 'exploration', message: 'navigateur perdu' });
    expect(rapport.journal.map((entree) => entree.type)).toEqual([
      'scan.debut',
      'ia.mode',
      'scan.erreur',
      'exploration.cout',
      'profilage.indisponible',
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

  it('donne au protocole le contexte COMPLET de confirmation, et ferme la session de rejeu', async () => {
    const session = fabriqueSession();
    let vu: ContexteConfirmation | undefined;
    const protocole: ProtocoleConfirmation = {
      nom: 'protocole-temoin',
      async confirmer(candidates, contexte) {
        vu = contexte;
        return { retenues: [...candidates], ecartees: [], coutApi: 0 };
      },
    };
    const detecteurs = [detecteurInerteSimule({ viewports: [] }), detecteurMuet];

    await creerScanner(dependances({ detecteurs, protocole, ouvrirRejeu: session.ouvrir }))(ORIGINE, { timeoutMs: 2000 });

    // Les mêmes détecteurs que l'étape DÉTECTION : la re-exécution ne duplique aucune règle.
    expect(vu?.detecteurs).toBe(detecteurs);
    expect(vu?.viewports).toBe(config.viewports);
    expect(vu?.reexecuteur).toBeDefined();
    expect(session.ouvertures).toBe(1);
    expect(session.fermetures).toBe(1);
  });

  it('une panne du protocole donne un rapport PARTIEL : rien n’est affirmé, tout est écarté avec sa raison, session fermée', async () => {
    const session = fabriqueSession();
    const protocole: ProtocoleConfirmation = {
      nom: 'protocole-en-panne',
      confirmer: () => Promise.reject(new Error('rejeu impossible')),
    };
    const scanner = creerScanner(
      dependances({ detecteurs: [detecteurInerteSimule({ viewports: [] })], protocole, ouvrirRejeu: session.ouvrir }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 2000 });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.candidates).toHaveLength(1);
    expect(rapport.ecartees?.[0]?.raison).toBe(RAISON_CONFIRMATION_EN_ERREUR);
    expect(rapport.journal.find((entree) => entree.type === 'scan.erreur')?.details).toEqual({
      etape: 'confirmation',
      message: 'rejeu impossible',
    });
    expect(rapport.journal.at(-1)?.type).toBe('scan.fin');
    expect(session.fermetures).toBe(1);
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

describe('creerScanner — traçabilité du protocole dans le Rapport', () => {
  /** Le pipeline complet, avec les VRAIS détecteurs et le VRAI protocole (aucun navigateur). */
  async function scannerLogoMort() {
    const detecteurs = [creerDetecteurHttp(config.detecteurs.http, config.detecteurs.tiers), creerDetecteurImage(config.detecteurs.image)];
    const protocole = creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique });
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurLogoMort('desktop'),
        detecteurs,
        protocole,
        ouvrirRejeu: () => ({ reexecuteur: reexecuteurLogoMort, fermer: () => Promise.resolve() }),
      }),
    );
    return scanner(ORIGINE, { timeoutMs: 60000 });
  }

  it('le symptôme visible survit au choix du représentant, et reste atteignable depuis l’anomalie retenue', async () => {
    const rapport = await scannerLogoMort();

    // Deux candidates, une seule cause : le protocole ne paie qu'une confirmation.
    expect(rapport.candidates).toHaveLength(2);
    expect(rapport.groupes).toHaveLength(1);
    expect(rapport.anomalies).toHaveLength(1);

    // Le représentant est la candidate D-HTTP (elle seule porte l'action à
    // rejouer) : le symptôme que voit un humain, « image-cassee », n'est PAS
    // ce que l'anomalie retenue affiche.
    const anomalie = rapport.anomalies[0];
    expect(anomalie?.detecteur).toBe('d-http');
    expect(anomalie?.description).toBe(DESCRIPTION_404_INTERNE);

    // Le rapport est relu SANS son journal, et sérialisé : c'est la preuve
    // qu'aucune de ces informations n'oblige à re-parser quoi que ce soit.
    const publie = JSON.parse(JSON.stringify({ ...rapport, journal: [] })) as typeof rapport;
    const retenue = publie.anomalies[0];
    expect(retenue?.verdict).toBe('confirmee');
    expect(retenue?.motif).toBe(MOTIF_REPRODUITE);
    expect(retenue?.groupe).toBe(CLE_GROUPE_LOGO);

    // De l'anomalie à son groupe, par la seule clé qu'elle porte…
    const resultat = publie.groupes?.find((candidat) => candidat.groupe.cle === retenue?.groupe);
    expect(resultat).toBeDefined();
    expect(resultat?.verdict).toBe('confirmee');
    expect(resultat?.motif).toBe(retenue?.motif);
    expect(resultat?.tentatives).toHaveLength(config.confirmation.reExecutions);
    // … et du groupe au symptôme perdu par la consolidation.
    expect(resultat?.groupe.descriptions).toEqual([DESCRIPTION_404_INTERNE, DESCRIPTION_IMAGE_CASSEE]);
    expect(resultat?.groupe.membres.map((membre) => membre.detecteur)).toEqual(['d-http', 'd-image']);

    // Les rejeux n'ont rien constaté d'inconnu : aucune découverte.
    expect(publie.decouvertes).toEqual([]);
  });

  it('les groupes couvrent TOUTES les candidates, retenues comme écartées : compter en groupes est possible', async () => {
    const rapport = await scannerLogoMort();
    const membres = rapport.groupes?.flatMap((resultat) => resultat.groupe.membres) ?? [];
    expect(membres).toHaveLength(rapport.candidates?.length ?? 0);
    const retenus = rapport.groupes?.filter((resultat) => resultat.verdict === 'confirmee') ?? [];
    expect(retenus).toHaveLength(rapport.anomalies.length);
    expect(rapport.ecartees).toEqual([]);
  });
});

// ===========================================================================
// Profilage IA (brique 4a) : un appel par scan, une estampille, et un mode
// dégradé qui ne coûte rien et ne tue rien.
// ===========================================================================

const CONFIG_PROFILAGE: ConfigProfilage = {
  typesSite: ['vitrine-contact', 'boutique', 'autre'],
  valeurEchappement: 'autre',
  contexteMaxChars: 6000,
  enTeteMaxChars: 300,
  maxTokensReponse: 512,
  relancesMax: 1,
  facteurConfianceApresRelance: 0.8,
  varianceAppels: 5,
};

const MODELE_PROFILAGE = 'claude-haiku-4-5';

const PROFIL_RENDU: ProfilPage = {
  typeSite: 'vitrine-contact',
  natureLibre: null,
  langue: 'fr',
  confiance: 0.92,
  versionPrompt: 'v1',
  modeleDemande: MODELE_PROFILAGE,
  modeleServi: `${MODELE_PROFILAGE}-20251001`,
  apresRelance: false,
};

/**
 * Explorateur qui propose un contexte de profilage PAR VIEWPORT : c'est le
 * cas défavorable, celui qui prouve que l'unicité de l'appel ne dépend pas
 * de la discipline de l'explorateur.
 */
function explorateurProposant(viewports: string[]): ExplorateurProfilant & { propositions: number } {
  const suivi = {
    nom: 'explorateur-proposant',
    propositions: 0,
    async explorer(contexte: ContexteExploration, observateur: Observateur, collecte?: CollecteProfilage): Promise<Parcours> {
      for (const viewport of viewports) {
        observateur.emettre(finActionInerte(viewport));
        suivi.propositions += 1;
        await collecte?.proposer({ url: `${contexte.urlDepart}#${viewport}`, texte: `body:\n${viewport}`, langueDeclaree: 'fr' });
      }
      return parcoursSimule(contexte.urlDepart, viewports[0] ?? '');
    },
  };
  return suivi;
}

/** Client IA factice : compte ses appels de profilage. JAMAIS de réseau. */
function iaFactice(reponse: ResultatIa<ProfilPage>): ClientIa & { appels: ContexteProfilage[] } {
  const appels: ContexteProfilage[] = [];
  return {
    ...ia,
    appels,
    profiler: async (contexte) => {
      appels.push(contexte);
      return reponse;
    },
  };
}

/** Protocole qui ne fait rien mais FACTURE : de quoi vérifier que les coûts s'additionnent. */
function protocoleCoutant(coutApi: number): ProtocoleConfirmation {
  return {
    nom: 'protocole-coutant',
    confirmer: (candidates) => Promise.resolve({ retenues: [], ecartees: candidates.map((candidate) => ({ candidate, raison: 'simule' })), coutApi }),
  };
}

describe('creerScanner — profilage IA', () => {
  it('appelle le profileur UNE SEULE FOIS par scan, sur le premier contexte proposé, et estampille le rapport', async () => {
    const explorateur = explorateurProposant(['desktop', 'mobile']);
    const clientIa = iaFactice({ disponible: true, valeur: PROFIL_RENDU, coutApi: 0.004 });
    const scanner = creerScanner(
      dependances({ explorateur, ia: clientIa, profilage: { config: CONFIG_PROFILAGE, modele: MODELE_PROFILAGE } }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(explorateur.propositions).toBe(2);
    expect(clientIa.appels).toHaveLength(1);
    expect(clientIa.appels[0]?.url).toBe(`${ORIGINE}#desktop`);
    expect(rapport.profil).toEqual({
      typeSite: 'vitrine-contact',
      natureLibre: null,
      langue: 'fr',
      confiance: 0.92,
      versionPrompt: 'v1',
      modeleDemande: MODELE_PROFILAGE,
      modeleServi: `${MODELE_PROFILAGE}-20251001`,
      apresRelance: false,
    });
    const fin = rapport.journal.find((entree) => entree.type === 'profilage.fin')?.details as Record<string, unknown> | undefined;
    expect(fin).toMatchObject({
      typeSite: 'vitrine-contact',
      langue: 'fr',
      confiance: 0.92,
      coutApi: 0.004,
      versionPrompt: 'v1',
      modeleDemande: MODELE_PROFILAGE,
      modeleServi: `${MODELE_PROFILAGE}-20251001`,
    });
    // Le journal porte le profilage entre l'exploration et la détection.
    const types = rapport.journal.map((entree) => entree.type);
    expect(types.indexOf('profilage.debut')).toBeGreaterThan(types.indexOf('exploration.fin'));
    expect(types.indexOf('profilage.fin')).toBeLessThan(types.indexOf('detection.fin'));
  });

  it('le coût du profilage entre dans Rapport.coutApi, additionné à celui de la confirmation', async () => {
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurProposant(['desktop']),
        detecteurs: [detecteurInerteSimule({ viewports: [] })],
        protocole: protocoleCoutant(0.01),
        ia: iaFactice({ disponible: true, valeur: PROFIL_RENDU, coutApi: 0.004 }),
        profilage: { config: CONFIG_PROFILAGE, modele: MODELE_PROFILAGE },
      }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.coutApi).toBeCloseTo(0.014, 10);
    expect(rapport.journal.find((entree) => entree.type === 'scan.fin')?.details).toMatchObject({ coutApi: rapport.coutApi });
  });

  it('client indisponible : le scan reste vert, le rapport n’a pas de profil, le coût reste nul et le journal dit pourquoi', async () => {
    const clientIa = iaFactice({ disponible: false, raison: RAISON_CLE_ABSENTE });
    const explorateur = explorateurProposant(['desktop', 'mobile']);
    const contexteDetection = { viewports: [] as string[] };
    const scanner = creerScanner(
      dependances({
        explorateur,
        detecteurs: [detecteurInerteSimule(contexteDetection), detecteurMuet],
        ia: clientIa,
        profilage: { config: CONFIG_PROFILAGE, modele: MODELE_PROFILAGE },
      }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    // Le scan a produit exactement ce qu'il produit sans IA : rien n'a bougé.
    expect(rapport.profil).toBeUndefined();
    expect(rapport.coutApi).toBe(0);
    expect(rapport.parcours?.arret).toBe('complet');
    expect(rapport.anomalies).toHaveLength(1);
    expect(clientIa.appels).toHaveLength(1);
    expect(rapport.journal.find((entree) => entree.type === 'profilage.indisponible')?.details).toMatchObject({
      raison: RAISON_CLE_ABSENTE,
      coutApi: 0,
    });
    expect(rapport.journal.map((entree) => entree.type)).not.toContain('profilage.fin');
  });

  it('profileur qui LÈVE : aucune exception ne sort du scan, le rapport est complet et sans profil', async () => {
    const clientIa: ClientIa = { ...ia, profiler: () => Promise.reject(new Error('api injoignable')) };
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurProposant(['desktop']),
        detecteurs: [detecteurInerteSimule({ viewports: [] })],
        ia: clientIa,
        profilage: { config: CONFIG_PROFILAGE, modele: MODELE_PROFILAGE },
      }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.profil).toBeUndefined();
    expect(rapport.coutApi).toBe(0);
    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.journal.find((entree) => entree.type === 'profilage.indisponible')?.details).toMatchObject({
      raison: RAISON_PROFILAGE_EN_ERREUR,
      message: 'api injoignable',
    });
  });

  it('exploration qui ne propose aucun texte : le profileur n’est pas appelé, et le journal le nomme', async () => {
    const clientIa = iaFactice({ disponible: true, valeur: PROFIL_RENDU, coutApi: 1 });
    const scanner = creerScanner(
      dependances({ explorateur: explorateurSimule(['desktop']), ia: clientIa, profilage: { config: CONFIG_PROFILAGE, modele: MODELE_PROFILAGE } }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(clientIa.appels).toEqual([]);
    expect(rapport.profil).toBeUndefined();
    expect(rapport.coutApi).toBe(0);
    expect(rapport.journal.find((entree) => entree.type === 'profilage.indisponible')?.details).toMatchObject({ raison: RAISON_CONTEXTE_ABSENT });
  });
});

/**
 * LA CINQUIÈME ÉTAPE — le rapport business, dernière du pipeline et seule qui
 * ne regarde pas le site.
 *
 * Ce qui est éprouvé ici est son INSERTION : que le rapport soit produit, que
 * son coût forme bien une QUATRIÈME famille, et qu'une panne de rédaction ne
 * coûte jamais un scan.
 */
describe('creerScanner — rapport business', () => {
  const CONFIG_RAPPORT: ConfigRapport = {
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
  };

  /** Client qui rédige : une phrase par champ, un identifiant par section énumérée. */
  function iaQuiRedige(coutApi: number): ClientIa & { langues: string[] } {
    const langues: string[] = [];
    return {
      ...ia,
      langues,
      rediger: async (contexte): Promise<ResultatIa<RedactionEstampillee>> => {
        langues.push(contexte.langue);
        return {
          disponible: true,
          coutApi,
          valeur: {
            synthese: 'Un défaut empêche vos visiteurs d’aller au bout.',
            ligneMethode: 'Chaque signalement est re-vérifié avant publication.',
            sections: contexte.sections.map((section) => ({
              sectionId: section.id,
              titre: 'Titre',
              constat: 'Constat',
              impact: 'Impact',
              actionSuggeree: 'Action',
            })),
            provenance: {
              versionPrompt: 'v1',
              modeleDemande: 'claude-opus-5',
              modeleServi: 'claude-opus-5-20260101',
              apresRelance: false,
            },
          },
        };
      },
    };
  }

  it('produit le rapport après la confirmation, et son coût forme la QUATRIÈME famille', async () => {
    const clientIa = iaQuiRedige(0.03);
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurSimule(['desktop']),
        detecteurs: [detecteurInerteSimule({ viewports: [] })],
        protocole: protocoleCoutant(0.01),
        ia: clientIa,
        rapport: CONFIG_RAPPORT,
      }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    // Le protocole `protocoleCoutant` n'ayant RETENU aucune anomalie, il n'y a
    // rien à rédiger : aucun appel, aucun coût de rédaction. Un site sain ne
    // doit pas payer un modèle pour qu'on lui écrive qu'il va bien.
    expect(clientIa.langues).toEqual([]);
    expect(rapport.rapportBusiness?.sections).toEqual([]);
    expect(rapport.coutApiParFamille).toEqual({ exploration: 0, profilage: 0, confirmation: 0.01, redaction: 0 });
    // Les QUATRE familles partitionnent : leur somme vaut le total.
    const parFamille = rapport.coutApiParFamille;
    if (parFamille === undefined) throw new Error('ventilation absente');
    const somme = parFamille.exploration + parFamille.profilage + parFamille.confirmation + parFamille.redaction;
    expect(somme).toBeCloseTo(rapport.coutApi, 10);
  });

  /**
   * Le pipeline avec le VRAI protocole : lui seul rend des VERDICTS, et sans
   * verdict il n'existe aucun statut honnête à publier — le passe-plat, qui
   * retient tout sans rien vérifier, ne produit donc aucune section. C'est le
   * comportement voulu, et il est éprouvé à part.
   */
  function scannerConfirmant(clientIa: ClientIa) {
    const detecteurs = [creerDetecteurHttp(config.detecteurs.http, config.detecteurs.tiers), creerDetecteurImage(config.detecteurs.image)];
    return creerScanner(
      dependances({
        explorateur: explorateurLogoMort('desktop'),
        detecteurs,
        protocole: creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique }),
        ouvrirRejeu: () => ({ reexecuteur: reexecuteurLogoMort, fermer: () => Promise.resolve() }),
        ia: clientIa,
        rapport: CONFIG_RAPPORT,
      }),
    );
  }

  it('avec des anomalies retenues : la prose est écrite, le coût est ventilé, la somme tient', async () => {
    const clientIa = iaQuiRedige(0.03);
    const scanner = scannerConfirmant(clientIa);

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.rapportBusiness?.sansProse).toBe(false);
    expect(rapport.rapportBusiness?.sections[0]?.titre).toBe('Titre');
    expect(rapport.coutApiParFamille?.redaction).toBeCloseTo(0.03, 10);
    expect(rapport.coutApi).toBeCloseTo(0.03, 10);
    expect(rapport.journal.find((entree) => entree.type === 'rapport.redige')).toBeDefined();
  });

  it('la LANGUE du scan est transmise au rédacteur, et elle prime sur la config', async () => {
    const clientIa = iaQuiRedige(0);
    const scanner = scannerConfirmant(clientIa);

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000, langueRapport: 'en' });

    expect(clientIa.langues).toEqual(['en']);
    expect(rapport.rapportBusiness?.langue).toBe('en');
  });

  it('une rédaction INDISPONIBLE ne coûte pas le scan : rapport structurel, scan vert', async () => {
    // Constitution §4 : le moteur reste utile sans IA. C'est ici que cela se
    // voit à l'œil nu.
    const muet: ClientIa = { ...ia, rediger: async () => ({ disponible: false, raison: RAISON_CLE_ABSENTE, coutApi: 0.002 }) };
    const scanner = scannerConfirmant(muet);

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.rapportBusiness?.sansProse).toBe(true);
    expect(rapport.rapportBusiness?.sections).toHaveLength(1);
    expect(rapport.rapportBusiness?.sections[0]?.statutFormule).not.toBe('');
    expect(rapport.anomalies).toHaveLength(1);
    // Le coût DÉPENSÉ sans rien produire reste compté : un coût invisible ment.
    expect(rapport.coutApiParFamille?.redaction).toBeCloseTo(0.002, 10);
    expect(rapport.journal.find((entree) => entree.type === 'rapport.sans-prose')).toBeDefined();
  });

  it('sans réglages de rapport, le scan ne produit AUCUN rapport business et ne facture rien', async () => {
    const scanner = creerScanner(
      dependances({ explorateur: explorateurSimule(['desktop']), detecteurs: [detecteurInerteSimule({ viewports: [] })] }),
    );
    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });
    expect(rapport.rapportBusiness).toBeUndefined();
    expect(rapport.coutApiParFamille?.redaction).toBe(0);
  });

  it('une anomalie retenue SANS verdict ne reçoit aucun statut, et le journal la NOMME', async () => {
    // Le protocole passe-plat retient tout sans rien vérifier : aucune des
    // quatre formulations ne peut alors être promise sans mentir. L'anomalie
    // n'est ni publiée sous le statut du voisin, ni perdue en silence.
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurSimule(['desktop']),
        detecteurs: [detecteurInerteSimule({ viewports: [] })],
        ia: iaQuiRedige(0),
        rapport: CONFIG_RAPPORT,
      }),
    );
    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });
    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.rapportBusiness?.sections).toEqual([]);
    expect(rapport.journal.find((entree) => entree.type === 'rapport.section-non-situee')).toBeDefined();
  });
});

/**
 * LE FILET DE LA DERNIÈRE ÉTAPE. Toutes les étapes du pipeline rendent un
 * rapport PARTIEL plutôt qu'une exception (constitution §4) ; la rédaction
 * était la seule sans try/catch, et son module lève délibérément sur une
 * configuration dont la langue n'a pas de formulations vérifiées.
 */
describe('creerScanner — une panne de rédaction ne coûte jamais le rapport technique', () => {
  it('une configuration de rapport invalide ne tue pas le scan : le rapport technique survit', async () => {
    const scanner = creerScanner(
      dependances({
        explorateur: explorateurSimule(['desktop']),
        detecteurs: [detecteurInerteSimule({ viewports: [] })],
        // `de` n'a aucune formulation de statut vérifiée : `resoudreLangue`
        // lève. En production le chargement de config l'attrape d'abord ; ici
        // la config est construite à la main, exactement comme le ferait un
        // assemblage futur qui court-circuiterait le chargeur.
        rapport: {
          langueRapport: 'de',
          sectionsMax: 20,
          localisationsMaxParSection: 8,
          faitsMaxChars: 6000,
          cheminMaxChars: 120,
          symptomesMaxChars: 200,
          ligneMaxChars: 1400,
          maxTokensReponse: 4096,
          relancesMax: 1,
          appelMaxMs: 120000,
        },
      }),
    );

    const rapport = await scanner(ORIGINE, { timeoutMs: 60000 });

    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.rapportBusiness).toBeUndefined();
    expect(rapport.journal.find((entree) => entree.type === 'scan.erreur')?.details).toMatchObject({ etape: 'rapport' });
  });
});
