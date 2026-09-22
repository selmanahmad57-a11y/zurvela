import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from './config.js';
import { formulaireContact } from './gabarits/formulaire-contact/index.js';
import { CLASSE_RECOUVREMENT, mediaQueryMobile } from './gabarits/formulaire-contact/bugs/m01-bouton-masque-mobile.js';
import {
  BLOC_GESTION_ERREUR,
  CHEMIN_API_FORMULAIRE,
  CHEMIN_LOGO,
  CHEMIN_SCRIPT_FORMULAIRE,
  PAGE_ACCUEIL,
  PAGE_CONFIRMATION,
  PAGE_CONTACT,
} from './gabarits/formulaire-contact/structure.js';
import { compterBalises } from './outils/transformations.js';
import { demarrerServeur } from './serveur.js';
import type { ConfigBanc, Gabarit, Scenario, ServeurScenario } from './types.js';

const PAGES = [PAGE_ACCUEIL, PAGE_CONTACT, PAGE_CONFIRMATION];
const BOUTON_SUBMIT = { balise: 'button', attribut: 'type', valeur: 'submit' };
const BOUTON_BUTTON = { balise: 'button', attribut: 'type', valeur: 'button' };
const CORPS_VALIDE = { nom: 'Test', email: 'test@zurvela-scan.invalid', message: 'Bonjour' };

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

function scenario(bugsActifs: string[], langue = 'fr', parametres?: Scenario['parametres']): Scenario {
  const id = `test--${bugsActifs.join('-').toLowerCase() || config.scenarios.jetonSain}--${langue}`;
  return { id, gabarit: formulaireContact.nom, langue, bugsActifs, ...(parametres ? { parametres } : {}) };
}

async function servir(
  bugsActifs: string[],
  langue = 'fr',
  parametres?: Scenario['parametres'],
  gabarit: Gabarit = formulaireContact,
): Promise<ServeurScenario> {
  const serveur = await demarrerServeur(scenario(bugsActifs, langue, parametres), gabarit, config);
  serveurs.push(serveur);
  return serveur;
}

async function page(serveur: ServeurScenario, chemin: string): Promise<string> {
  const reponse = await fetch(serveur.url + chemin);
  expect(reponse.status).toBe(200);
  expect(reponse.headers.get('content-type')).toContain('text/html');
  return reponse.text();
}

