/**
 * LE POINT CRITIQUE de la brique 4b, éprouvé sur un vrai navigateur : les
 * trois couches, dans l'ordre, et ce qu'elles arrêtent.
 *
 * Ce qui se démontre ici ne se démontre pas en relisant du code :
 *  - une action ABSENTE de l'énumération n'est jamais exécutée, même si la
 *    politique la nomme — et la preuve n'est pas un journal, c'est le
 *    JOURNAL DU SERVEUR : la requête n'est jamais partie ;
 *  - le filtre d'actions destructives passe APRÈS la décision, jamais avant
 *    ni à la place : l'action destructive est ÉNUMÉRÉE, elle est ÉLUE, et
 *    c'est seulement ensuite qu'elle est refusée. Filtrer plus tôt ferait
 *    disparaître du journal ce qui a été voulu ;
 *  - un appel IA en échec fait trancher CETTE décision par la déterministe,
 *    et le scan continue.
 *
 * Chaque cas est servi par un serveur HTTP en mémoire ; serveurs et navigateur
 * sont fermés.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientIa, DecisionEstampillee, ResultatIa } from '../../ia/index.js';
import { RAISON_CASSETTE_ABSENTE } from '../../ia/index.js';
import type { Action, ActionExecutee, EntreeJournal, EtatDecisionEnumere, Parcours, PolitiqueDecision, ProvenanceDecision } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { COUCHE_ENUMERATION, COUCHE_FILTRE_DESTRUCTIF, EVENEMENT_COUCHE } from './couches.js';
import { creerExplorateur, EVENEMENT_DECISION, EVENEMENT_ENUMERATION, RAISON_HORS_ENUMERATION } from './explorateur.js';
import { creerFiltre, creerFiltreElement, type FiltreActions, type FiltreElement } from './filtre-actions.js';
import { NOM_POLITIQUE_DETERMINISTE, politiqueDeterministe } from './politique.js';
import { EVENEMENT_REPLI, NOM_POLITIQUE_IA, politiqueIa } from './politique-ia.js';

/** Chemin jamais lié depuis aucune page : il ne peut donc jamais être énuméré. */
const CHEMIN_PIEGE = '/piege-jamais-lie';
/** Chemin dont un segment est un verbe destructif de `config/actions-interdites.json`. */
const CHEMIN_DESTRUCTIF = '/supprimer/tout';

function resserrer(base: ConfigScanner): ConfigScanner {
  return {
    ...base,
    viewports: base.viewports.slice(0, 1),
    exploration: {
      ...base.exploration,
      chargementPageMs: 4000,
      attenteEffetMaxMs: 1200,
      stabilisationMs: 120,
      sondageMs: 20,
      clicMs: 800,
      saisieMs: 800,
      margeEcheanceMs: 300,
      evaluationMs: 3000,
    },
  };
}

interface ServeurTest {
  url: string;
  chemins: string[];
  arreter(): Promise<void>;
}

async function servir(pages: Record<string, string>): Promise<ServeurTest> {
  const chemins: string[] = [];
  const serveur: Server = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://local.invalid').pathname;
    chemins.push(chemin);
    const corps = pages[chemin];
    reponse.writeHead(corps === undefined ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
    reponse.end(`<!doctype html><html lang="fr"><body>${corps ?? 'introuvable'}</body></html>`);
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    chemins,
    async arreter() {
      await new Promise<void>((resoudre, rejeter) => {
        serveur.close((erreur) => (erreur ? rejeter(erreur) : resoudre()));
        serveur.closeAllConnections();
      });
    },
  };
}

interface Resultat {
  parcours: Parcours;
  journal: EntreeJournal[];
}

let base: ConfigScanner;
let filtre: FiltreActions;
let filtreElement: FiltreElement;
let navigateur: Browser;

beforeAll(async () => {
  base = resserrer(await chargerConfigScanner());
  const actionsInterdites = await chargerActionsInterdites();
  filtre = creerFiltre(actionsInterdites);
  filtreElement = creerFiltreElement(actionsInterdites);
  navigateur = await lancerNavigateur(base);
}, 60_000);

