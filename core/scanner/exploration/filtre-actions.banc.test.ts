/**
 * Test d'intégration du filtre sur le GABARIT DU BANC : la liste noire est la
 * deuxième ligne de défense, pas un frein. Si elle bloquait un bouton ou un
 * lien du banc, l'exploration s'arrêterait et la détection s'effondrerait —
 * ce test est la garde de ce risque, à chaque enrichissement de la liste.
 *
 * Le site du banc est servi en mémoire, ouvert par un vrai Chromium, et
 * TOUTES les actions que la politique pourrait décider (navigations vers les
 * liens internes, soumission du formulaire) sont soumises au filtre.
 * Serveurs et navigateur sont fermés.
 */
import type { Browser, BrowserContext } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../../../banc/config.js';
import { formulaireContact } from '../../../banc/gabarits/formulaire-contact/index.js';
import { PAGE_ACCUEIL, PAGE_CONTACT } from '../../../banc/gabarits/formulaire-contact/structure.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ConfigBanc } from '../../../banc/types.js';
import type { Action } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ActionsInterdites, type ConfigScanner } from '../config.js';
import { creerContexte, lancerNavigateur } from '../navigateur.js';
import { extrairePage, lireDeclencheur } from './en-page.js';
import { attributsLus, creerFiltre, type FiltreActions } from './filtre-actions.js';

/** Langues du gabarit (un dictionnaire par langue dans `site/locales`). */
const LANGUES = ['fr', 'en'];

let config: ConfigScanner;
let actionsInterdites: ActionsInterdites;
let configBanc: ConfigBanc;
let navigateur: Browser;
let contexte: BrowserContext;
let filtre: FiltreActions;

beforeAll(async () => {
  [config, actionsInterdites, configBanc] = await Promise.all([
    chargerConfigScanner(),
    chargerActionsInterdites(),
    chargerConfig(),
  ]);
  filtre = creerFiltre(actionsInterdites);
  navigateur = await lancerNavigateur(config);
  const viewport = config.viewports[0];
  if (viewport === undefined) {
    throw new Error('config.viewports vide');
  }
  contexte = await creerContexte(navigateur, config, viewport);
}, 60_000);

afterAll(async () => {
  await contexte?.close();
  await navigateur?.close();
});

describe('filtre sur le gabarit du banc', () => {
  for (const langue of LANGUES) {
    it(`n’interdit aucune action du site sain (${langue})`, async () => {
      const serveur = await demarrerServeur(
        { id: `filtre--${langue}`, gabarit: formulaireContact.nom, langue, bugsActifs: [] },
        formulaireContact,
        configBanc,
      );
      try {
        let formulairesVus = 0;
        let liensVus = 0;
        for (const chemin of [PAGE_ACCUEIL, PAGE_CONTACT]) {
          const page = await contexte.newPage();
          try {
            await page.goto(`${serveur.url}${chemin}`, { waitUntil: 'load' });
            const extraction = await extrairePage(page);
            const internes = extraction.liens.filter((lien) => lien.startsWith(serveur.url));
            liensVus += internes.length;
            for (const lien of internes) {
              const action: Action = { type: 'naviguer', url: lien };
              expect({ chemin, lien, verdict: await filtre(action, page) }).toEqual({
                chemin,
                lien,
                verdict: { autorisee: true },
              });
            }
            for (const formulaire of extraction.formulaires) {
              formulairesVus += 1;
              // Le filtre doit LIRE quelque chose : sans texte perçu, le test serait vide de sens.
              const lecture = await lireDeclencheur(
                page,
                formulaire.declencheur?.selecteur ?? formulaire.localisation.selecteur,
                attributsLus(actionsInterdites),
                actionsInterdites.texteVisibleExamine,
                actionsInterdites.attributsDescendantsExamines,
              );
              expect(lecture?.texte?.trim()).not.toBe('');
              const action: Action = {
                type: 'soumettre',
                formulaire: formulaire.localisation,
                declencheur: formulaire.declencheur,
              };
              expect({ chemin, verdict: await filtre(action, page) }).toEqual({ chemin, verdict: { autorisee: true } });
            }
          } finally {
            await page.close();
          }
        }
        // Le gabarit sain : un formulaire (page contact) et des liens sur les deux pages.
        expect(formulairesVus).toBe(1);
        expect(liensVus).toBeGreaterThanOrEqual(4);
      } finally {
        await serveur.arreter();
      }
    }, 60_000);
  }
});
