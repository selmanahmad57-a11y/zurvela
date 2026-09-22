import { createServer, type Server } from 'node:http';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfigScanner, type ConfigScanner } from './config.js';
import { derniereMutation, lireMutations, viderMutations } from './exploration/en-page.js';
import { creerContexte, lancerNavigateur, NOM_TAMPON } from './navigateur.js';

/** Page minimale servie en mémoire (zone du formulaire = lui et son parent `div`) ; les en-têtes reçus sont enregistrés. */
const HTML = '<!doctype html><html><body><div><form id="f"><input name="a"></form></div><p id="hors"></p></body></html>';

let config: ConfigScanner;
let navigateur: Browser;
let serveur: Server;
let url: string;
let entetesRecus: Record<string, string | string[] | undefined> = {};

beforeAll(async () => {
  config = await chargerConfigScanner();
  navigateur = await lancerNavigateur(config);
  serveur = createServer((req, res) => {
    entetesRecus = req.headers;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  url = typeof adresse === 'object' && adresse !== null ? `http://127.0.0.1:${adresse.port}/` : '';
});

afterAll(async () => {
  await navigateur?.close();
  await new Promise<void>((resoudre) => serveur.close(() => resoudre()));
});

describe('tampon borné', () => {
  it('au-delà de la borne de config, les mutations sont comptées sans être conservées', async () => {
    const viewport = config.viewports[0];
    if (viewport === undefined) {
      return;
    }
    const borne: ConfigScanner = { ...config, exploration: { ...config.exploration, mutationsMax: 3 } };
    const contexte = await creerContexte(navigateur, borne, viewport);
    try {
      const page = await contexte.newPage();
      await page.goto(url);
      await viderMutations(page, NOM_TAMPON);
      await page.evaluate(() => {
        for (let i = 0; i < 10; i += 1) {
          document.querySelector('#hors')?.setAttribute('data-x', String(i));
        }
      });
      const lecture = await lireMutations(page, NOM_TAMPON, null);
      expect(lecture.mutations).toHaveLength(3);
      expect(lecture.excedent).toBe(7);
      // Après lecture, le tampon repart de zéro (excédent compris).
      expect(await lireMutations(page, NOM_TAMPON, null)).toEqual({ mutations: [], excedent: 0, excedentHorsFond: 0 });
    } finally {
      await contexte.close();
    }
  });
});

describe('creerContexte', () => {
  it('signale le robot (user-agent et en-tête de config) et applique le viewport', async () => {
    const viewport = config.viewports[0];
    expect(viewport).toBeDefined();
    if (viewport === undefined) {
      return;
    }
    const contexte = await creerContexte(navigateur, config, viewport);
    try {
      const page = await contexte.newPage();
      await page.goto(url);
      expect(entetesRecus['user-agent']).toBe(config.robot.userAgent);
      expect(entetesRecus[config.robot.enTete.toLowerCase()]).toBe(config.robot.valeurEnTete);
      expect(page.viewportSize()).toEqual({ width: viewport.largeur, height: viewport.hauteur });
    } finally {
      await contexte.close();
    }
  });

  it('installe le tampon de mutations, horodaté en epoch ms, avec la zone du formulaire', async () => {
    const viewport = config.viewports[0];
    if (viewport === undefined) {
      return;
    }
    const contexte = await creerContexte(navigateur, config, viewport);
    try {
      const page = await contexte.newPage();
      await page.goto(url);
      // Le chargement a déjà produit des mutations (analyse du document).
      expect(await derniereMutation(page, NOM_TAMPON)).not.toBeNull();
      await viderMutations(page, NOM_TAMPON);
      expect(await derniereMutation(page, NOM_TAMPON)).toBeNull();

      const avant = Date.now();
      await page.evaluate(() => {
        document.querySelector('#f')?.setAttribute('data-x', '1');
        document.querySelector('#hors')?.setAttribute('data-x', '1');
      });
      const { mutations } = await lireMutations(page, NOM_TAMPON, '#f');
      expect(mutations.map((m) => m.enZone)).toEqual([true, false]);
      for (const mutation of mutations) {
        expect(mutation.t).toBeGreaterThanOrEqual(avant - 1);
        expect(mutation.t).toBeLessThanOrEqual(Date.now() + 1);
      }
      expect(await lireMutations(page, NOM_TAMPON, null)).toEqual({ mutations: [], excedent: 0, excedentHorsFond: 0 });
    } finally {
      await contexte.close();
    }
  });
});