afterAll(async () => {
  await navigateur?.close();
});

async function explorer(url: string, politique: PolitiqueDecision, dureeMs = 20_000): Promise<Resultat> {
  const journal: EntreeJournal[] = [];
  const observateur = creerObservateur();
  const explorateur = creerExplorateur({
    config: base,
    politique,
    secours: politiqueDeterministe(),
    filtre,
    filtreElement,
    navigateur,
  });
  const parcours = await explorateur.explorer(
    {
      urlDepart: url,
      echeance: Date.now() + dureeMs,
      journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
    },
    observateur,
  );
  return { parcours, journal };
}

function entrees(journal: EntreeJournal[], type: string): Record<string, unknown>[] {
  return journal.filter((entree) => entree.type === type).map((entree) => entree.details as Record<string, unknown>);
}

/** Politique qui élit la première action énumérée satisfaisant `predicat`, sinon la première. */
function politiqueQuiElit(predicat: (reperes: Record<string, string>) => boolean): PolitiqueDecision {
  return {
    nom: 'doublure-elective',
    decider(_contexte, etat) {
      const choisie = etat.actions.find((proposee) => predicat(proposee.reperes)) ?? etat.actions[0];
      if (choisie === undefined) {
        throw new Error('énumération vide');
      }
      return Promise.resolve({ action: choisie.action, politique: 'doublure-elective' });
    },
  };
}

describe('couche 1 — l’énumération', () => {
  it('une action que le moteur n’a pas énumérée n’est PAS exécutée, même nommée par la politique', async () => {
    const serveur = await servir({
      '/': '<a href="/a">Catalogue</a>',
      '/a': '<p>a</p>',
      [CHEMIN_PIEGE]: '<p>piege</p>',
    });
    try {
      // Politique hostile : elle forge une action vers une page que rien ne lie.
      const forgee: Action = { type: 'naviguer', url: `${serveur.url}${CHEMIN_PIEGE}` };
      const hostile: PolitiqueDecision = {
        nom: 'doublure-hostile',
        decider: () => Promise.resolve({ action: forgee, politique: 'doublure-hostile' }),
      };

      const resultat = await explorer(serveur.url, hostile);

      // LA preuve : la requête n'est jamais partie.
      expect(serveur.chemins).not.toContain(CHEMIN_PIEGE);
      expect(resultat.parcours.actions.some((a) => a.action.type === 'naviguer' && a.action.url.includes(CHEMIN_PIEGE))).toBe(false);
      // La couche 1 a parlé, et le secours a repris la main : le scan continue.
      const arrets = entrees(resultat.journal, EVENEMENT_COUCHE).filter((d) => d['couche'] === COUCHE_ENUMERATION);
      expect(arrets.length).toBeGreaterThan(0);
      expect(arrets[0]).toMatchObject({ couche: COUCHE_ENUMERATION, politique: 'doublure-hostile', type: 'naviguer' });
      expect(serveur.chemins).toContain('/a');
      expect(resultat.parcours.arret).toBe('complet');
      const decisions = entrees(resultat.journal, EVENEMENT_DECISION);
      expect(decisions.every((d) => d['politique'] === NOM_POLITIQUE_DETERMINISTE)).toBe(true);
      expect(decisions.every((d) => d['raisonRepli'] === RAISON_HORS_ENUMERATION)).toBe(true);
    } finally {
      await serveur.arreter();
    }
  }, 40_000);

  it('énumère des identifiants opaques et des chemins, jamais un sélecteur ni un hôte', async () => {
    const serveur = await servir({
      '/': `<a href="/a">${'Catalogue des produits de la boutique. '.repeat(10)}</a>`,
      '/a': '<p>a</p>',
    });
    const etats: EtatDecisionEnumere[] = [];
    try {
      const observatrice: PolitiqueDecision = {
        nom: 'doublure-observatrice',
        decider(_contexte, etat) {
          etats.push(etat);
          const premiere = etat.actions[0];
          if (premiere === undefined) {
            throw new Error('énumération vide');
          }
          return Promise.resolve({ action: premiere.action, politique: 'doublure-observatrice' });
        },
      };

      await explorer(serveur.url, observatrice);

      const premier = etats[0];
      expect(premier).toBeDefined();
      const navigation = premier?.actions.find((proposee) => proposee.type === 'naviguer');
      expect(navigation?.id).toMatch(/^c\d+$/);
      expect(navigation?.reperes).toEqual({ chemin: '/a' });
      expect(navigation?.libelle).toHaveLength(base.exploration.libelleMaxChars);
      expect(navigation?.libelle?.startsWith('Catalogue des produits')).toBe(true);
      // Ce que le moteur garde pour lui : l'acte, avec son URL absolue.
      expect(navigation?.action).toEqual({ type: 'naviguer', url: `${serveur.url}/a` });
      expect(premier?.page).toBe('/');
      expect(premier?.pagesRestantes).toBeLessThanOrEqual(base.exploration.pagesMax);
    } finally {
      await serveur.arreter();
    }
  }, 40_000);
});

