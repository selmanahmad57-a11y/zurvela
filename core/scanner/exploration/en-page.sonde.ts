/**
 * Sonde exécutée par `en-page.tsx.test.ts` DANS UN PROCESSUS `tsx`, comme
 * `pnpm banc` : la transformation de tsx (esbuild, noms conservés) diffère
 * de celle de Vitest et peut rendre le script en page non sérialisable
 * (helper `__name` absent du navigateur). Vitest seul ne le révèle pas.
 *
 * Elle charge une page minimale servie en mémoire, exécute chaque commande
 * du script en page et écrit le résultat en JSON sur la sortie standard.
 * Ce n'est pas un test : pas de suffixe `.test.ts`.
 */
/// <reference lib="dom" />
import { createServer } from 'node:http';
import { chargerActionsInterdites, chargerConfigScanner } from '../config.js';
import { creerContexte, lancerNavigateur, NOM_TAMPON } from '../navigateur.js';
import { etatsImages, extrairePage, lireDeclencheur, lireMutations, recouvrements, validiteFormulaire } from './en-page.js';
import { attributsLus } from './filtre-actions.js';

/** Page minimale : un formulaire avec déclencheur, une image et un lien. Aucun texte n'est lu. */
const HTML =
  '<!doctype html><html><body><div><form id="f" method="post" action="/api">' +
  '<input name="a" type="email"><button type="submit" name="b"></button></form></div>' +
  '<o:p><form id="g" method="post" action="/api2"><input name="c" type="text">' +
  '<input type="image" name="d" alt="x" src="/image.svg"></form></o:p>' +
  '<a href="/suite">.</a><img id="i" src="/image.svg" width="10" height="10"></body></html>';

const IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

async function principal(): Promise<void> {
  const [config, actionsInterdites] = await Promise.all([chargerConfigScanner(), chargerActionsInterdites()]);
  const viewport = config.viewports[0];
  if (viewport === undefined) {
    throw new Error('config.viewports vide');
  }
  const serveur = createServer((requete, reponse) => {
    if (requete.url === '/image.svg') {
      reponse.writeHead(200, { 'content-type': 'image/svg+xml' });
      reponse.end(IMAGE_SVG);
      return;
    }
    reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    reponse.end(HTML);
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  const url = typeof adresse === 'object' && adresse !== null ? `http://127.0.0.1:${adresse.port}/` : '';

  const navigateur = await lancerNavigateur(config);
  try {
    const contexte = await creerContexte(navigateur, config, viewport);
    const page = await contexte.newPage();
    await page.goto(url, { waitUntil: 'load' });
    // Une mutation dans la zone du formulaire (la saisie d'une valeur n'en produit pas : propriété, pas attribut).
    await page.evaluate(() => {
      document.querySelector('#f')?.append(document.createElement('span'));
    });
    const resultat = {
      page: await extrairePage(page),
      images: await etatsImages(page),
      recouvrements: (await recouvrements(page, { max: config.exploration.elementsInteractifsMax, budgetMs: config.exploration.evaluationMs })).recouvrements,
      mutations: (await lireMutations(page, NOM_TAMPON, '#f')).mutations,
      declencheur: await lireDeclencheur(page, '#f > button', attributsLus(actionsInterdites), false),
      validite: await validiteFormulaire(page, '#f', '#f > button'),
    };
    process.stdout.write(JSON.stringify(resultat));
  } finally {
    await navigateur.close();
    await new Promise<void>((resoudre) => serveur.close(() => resoudre()));
  }
}

principal().catch((erreur: unknown) => {
  console.error(erreur);
  process.exitCode = 1;
});
