/**
 * Tests d'intégration de robustesse : pages que le banc ne sert pas mais que
 * n'importe quel site réel peut présenter (bouton image, balise à espace de
 * noms, formulaire sans bouton, validation native, redirection hors origine
 * après chargement, backend muet, liens redirigés, formulaire laissé derrière
 * par une navigation).
 *
 * Chaque cas est servi par un serveur HTTP en mémoire, exploré par un vrai
 * Chromium avec des délais resserrés ; serveurs et navigateur sont fermés.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntreeJournal, Parcours, Signal } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { COUCHE_FILTRE_DESTRUCTIF } from './couches.js';
import { creerExplorateur } from './explorateur.js';
import { creerFiltre, type FiltreActions } from './filtre-actions.js';
import { politiqueDeterministe } from './politique.js';

/** Délais resserrés : ces tests n'attendent que des effets immédiats. */
function resserrer(base: ConfigScanner, surcharges: Partial<ConfigScanner['exploration']> = {}): ConfigScanner {
  return {
    ...base,
    // Un seul viewport : ces cas ne dépendent pas des dimensions.
    viewports: base.viewports.slice(0, 1),
    exploration: {
      ...base.exploration,
      chargementPageMs: 4000,
      attenteEffetMaxMs: 1500,
      stabilisationMs: 120,
      sondageMs: 20,
      clicMs: 800,
      saisieMs: 800,
      margeEcheanceMs: 300,
      evaluationMs: 3000,
      ...surcharges,
    },
  };
}

interface RequeteVue {
  methode: string;
  chemin: string;
}

interface ServeurTest {
  url: string;
  requetes: RequeteVue[];
  arreter(): Promise<void>;
}

type Gestionnaire = (requete: IncomingMessage, reponse: ServerResponse, chemin: string) => void;

async function servir(gestionnaire: Gestionnaire): Promise<ServeurTest> {
  const requetes: RequeteVue[] = [];
  const serveur: Server = createServer((requete, reponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://local.invalid').pathname;
    requetes.push({ methode: requete.method ?? '', chemin });
    gestionnaire(requete, reponse, chemin);
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requetes,
    async arreter() {
      await new Promise<void>((resoudre, rejeter) => {
        serveur.close((erreur) => (erreur ? rejeter(erreur) : resoudre()));
        serveur.closeAllConnections();
      });
    },
  };
}

/** Répond une page HTML minimale. */
function html(reponse: ServerResponse, corps: string, statut = 200, entetes: Record<string, string> = {}): void {
  reponse.writeHead(statut, { 'content-type': 'text/html; charset=utf-8', ...entetes });
  reponse.end(`<!doctype html><html lang="fr"><body>${corps}</body></html>`);
}

interface Resultat {
  parcours: Parcours;
  signaux: Signal[];
  journal: EntreeJournal[];
}

let base: ConfigScanner;
let filtre: FiltreActions;
let navigateur: Browser;

beforeAll(async () => {
  base = await chargerConfigScanner();
  filtre = creerFiltre(await chargerActionsInterdites());
  navigateur = await lancerNavigateur(base);
});

afterAll(async () => {
  await navigateur?.close();
});

async function explorer(url: string, config: ConfigScanner, dureeMs = 15_000): Promise<Resultat> {
  const journal: EntreeJournal[] = [];
  const observateur = creerObservateur();
  const deterministe = politiqueDeterministe(config.remplissage);
  const explorateur = creerExplorateur({ config, politique: deterministe, secours: deterministe, filtre, navigateur });
  const parcours = await explorateur.explorer(
    {
      urlDepart: url,
      echeance: Date.now() + dureeMs,
      journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
    },
    observateur,
  );
  return { parcours, signaux: observateur.signaux(), journal };
}

function chemins(resultat: Resultat): string[] {
  return resultat.parcours.pages.map((page) => new URL(page.url).pathname);
}

describe('filtre d’actions face au DOM réel', () => {
  it('un input[type=image] est le déclencheur du formulaire : son formaction est confronté aux motifs, l’action est interdite', async () => {
    // `form.elements` exclut les boutons image (standard HTML) : sans eux,
    // l'exploration soumettrait par la touche Entrée et le navigateur
    // déclencherait le `formaction` sans que le filtre l'ait jamais vu.
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin === '/x.png') {
        reponse.writeHead(200, { 'content-type': 'image/png' });
        reponse.end();
        return;
      }
      html(
        reponse,
        '<form method="post" action="/api/x"><input type="text" name="q">' +
          '<input type="image" name="envoi" formaction="/delete/9" src="/x.png" alt="x"></form>',
      );
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base));
      const soumission = resultat.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumission?.resultat).toBe('interdite');
      expect(soumission?.action.type === 'soumettre' && soumission.action.declencheur?.balise).toBe('input');
      expect(serveur.requetes.filter((requete) => requete.chemin === '/delete/9')).toEqual([]);
      // Le journal dit par quel canal l'action a été refusée (pas de catégorie hors canal texte).
      expect(soumission?.details).toEqual({ couche: COUCHE_FILTRE_DESTRUCTIF, canal: 'url', motif: 'delete' });
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('un bouton destructif est refusé sur le canal texte, catégorie et langue journalisées', async () => {
    // Chaîne complète : nom perçu lu en page → appariement → journal.
    const serveur = await servir((_requete, reponse) => {
      html(reponse, '<form method="post" action="/api/x"><input type="text" name="q"><button>Supprimer mon compte</button></form>');
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base));
      const soumission = resultat.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumission?.resultat).toBe('interdite');
      expect(soumission?.details).toEqual({ couche: COUCHE_FILTRE_DESTRUCTIF, canal: 'texte', categorie: 'destruction', langue: 'fr', motif: 'suppr' });
      expect(serveur.requetes.filter((requete) => requete.methode === 'POST')).toEqual([]);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('une balise à espace de noms (HTML exporté d’un traitement de texte) ne casse ni le remplissage ni l’exploration', async () => {
    // `<o:p>` donnerait le sélecteur invalide `body > o:p > form` sans échappement.
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin === '/suite') {
        html(reponse, '<p>fin</p>');
        return;
      }
      html(
        reponse,
        '<o:p><form method="post" action="/api/ok"><input type="text" name="b"><button type="submit" name="s">.</button></form></o:p>' +
          '<a href="/suite">.</a>',
      );
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base));
      expect(resultat.parcours.arret).toBe('complet');
      const remplir = resultat.parcours.actions.find((action) => action.action.type === 'remplir');
      expect(remplir?.resultat).toBe('ok');
      expect(chemins(resultat)).toContain('/suite');
      expect(serveur.requetes.some((requete) => requete.methode === 'POST' && requete.chemin === '/api/ok')).toBe(true);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);
});