describe('couche 3 — le filtre destructif, APRÈS la décision', () => {
  it('l’action destructive est énumérée, élue, puis refusée — dans cet ordre, et le journal le prouve', async () => {
    const serveur = await servir({
      '/': `<a href="${CHEMIN_DESTRUCTIF}">Tout supprimer</a><a href="/a">Catalogue</a>`,
      '/a': '<p>a</p>',
      [CHEMIN_DESTRUCTIF]: '<p>destruction</p>',
    });
    try {
      const resultat = await explorer(serveur.url, politiqueQuiElit((reperes) => reperes['chemin'] === CHEMIN_DESTRUCTIF));

      // 1. Elle a bien été ÉNUMÉRÉE (le filtre ne s'applique pas à l'énumération).
      const enumerations = entrees(resultat.journal, EVENEMENT_ENUMERATION);
      expect(enumerations.length).toBeGreaterThan(0);
      // 2. Elle a été ÉLUE, puis 3. refusée par la couche 3 — dans cet ordre.
      const rangDecision = resultat.journal.findIndex((e) => e.type === EVENEMENT_DECISION);
      const rangRefus = resultat.journal.findIndex(
        (e) => e.type === EVENEMENT_COUCHE && (e.details as Record<string, unknown>)['couche'] === COUCHE_FILTRE_DESTRUCTIF,
      );
      expect(rangDecision).toBeGreaterThanOrEqual(0);
      expect(rangRefus).toBeGreaterThan(rangDecision);
      const refus = resultat.journal[rangRefus]?.details as Record<string, unknown>;
      expect(refus).toMatchObject({ couche: COUCHE_FILTRE_DESTRUCTIF, canal: 'url', type: 'naviguer' });
      expect(refus['actionId']).toMatch(/^c\d+$/);
      // 4. La requête n'est jamais partie, et la décision reste tracée sur l'acte refusé.
      expect(serveur.chemins).not.toContain(CHEMIN_DESTRUCTIF);
      const interdite = resultat.parcours.actions.find((a: ActionExecutee) => a.resultat === 'interdite');
      expect(interdite?.decision).toMatchObject({ politique: 'doublure-elective' });
      expect((interdite?.details as Record<string, unknown>)['couche']).toBe(COUCHE_FILTRE_DESTRUCTIF);
      // 5. Le scan continue : l'autre lien est visité.
      expect(serveur.chemins).toContain('/a');
    } finally {
      await serveur.arreter();
    }
  }, 40_000);
});