async function poster(serveur: ServeurScenario, corps: unknown): Promise<Response> {
  return fetch(serveur.url + CHEMIN_API_FORMULAIRE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

/** Requête HTTP brute : contrairement à fetch, le chemin est envoyé tel quel (aucune normalisation des `..`). */
function requeteBrute(serveur: ServeurScenario, chemin: string): Promise<{ statut: number; corps: string }> {
  return new Promise((resoudre, rejeter) => {
    const requete = request({ host: '127.0.0.1', port: serveur.port, path: chemin, method: 'GET' }, (reponse) => {
      const morceaux: Buffer[] = [];
      reponse.on('data', (morceau: Buffer) => morceaux.push(morceau));
      reponse.on('end', () => resoudre({ statut: reponse.statusCode ?? 0, corps: Buffer.concat(morceaux).toString('utf8') }));
    });
    requete.on('error', rejeter);
    requete.end();
  });
}

/** Ligne de requête envoyée telle quelle sur une socket TCP : fetch et node:http refusent une cible absolue mal formée avant l'envoi. */
function ligneDeRequeteBrute(serveur: ServeurScenario, ligne: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const socket = connect({ host: '127.0.0.1', port: serveur.port }, () => {
      socket.write(`${ligne}\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    const morceaux: Buffer[] = [];
    socket.on('data', (morceau: Buffer) => morceaux.push(morceau));
    socket.on('end', () => resoudre(Buffer.concat(morceaux).toString('utf8').split('\r\n')[0] ?? ''));
    socket.on('error', rejeter);
  });
}

beforeAll(async () => {
  config = await chargerConfig();
});

afterEach(async () => {
  await Promise.all(serveurs.splice(0).map((serveur) => serveur.arreter()));
});

describe('site sain', () => {
  it.each(['fr', 'en'])('sert les trois pages en %s, rendues et sans emplacement i18n résiduel', async (langue) => {
    const serveur = await servir([], langue);
    for (const chemin of PAGES) {
      const html = await page(serveur, chemin);
      expect(html).toContain(`<html lang="${langue}">`);
      expect(html).not.toMatch(/\{\{[\w.-]+\}\}/);
    }
    const contact = await page(serveur, PAGE_CONTACT);
    expect(compterBalises(contact, BOUTON_SUBMIT)).toBe(1);
    expect(contact).toContain(`src="${CHEMIN_LOGO}"`);
  });

  it('sert le logo, la feuille de style et le script avec leur type MIME', async () => {
    const serveur = await servir([]);
    const logo = await fetch(serveur.url + CHEMIN_LOGO);
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/svg+xml');
    expect(logo.headers.get('cache-control')).toBe('no-store');

    const script = await fetch(serveur.url + CHEMIN_SCRIPT_FORMULAIRE);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('text/javascript');
    expect(await script.text()).toContain(`@bloc:${BLOC_GESTION_ERREUR}`);

    const style = await fetch(`${serveur.url}${formulaireContact.prefixeStatique}/style.css`);
    expect(style.status).toBe(200);
    expect(style.headers.get('content-type')).toContain('text/css');
  });

  it('accepte un formulaire complet en JSON et en x-www-form-urlencoded, refuse un formulaire incomplet', async () => {
    const serveur = await servir([]);
    const ok = await poster(serveur, CORPS_VALIDE);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await ok.json()).toEqual({ ok: true });

    const formulaire = await fetch(serveur.url + CHEMIN_API_FORMULAIRE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(CORPS_VALIDE).toString(),
    });
    expect(formulaire.status).toBe(200);

    for (const corps of [{ ...CORPS_VALIDE, message: '   ' }, { nom: 'x' }, [], 'texte']) {
      const refus = await poster(serveur, corps);
      expect(refus.status).toBe(400);
      expect(await refus.json()).toEqual({ ok: false });
    }
    const illisible = await fetch(serveur.url + CHEMIN_API_FORMULAIRE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{pas du json',
    });
    expect(illisible.status).toBe(400);
  });

  it('répond 405 sur une route connue avec une méthode non gérée, 404 sur une route inconnue', async () => {
    const serveur = await servir([]);
    expect((await fetch(serveur.url + CHEMIN_API_FORMULAIRE)).status).toBe(405);
    expect((await fetch(serveur.url + PAGE_CONTACT, { method: 'POST' })).status).toBe(405);
    expect((await fetch(serveur.url + CHEMIN_LOGO, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(`${serveur.url}/inexistante`)).status).toBe(404);
    expect((await fetch(`${serveur.url}${formulaireContact.prefixeStatique}/inexistante.css`)).status).toBe(404);
    expect((await fetch(`${serveur.url}${formulaireContact.prefixeStatique}/images/`)).status).toBe(404);
  });

  it('lève au démarrage si un bug actif est inconnu du gabarit', async () => {
    await expect(demarrerServeur(scenario(['Z99']), formulaireContact, config)).rejects.toThrow(/Z99/);
  });

  it.each([
    ['M01', { largeurMaxMobilePx: 'grand' }],
    ['M01', { largeurMaxMobilePx: -1 }],
    ['R01', { delaiReponseMs: 'cinq' }],
    ['R01', { delaiReponseMs: -1 }],
    ['V01', { cheminRessourceIntrouvable: 42 }],
  ] as const)('lève au démarrage si un paramètre de %s est invalide (%o), sans jamais servir', async (bug, parametres) => {
    await expect(demarrerServeur(scenario([bug], 'fr', { [bug]: parametres }), formulaireContact, config)).rejects.toThrow(new RegExp(bug));
  });

  it('lève au démarrage si une transformation ne trouve pas son repère dans une page', async () => {
    // La page d’accueil servie à la place de /contact n’a pas de zone d’envoi : M01 ne peut pas s’appliquer.
    const gabaritSansRepere: Gabarit = { ...formulaireContact, routesPages: { [PAGE_CONTACT]: 'pages/accueil.html' } };
    await expect(demarrerServeur(scenario(['M01']), gabaritSansRepere, config)).rejects.toThrow(/M01/);
    // Sans bug, le même gabarit se sert normalement : c’est bien la transformation qui est refusée.
    const serveur = await servir([], 'fr', undefined, gabaritSansRepere);
    expect((await fetch(serveur.url + PAGE_CONTACT)).status).toBe(200);
  });

  it('lève au démarrage si une page référence une clé i18n absente du dictionnaire du site', async () => {
    // Un site dont le dictionnaire ne contient que `langue` : la première page rendue lève.
    const dossierSite = await mkdtemp(path.join(tmpdir(), 'zurvela-site-'));
    try {
      await mkdir(path.join(dossierSite, 'locales'));
      await writeFile(path.join(dossierSite, 'locales', 'fr.json'), JSON.stringify({ langue: 'fr' }), 'utf8');
      await cp(path.join(formulaireContact.dossierSite, 'pages'), path.join(dossierSite, 'pages'), { recursive: true });
      await cp(path.join(formulaireContact.dossierSite, formulaireContact.dossierStatique), path.join(dossierSite, formulaireContact.dossierStatique), { recursive: true });
      await expect(demarrerServeur(scenario([]), { ...formulaireContact, dossierSite }, config)).rejects.toThrow(/Clé i18n introuvable/);
    } finally {
      await rm(dossierSite, { recursive: true, force: true });
    }
  });

  it('sert des routes de page et d’API non-ASCII, en forme brute comme percent-encodée', async () => {
    const routePage = '/お問い合わせ';
    const routeApi = '/api/問い合わせ';
    const gabaritJaponais: Gabarit = {
      ...formulaireContact,
      routesPages: { ...formulaireContact.routesPages, [routePage]: 'pages/contact.html' },
      cheminApiFormulaire: routeApi,
    };
    const serveur = await servir(['F01'], 'fr', undefined, gabaritJaponais);
    for (const chemin of [routePage, encodeURI(routePage)]) {
      const reponse = await fetch(serveur.url + chemin);
      expect(reponse.status).toBe(200);
      // La route reçue par le bug est la route déclarée : F01 ne s’y applique pas (pages: ['/contact']), la page y est saine.
      expect(compterBalises(await reponse.text(), BOUTON_SUBMIT)).toBe(1);
    }
    expect(compterBalises(await page(serveur, PAGE_CONTACT), BOUTON_SUBMIT)).toBe(0);
    for (const chemin of [routeApi, encodeURI(routeApi)]) {
      const reponse = await fetch(serveur.url + chemin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(CORPS_VALIDE),
      });
      expect(reponse.status).toBe(200);
    }
    expect((await poster(serveur, CORPS_VALIDE)).status).toBe(404);
  });

  it('répond 400, sans 500 ni trace, à une ligne de requête dont la cible absolue est invalide', async () => {
    const serveur = await servir([]);
    const erreurs: unknown[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]): void => {
      erreurs.push(args);
    };
    try {
      expect(await ligneDeRequeteBrute(serveur, 'GET http://[::1 HTTP/1.1')).toMatch(/^HTTP\/1\.1 400 /);
      expect(await ligneDeRequeteBrute(serveur, `GET http://evil.example${PAGE_CONTACT} HTTP/1.1`)).toMatch(/^HTTP\/1\.1 200 /);
    } finally {
      console.error = consoleError;
    }
    expect(erreurs).toEqual([]);
  });

  it('attribue des ports distincts à deux serveurs simultanés', async () => {
    const premier = await servir([]);
    const second = await servir([]);
    expect(second.port).not.toBe(premier.port);
    expect(second.port).toBeGreaterThanOrEqual(config.serveur.portDeBase);
    expect((await fetch(premier.url + PAGE_ACCUEIL)).status).toBe(200);
    expect((await fetch(second.url + PAGE_ACCUEIL)).status).toBe(200);
  });
});

describe('sécurité du serveur statique', () => {
  const CHEMINS_HOSTILES = [
    '/statique/../../package.json',
    '/statique/..%2F..%2Fpackage.json',
    '/statique/%2e%2e/%2e%2e/package.json',
    '/statique/..%5C..%5Cpackage.json',
    '/statique/images/../../../package.json',
    '/statique/%00',
  ];

  it.each(CHEMINS_HOSTILES)('%s → 404 sans fuite hors du dossier statique', async (chemin) => {
    const serveur = await servir([]);
    const { statut, corps } = await requeteBrute(serveur, chemin);
    expect(statut).toBe(404);
    expect(corps).not.toContain('"name"');
  });

  it('répond 400 sur un encodage invalide, sur une route statique comme ailleurs', async () => {
    const serveur = await servir([]);
    expect((await requeteBrute(serveur, '/statique/%E0%A4%A')).statut).toBe(400);
    expect((await requeteBrute(serveur, '/%E0%A4%A')).statut).toBe(400);
  });
});

describe('F01 bouton-mort', () => {
  it('rend le bouton inerte sur /contact et rien d’autre', async () => {
    const serveur = await servir(['F01']);
    const contact = await page(serveur, PAGE_CONTACT);
    expect(compterBalises(contact, BOUTON_SUBMIT)).toBe(0);
    expect(compterBalises(contact, BOUTON_BUTTON)).toBe(1);
    expect(contact).toContain('data-role="envoyer"');

    expect(await page(serveur, PAGE_ACCUEIL)).toContain(`src="${CHEMIN_LOGO}"`);
    expect(await (await fetch(serveur.url + CHEMIN_SCRIPT_FORMULAIRE)).text()).toContain(`@bloc:${BLOC_GESTION_ERREUR}`);
    expect((await poster(serveur, CORPS_VALIDE)).status).toBe(200);
  });
});

describe('F02 echec-silencieux', () => {
  it('répond 500 et sert un script sans gestion d’erreur, le reste restant sain', async () => {
    const serveur = await servir(['F02']);
    const reponse = await poster(serveur, CORPS_VALIDE);
    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toEqual({ ok: false });

    const script = await (await fetch(serveur.url + CHEMIN_SCRIPT_FORMULAIRE)).text();
    expect(script).not.toContain(`@bloc:${BLOC_GESTION_ERREUR}`);
    expect(script).not.toContain('data-role="message-erreur"');
    expect(script).toContain('addEventListener');
    // Toute orthographe d’URL équivalente sert le même fichier, donc avec le bug.
    for (const alias of [CHEMIN_SCRIPT_FORMULAIRE.replace('/formulaire', '//formulaire'), CHEMIN_SCRIPT_FORMULAIRE.replace('.js', '%2Ejs')]) {
      const { statut, corps } = await requeteBrute(serveur, alias);
      expect(statut).toBe(200);
      expect(corps).not.toContain(`@bloc:${BLOC_GESTION_ERREUR}`);
    }

    const contact = await page(serveur, PAGE_CONTACT);
    expect(compterBalises(contact, BOUTON_SUBMIT)).toBe(1);
    expect(contact).toContain(`src="${CHEMIN_LOGO}"`);
  });
});

describe('R01 api-lente', () => {
  it('retarde la réponse de l’API du délai paramétré, contenu intact', async () => {
    const delai = 150;
    const serveur = await servir(['R01'], 'fr', { R01: { delaiReponseMs: delai } });
    const debut = performance.now();
    const reponse = await poster(serveur, CORPS_VALIDE);
    const duree = performance.now() - debut;
    expect(duree).toBeGreaterThanOrEqual(delai * 0.95);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true });

    const contact = await page(serveur, PAGE_CONTACT);
    expect(compterBalises(contact, BOUTON_SUBMIT)).toBe(1);
  });

  it('valide le délai au démarrage : un scénario au délai invalide ne démarre jamais', async () => {
    await expect(demarrerServeur(scenario(['R01'], 'fr', { R01: { delaiReponseMs: -1 } }), formulaireContact, config)).rejects.toThrow(/R01/);
  });
});