describe('soumission : règles du navigateur', () => {
  it('formulaire sans bouton : Entrée ne soumet que s’il n’y a qu’un champ bloquant (standard HTML)', async () => {
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin === '/un') {
        html(reponse, '<form id="u" method="get" action="/resultat"><input type="search" name="q"></form>');
        return;
      }
      if (chemin === '/resultat') {
        html(reponse, '<p>.</p>');
        return;
      }
      html(
        reponse,
        '<form id="f" method="get" action="/liste"><input type="number" name="min"><input type="number" name="max"></form>',
      );
    });
    try {
      const plusieurs = await explorer(serveur.url, resserrer(base, { profondeurMax: 0 }));
      const soumission = plusieurs.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumission?.resultat).toBe('bloquee');
      expect(soumission?.details).toMatchObject({ raison: 'aucun-declencheur' });
      expect(serveur.requetes.some((requete) => requete.chemin === '/liste')).toBe(false);

      const unique = await explorer(`${serveur.url}/un`, resserrer(base, { profondeurMax: 0 }));
      const soumise = unique.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumise?.resultat).toBe('ok');
      expect(serveur.requetes.some((requete) => requete.chemin === '/resultat')).toBe(true);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('formulaire que la validation native refuse (case obligatoire) : soumission bloquée, jamais « sans effet »', async () => {
    const serveur = await servir((_requete, reponse) => {
      html(
        reponse,
        '<form method="post" action="/api/ok"><input type="text" name="n"><input type="checkbox" name="cgu" required>' +
          '<button type="submit">.</button></form>',
      );
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base, { profondeurMax: 0 }));
      const soumission = resultat.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumission?.resultat).toBe('bloquee');
      expect(soumission?.details).toMatchObject({ raison: 'validation-native' });
      expect(serveur.requetes.some((requete) => requete.methode === 'POST')).toBe(false);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('backend muet derrière un formulaire natif : l’exploration rend son parcours avant l’échéance', async () => {
    const pendantes: ServerResponse[] = [];
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin === '/muet') {
        pendantes.push(reponse);
        return;
      }
      html(reponse, '<form method="post" action="/muet"><input type="text" name="n"><button type="submit">.</button></form>');
    });
    try {
      const debut = Date.now();
      const resultat = await explorer(serveur.url, resserrer(base, { profondeurMax: 0 }), 10_000);
      expect(Date.now() - debut).toBeLessThan(10_000);
      expect(resultat.parcours.actions.some((action) => action.action.type === 'soumettre')).toBe(true);
    } finally {
      for (const reponse of pendantes) {
        reponse.destroy();
      }
      await serveur.arreter();
    }
  }, 30_000);
});