describe('politique IA branchée — repli par décision et traçabilité jusqu’à l’acte', () => {
  const provenance = (actionId: string): ProvenanceDecision => ({
    versionPrompt: 'v1',
    modeleDemande: 'claude-haiku-4-5',
    modeleServi: 'claude-haiku-4-5-20251001',
    raison: 'exploration guidée',
    apresRelance: false,
    actionId,
  });

  /** Client doublure : échoue aux `nbEchecs` premiers appels, élit la dernière action ensuite. */
  function clientIa(nbEchecs: number): ClientIa & { appels: number } {
    const suivi = {
      appels: 0,
      mode: 'actif' as const,
      raisonDegrade: null,
      profiler: () => Promise.resolve({ disponible: false as const, raison: 'doublure' }),
      cleDecision: () => null,
    decider(etat: EtatDecisionEnumere): Promise<ResultatIa<DecisionEstampillee>> {
        suivi.appels += 1;
        if (suivi.appels <= nbEchecs) {
          return Promise.resolve({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
        }
        // Élit une navigation quand il y en a une, sinon ce qui reste.
        const choisie = etat.actions.find((proposee) => proposee.type === 'naviguer') ?? etat.actions[etat.actions.length - 1];
        if (choisie === undefined) {
          return Promise.resolve({ disponible: false, raison: 'enumeration-vide' });
        }
        return Promise.resolve({
          disponible: true,
          valeur: { actionId: choisie.id, raison: 'exploration guidée', provenance: provenance(choisie.id) },
          coutApi: 0.0005,
        });
      },
      diagnostiquer: () => Promise.resolve({ disponible: false as const, raison: 'doublure' }),
      rediger: () => Promise.resolve({ disponible: false as const, raison: 'doublure' }),
    };
    return suivi;
  }

  it('un appel en échec fait trancher CETTE décision par la déterministe, le scan continue, l’acte porte la politique réellement appliquée', async () => {
    const serveur = await servir({ '/': '<a href="/a">Catalogue</a>', '/a': '<p>a</p>' });
    const journalPolitique: EntreeJournal[] = [];
    let cout = 0;
    try {
      const politique = politiqueIa({
        ia: clientIa(1),
        deterministe: politiqueDeterministe(),
        journaliser: (type, details) => journalPolitique.push({ horodatage: new Date().toISOString(), type, details }),
        cout: (montant) => {
          cout += montant;
        },
      });

      const resultat = await explorer(serveur.url, politique);

      expect(resultat.parcours.arret).toBe('complet');
      const replis = journalPolitique.filter((entree) => entree.type === EVENEMENT_REPLI);
      expect(replis).toHaveLength(1);
      expect(replis[0]?.details).toMatchObject({ raison: RAISON_CASSETTE_ABSENTE, page: '/' });
      // La première décision est un repli SUBI : elle porte la politique
      // réellement appliquée et la raison, pas la politique demandée.
      const premiere = entrees(resultat.journal, EVENEMENT_DECISION)[0];
      expect(premiere).toMatchObject({
        politiqueDemandee: NOM_POLITIQUE_IA,
        politique: NOM_POLITIQUE_DETERMINISTE,
        raisonRepli: RAISON_CASSETTE_ABSENTE,
      });
      const actes = resultat.parcours.actions.filter((a: ActionExecutee) => a.decision !== undefined);
      expect(actes.length).toBeGreaterThan(0);
      expect(actes[0]?.decision).toMatchObject({ politique: NOM_POLITIQUE_DETERMINISTE, raisonRepli: RAISON_CASSETTE_ABSENTE });
      expect(cout).toBeGreaterThan(0);
    } finally {
      await serveur.arreter();
    }
  }, 40_000);

  it('une décision du modèle descend jusqu’à l’acte avec sa provenance trois champs', async () => {
    const serveur = await servir({ '/': '<a href="/a">Catalogue</a>', '/a': '<p>a</p>' });
    try {
      const politique = politiqueIa({
        ia: clientIa(0),
        deterministe: politiqueDeterministe(),
        journaliser: () => undefined,
      });

      const resultat = await explorer(serveur.url, politique);

      const acte = resultat.parcours.actions.find((a: ActionExecutee) => a.decision?.politique === NOM_POLITIQUE_IA);
      expect(acte?.decision?.provenance).toMatchObject({
        versionPrompt: 'v1',
        modeleDemande: 'claude-haiku-4-5',
        modeleServi: 'claude-haiku-4-5-20251001',
        apresRelance: false,
      });
      expect(acte?.decision?.provenance?.actionId).toMatch(/^c\d+$/);
      expect(acte?.decision?.raisonRepli).toBeUndefined();
      expect(resultat.parcours.arret).toBe('complet');
    } finally {
      await serveur.arreter();
    }
  }, 40_000);
});

/**
 * L'ARRÊT DÉCIDÉ : l'acte que l'énumération ne peut pas borner.
 *
 * `terminer` est toujours énuméré — une politique doit toujours pouvoir
 * s'arrêter — et l'élire ne déclenche AUCUNE des trois couches : c'est une
 * action parfaitement légitime. L'énumération empêche d'inventer un acte, pas
 * de choisir l'inaction. Avant la brique 4b, `arret: 'complet'` était un FAIT
 * du moteur, puisque la politique déterministe ne rend `terminer` que la file
 * vide ; depuis, c'est une AFFIRMATION qu'un contenu de page peut rendre
 * fausse.
 *
 * C'est le sabotage exigé par APPRENTISSAGES n°3 : on ne relit pas le
 * compteur, on construit le cas qui doit l'allumer. Un modèle supposé
 * compromis capitule au premier point de décision ; le parcours doit dire
 * combien d'URL restaient en attente, sans quoi un site hostile obtient un
 * rapport « exploration complète » après une page.
 */
describe('l’arrêt décidé par la politique', () => {
  /** Politique qui élit TOUJOURS `terminer` : la capitulation immédiate. */
  const politiqueQuiCapitule: PolitiqueDecision = {
    nom: 'doublure-capitularde',
    decider(_contexte, etat) {
      const arret = etat.actions.find((proposee) => proposee.type === 'terminer');
      if (arret === undefined) {
        throw new Error('terminer n’est pas énuméré');
      }
      return Promise.resolve({ action: arret.action, politique: 'doublure-capitularde' });
    },
  };

  it('un arrêt décidé alors qu’il restait à faire est COMPTÉ, et le journal dit l’état réel de la file', async () => {
    const serveur = await servir({
      '/': '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>',
      '/a': '<p>a</p>',
      '/b': '<p>b</p>',
      '/c': '<p>c</p>',
    });
    try {
      const resultat = await explorer(serveur.url, politiqueQuiCapitule);

      // Le moteur n'a rien exécuté et se déclare « complet » : c'est l'état
      // que le champ additif rend impossible à croire sur parole.
      expect(resultat.parcours.arret).toBe('complet');
      // Seule la navigation de DÉPART figure au parcours : aucune décision n'a
      // produit d'acte, le modèle ayant capitulé au premier point de choix.
      expect(resultat.parcours.actions.filter((a: ActionExecutee) => a.decision !== undefined)).toHaveLength(0);
      expect(resultat.parcours.enAttenteALArret).toBeGreaterThan(0);
      expect(resultat.parcours.pagesRestantesALArret).toBeGreaterThan(0);

      // AUCUNE couche ne s'est allumée : l'arrêt est légitime, et c'est
      // précisément pourquoi il fallait le rendre visible autrement.
      expect(entrees(resultat.journal, EVENEMENT_COUCHE)).toHaveLength(0);

      const arrets = entrees(resultat.journal, 'action').filter((details) => details['type'] === 'terminer');
      expect(arrets).not.toHaveLength(0);
      for (const arret of arrets) {
        expect(arret['enAttente']).toBeGreaterThan(0);
        expect(arret['pagesRestantes']).toBeGreaterThan(0);
        expect(arret['decision']).toMatchObject({ politique: 'doublure-capitularde' });
      }
    } finally {
      await serveur.arreter();
    }
  }, 40_000);

  it('un arrêt HONNÊTE (plus rien à faire) laisse le compteur à zéro : pas de fausse alarme sur la déterministe', async () => {
    const serveur = await servir({ '/': '<a href="/a">A</a>', '/a': '<p>a</p>' });
    try {
      const resultat = await explorer(serveur.url, politiqueDeterministe());

      expect(resultat.parcours.arret).toBe('complet');
      expect(resultat.parcours.enAttenteALArret).toBe(0);
    } finally {
      await serveur.arreter();
    }
  }, 40_000);
});
