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
import { chargerActionsInterdites, chargerConfigProfilage, chargerConfigScanner } from '../config.js';
import { creerContexte, lancerNavigateur, NOM_TAMPON } from '../navigateur.js';
import { etatsImages, extrairePage, extraireTexte, lireDeclencheur, lireMutations, recouvrements, validiteFormulaire } from './en-page.js';
import { attributsLus } from './filtre-actions.js';

/**
 * Page minimale : un formulaire avec déclencheur, une image et un lien. Le
 * `lang`, le `title`, la métadonnée et le paragraphe visible ne servent qu'à
 * la commande de profilage ; le reste des commandes n'en lit rien.
 */
const HTML =
  '<!doctype html><html lang="fr"><head><title>Sonde</title>' +
  '<meta name="description" content="Metadonnee de sonde">' +
  '<style>.x { color: red }</style></head><body><p>Paragraphe visible.</p>' +
  '<p style="display:none">Masque</p><div><form id="f" method="post" action="/api">' +
  '<input name="a" type="email"><button type="submit" name="b"></button></form></div>' +
  '<o:p><form id="g" method="post" action="/api2"><input name="c" type="text">' +
  '<input type="image" name="d" alt="x" src="/image.svg"></form></o:p>' +
  '<a href="/suite">.</a><img id="i" src="/image.svg" width="10" height="10">' +
  // DEUX RECOUVREMENTS, UN DE CHAQUE CÔTÉ DU CRITÈRE (cahier P2-3, contrat 3).
  // À gauche, la carte marchande : le calque est DANS le lien de la carte,
  // donc le clic aboutit — aucune candidate attendue. À droite, la bannière
  // : elle vient du dehors et barre le bouton — candidate attendue. Sans les
  // deux, le critère ne pourrait rater que d'un côté.
  '<a id="carte" href="/produit" style="position:relative;display:block;width:200px;height:60px">' +
  '<button id="voir" style="position:absolute;left:10px;top:10px;width:80px;height:20px"></button>' +
  '<span id="survol" style="position:absolute;inset:0;background:transparent"></span></a>' +
  '<div style="position:relative;width:200px;height:60px">' +
  '<button id="barre" style="position:absolute;left:10px;top:10px;width:80px;height:20px"></button>' +
  '<div id="banniere" style="position:absolute;inset:0;background:#fff"></div></div>' +
  '</body></html>';

const IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

async function principal(): Promise<void> {
  const [config, actionsInterdites, configProfilage] = await Promise.all([
    chargerConfigScanner(),
    chargerActionsInterdites(),
    chargerConfigProfilage(),
  ]);
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
      texte: await extraireTexte(page, configProfilage.contexteMaxChars, config.exploration.evaluationMs),
      images: await etatsImages(page),
      recouvrements: (await recouvrements(page, { max: config.exploration.elementsInteractifsMax, budgetMs: config.exploration.evaluationMs, motifIdInstable: config.detecteurs.recouvrement.motifIdInstable })).recouvrements,
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