describe('V01 image-cassee', () => {
  it('fait pointer le logo vers une ressource 404 sur toutes les pages', async () => {
    const serveur = await servir(['V01']);
    const cheminCasse = config.bugs['V01']?.['cheminRessourceIntrouvable'];
    expect(typeof cheminCasse).toBe('string');
    for (const chemin of PAGES) {
      const html = await page(serveur, chemin);
      expect(html).toContain(`src="${String(cheminCasse)}"`);
      expect(html).not.toContain(`src="${CHEMIN_LOGO}"`);
    }
    expect((await fetch(serveur.url + String(cheminCasse))).status).toBe(404);
    expect((await poster(serveur, CORPS_VALIDE)).status).toBe(200);
  });
});

describe('M01 bouton-masque-mobile', () => {
  it('injecte le recouvrement et la media query de la config sur /contact uniquement', async () => {
    const serveur = await servir(['M01']);
    const largeur = config.bugs['M01']?.['largeurMaxMobilePx'];
    expect(typeof largeur).toBe('number');
    const mediaQuery = mediaQueryMobile(largeur as number);

    const contact = await page(serveur, PAGE_CONTACT);
    expect(contact).toContain(`class="${CLASSE_RECOUVREMENT}" aria-hidden="true"`);
    expect(contact).toContain(mediaQuery);
    expect(contact).toMatch(new RegExp(`data-role="envoyer">[^<]*</button><span class="${CLASSE_RECOUVREMENT}"`));
    expect(compterBalises(contact, BOUTON_SUBMIT)).toBe(1);

    for (const chemin of [PAGE_ACCUEIL, PAGE_CONFIRMATION]) {
      const html = await page(serveur, chemin);
      expect(html).not.toContain(CLASSE_RECOUVREMENT);
      expect(html).not.toContain(mediaQuery);
    }
    expect((await poster(serveur, CORPS_VALIDE)).status).toBe(200);
  });
});

describe('combinaison F01 + M01', () => {
  it('applique les deux transformations dans l’ordre du scénario', async () => {
    const serveur = await servir(['F01', 'M01'], 'en');
    const contact = await page(serveur, PAGE_CONTACT);
    expect(contact).toContain('<html lang="en">');
    expect(compterBalises(contact, BOUTON_BUTTON)).toBe(1);
    expect(contact).toContain(`class="${CLASSE_RECOUVREMENT}"`);
  });
});