describe('périmètre du site scanné', () => {
  it('une page qui part hors origine APRÈS son chargement n’est ni extraite ni remplie', async () => {
    const tiers = await servir((_requete, reponse) => {
      html(reponse, '<form method="post" action="/collecte"><input type="email" name="e"><button type="submit">.</button></form>');
    });
    const cible = await servir((_requete, reponse) => {
      html(reponse, `<meta http-equiv="refresh" content="0;url=${tiers.url}/"><p>.</p>`);
    });
    try {
      const resultat = await explorer(cible.url, resserrer(base));
      const formulaires = resultat.parcours.pages.flatMap((page) => page.formulaires);
      expect(formulaires).toEqual([]);
      expect(tiers.requetes.some((requete) => requete.methode === 'POST')).toBe(false);
      expect(resultat.journal.some((entree) => entree.type === 'exploration.page.externe')).toBe(true);
    } finally {
      await cible.arreter();
      await tiers.arreter();
    }
  }, 30_000);

  it('une URL de départ non http(s) est refusée sans ouvrir de page', async () => {
    const resultat = await explorer('file:///etc/hosts', resserrer(base));
    expect(resultat.parcours.arret).toBe('erreur');
    expect(resultat.parcours.pages).toEqual([]);
    expect(resultat.journal.some((entree) => entree.type === 'exploration.url.refusee')).toBe(true);
  }, 30_000);
});

describe('couverture de l’exploration', () => {
  it('pagesMax compte les pages CHARGÉES, pas les URL connues : des liens redirigés n’amputent pas la couverture', async () => {
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin.startsWith('/p')) {
        reponse.writeHead(302, { location: `/q${chemin.slice(2)}` });
        reponse.end();
        return;
      }
      if (chemin.startsWith('/q')) {
        html(reponse, '<p>.</p>');
        return;
      }
      html(reponse, [1, 2, 3, 4, 5].map((n) => `<a href="/p${n}">.</a>`).join(''));
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base, { pagesMax: 3 }));
      expect(resultat.parcours.pages).toHaveLength(3);
      expect(chemins(resultat)).toEqual(['/', '/q1', '/q2']);
      expect(resultat.parcours.arret).toBe('limite-pages');
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('un formulaire laissé derrière par une soumission qui navigue est repris au retour sur la page', async () => {
    const serveur = await servir((_requete, reponse, chemin) => {
      if (chemin === '/recherche') {
        html(reponse, '<p>.</p>');
        return;
      }
      html(
        reponse,
        '<form id="recherche" method="get" action="/recherche"><input type="search" name="q"><button type="submit">.</button></form>' +
          '<form id="news" method="post" action="/api/news"><input type="email" name="e"><button type="button">.</button></form>',
      );
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base));
      const soumissions = resultat.parcours.actions.filter((action) => action.action.type === 'soumettre');
      const selecteurs = soumissions.map((action) => (action.action.type === 'soumettre' ? action.action.formulaire.selecteur : ''));
      expect(selecteurs).toContain('#news');
      const news = soumissions.find((action) => action.action.type === 'soumettre' && action.action.formulaire.selecteur === '#news');
      expect(news?.resultat).toBe('ok');
      expect(new URL(news?.page ?? '').pathname).toBe('/');
      expect(resultat.journal.some((entree) => entree.type === 'exploration.page.revisite')).toBe(true);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('une page qui mute en continu (carrousel) : le bouton mort reste détectable et la fenêtre ne traîne pas', async () => {
    // Les mutations périodiques hors zone sont du bruit de fond : elles ne
    // masquent pas l'absence d'effet et ne repoussent pas la stabilisation.
    const serveur = await servir((_requete, reponse) => {
      html(
        reponse,
        '<div id="carrousel"></div>' +
          '<form method="post" action="/api/x"><input type="text" name="n"><button type="button">.</button></form>' +
          '<script>let i=0;setInterval(function(){document.getElementById("carrousel").className="v"+(i+=1);},30);</script>',
      );
    });
    try {
      const debut = Date.now();
      const resultat = await explorer(serveur.url, resserrer(base, { profondeurMax: 0 }), 12_000);
      expect(Date.now() - debut).toBeLessThan(10_000);
      const soumission = resultat.parcours.actions.find((action) => action.action.type === 'soumettre');
      expect(soumission?.resultat).toBe('ok');
      const fin = resultat.signaux.find((signal) => signal.type === 'fin-action' && signal.actionId === soumission?.id);
      expect(fin?.type === 'fin-action' && fin.effets.mutations).toBeGreaterThan(0);
      expect(fin?.type === 'fin-action' && fin.effets.mutationsHorsBruit).toBe(0);
      expect(fin?.type === 'fin-action' && fin.effets.mutationsZone).toBe(0);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);

  it('la page de DÉPART est observée comme toute navigation : ses réponses portent un actionId', async () => {
    const serveur = await servir((_requete, reponse) => {
      html(reponse, '<p>.</p>');
    });
    try {
      const resultat = await explorer(serveur.url, resserrer(base, { profondeurMax: 0 }));
      const premiere = resultat.parcours.actions[0];
      expect(premiere?.action.type).toBe('naviguer');
      const documents = resultat.signaux.filter((signal) => signal.type === 'reponse-reseau' && signal.typeRessource === 'document');
      expect(documents.length).toBeGreaterThan(0);
      expect(documents.every((signal) => signal.actionId === premiere?.id)).toBe(true);
    } finally {
      await serveur.arreter();
    }
  }, 30_000);
});
