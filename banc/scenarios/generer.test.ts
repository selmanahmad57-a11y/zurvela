import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chargerConfig } from '../config.js';
import { obtenirGabarit } from '../gabarits/index.js';
import { BUGS_FACTICES, configFactice, gabaritFactice } from './factices.js';
import { SEGMENT_RAPPORT, ecrireScenarios, genererScenarios } from './generer.js';
import type { ConfigBanc } from '../types.js';

describe('genererScenarios (gabarit factice)', () => {
  const gabarit = gabaritFactice();
  const config = configFactice();

  it('produit (1 sain + 1 par bug + 1 par combinaison) × langues scénarios', () => {
    const scenarios = genererScenarios(gabarit, config);
    expect(scenarios).toHaveLength((1 + BUGS_FACTICES.length + 1) * 2);
  });

  it('donne des identifiants uniques', () => {
    const ids = genererScenarios(gabarit, config).map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respecte l’ordre : par langue, sain puis bugs du registre puis combinaisons', () => {
    const ids = genererScenarios(gabarit, config).map((scenario) => scenario.id);
    expect(ids).toEqual([
      'gabarit-factice--sain--fr',
      'gabarit-factice--f01--fr',
      'gabarit-factice--f02--fr',
      'gabarit-factice--r01--fr',
      'gabarit-factice--v01--fr',
      'gabarit-factice--m01--fr',
      'gabarit-factice--i01--fr',
      'gabarit-factice--t01--fr',
      'gabarit-factice--l01--fr',
      'gabarit-factice--f01-m01--fr',
      'gabarit-factice--sain--en',
      'gabarit-factice--f01--en',
      'gabarit-factice--f02--en',
      'gabarit-factice--r01--en',
      'gabarit-factice--v01--en',
      'gabarit-factice--m01--en',
      'gabarit-factice--i01--en',
      'gabarit-factice--t01--en',
      'gabarit-factice--l01--en',
      'gabarit-factice--f01-m01--en',
    ]);
  });

  it('remplit gabarit, langue et bugsActifs, sans champ parametres', () => {
    const scenarios = genererScenarios(gabarit, config);
    expect(scenarios[0]).toEqual({ id: 'gabarit-factice--sain--fr', gabarit: 'gabarit-factice', langue: 'fr', bugsActifs: [] });
    expect(scenarios[1 + BUGS_FACTICES.length]).toEqual({
      id: 'gabarit-factice--f01-m01--fr',
      gabarit: 'gabarit-factice',
      langue: 'fr',
      bugsActifs: ['F01', 'M01'],
    });
    for (const scenario of scenarios) {
      expect(scenario).not.toHaveProperty('parametres');
    }
  });

  it('suit l’ordre du registre du gabarit et l’ordre déclaré des combinaisons', () => {
    const inverse = gabaritFactice('g', [...BUGS_FACTICES].reverse());
    const ids = genererScenarios(inverse, configFactice({ langues: ['fr'], scenarios: { dossier: 'x', jetonSain: 'ok', combinaisons: { g: [['V01', 'F02'], ['M01', 'F01']] }, contraintes: {}, croises: [] } })).map((scenario) => scenario.id);
    expect(ids).toEqual([
      'g--ok--fr',
      'g--l01--fr',
      'g--t01--fr',
      'g--i01--fr',
      'g--m01--fr',
      'g--v01--fr',
      'g--r01--fr',
      'g--f02--fr',
      'g--f01--fr',
      'g--v01-f02--fr',
      'g--m01-f01--fr',
    ]);
  });

  it('lève si une combinaison cite un bug inconnu du gabarit', () => {
    const config = configFactice({ scenarios: { dossier: 'x', jetonSain: 'sain', combinaisons: { 'gabarit-factice': [['F01', 'X99']] }, contraintes: {}, croises: [] } });
    expect(() => genererScenarios(gabarit, config)).toThrow(/X99/);
  });

  it('lève si deux combinaisons donnent le même identifiant', () => {
    const config = configFactice({ scenarios: { dossier: 'x', jetonSain: 'sain', combinaisons: { 'gabarit-factice': [['F01', 'M01'], ['F01', 'M01']] }, contraintes: {}, croises: [] } });
    expect(() => genererScenarios(gabarit, config)).toThrow(/double/);
  });
});

describe('ecrireScenarios', () => {
  let dossier: string | undefined;

  afterEach(async () => {
    if (dossier !== undefined) {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  it('crée le dossier, écrit un fichier par scénario en JSON indenté et retourne les chemins', async () => {
    dossier = await mkdtemp(path.join(os.tmpdir(), 'zurvela-scenarios-'));
    const cible = path.join(dossier, 'sous', 'dossier');
    const scenarios = genererScenarios(gabaritFactice(), configFactice({ langues: ['fr'] }));

    const chemins = await ecrireScenarios(scenarios, cible);

    expect(chemins).toEqual(scenarios.map((scenario) => path.join(cible, `${scenario.id}.scenario.json`)));
    const contenu = await readFile(chemins[0] ?? '', 'utf8');
    expect(contenu).toBe(`${JSON.stringify(scenarios[0], null, 2)}\n`);
    expect(contenu).toContain('\n  "id": ');
  });

  it('supprime les anciens fichiers de scénario mais laisse les autres fichiers', async () => {
    dossier = await mkdtemp(path.join(os.tmpdir(), 'zurvela-scenarios-'));
    await writeFile(path.join(dossier, 'ancien--x--fr.scenario.json'), '{}\n');
    await writeFile(path.join(dossier, 'scenario.schema.json'), '{}\n');
    await writeFile(path.join(dossier, 'charger.ts'), '');

    await ecrireScenarios(genererScenarios(gabaritFactice(), configFactice({ langues: ['fr'] })), dossier);

    const noms = (await readdir(dossier)).sort();
    expect(noms).not.toContain('ancien--x--fr.scenario.json');
    expect(noms).toContain('scenario.schema.json');
    expect(noms).toContain('charger.ts');
    expect(noms.filter((nom) => nom.endsWith('.scenario.json'))).toHaveLength(1 + BUGS_FACTICES.length + 1);
  });
});

describe('genererScenarios (registre réel)', () => {
  it('produit, par langue, un scénario sain + un par bug du registre + un par combinaison de la config', async () => {
    const config = await chargerConfig();
    const gabarit = obtenirGabarit('formulaire-contact');
    const scenarios = genererScenarios(gabarit, config);
    // Dérivé du registre et de la config (jamais un compte figé) : ajouter un bug ne doit pas casser ce test.
    const attendusParLangue = 1 + gabarit.bugs.length + (config.scenarios.combinaisons[gabarit.nom]?.length ?? 0);
    // Les CROISÉS s'ajoutent hors de la grille par langue : ils portent deux
    // langues à eux seuls, et c'est ce qui les rend non dérivables de la
    // grille. Ils sont donc comptés à part, jamais absorbés dans le produit.
    const croises = config.scenarios.croises.filter((croise) => croise.gabarit === gabarit.nom).length;
    expect(scenarios).toHaveLength(attendusParLangue * config.langues.length + croises);
    expect(scenarios.map((scenario) => scenario.id)).toContain('formulaire-contact--f01-m01--fr');
    expect(scenarios.map((scenario) => scenario.id)).toContain('formulaire-contact--sain--en');
  });

  it('couvre les trois bugs de confirmation et la combinaison I01+V01 dans les deux langues', async () => {
    const config = await chargerConfig();
    const ids = genererScenarios(obtenirGabarit('formulaire-contact'), config).map((scenario) => scenario.id);
    for (const jeton of ['i01', 't01', 'l01', 'i01-v01']) {
      for (const langue of config.langues) {
        expect(ids).toContain(`formulaire-contact--${jeton}--${langue}`);
      }
    }
  });
});

/**
 * Les scénarios CROISÉS : un site dans une langue, un rapport dans une autre.
 *
 * Ils sont la seule façon d'éprouver la promesse centrale du rapport business
 * — un commerçant français dont le site est en anglais lit un rapport
 * français — et ils ne se dérivent pas des combinaisons ordinaires, qui ne
 * portent qu'une langue.
 */
describe('genererScenarios — scénarios croisés', () => {
  const croise = { gabarit: 'gabarit-factice', bugsActifs: ['F01'], langue: 'en', langueRapport: 'fr' };

  function configCroisee(croises = [croise]): ConfigBanc {
    return configFactice({
      langues: ['fr'],
      scenarios: { dossier: 'banc/scenarios', jetonSain: 'sain', combinaisons: {}, contraintes: {}, croises },
    });
  }

  it('produit un scénario dont l’identifiant porte les DEUX langues', () => {
    const scenarios = genererScenarios(gabaritFactice(), configCroisee());
    const produit = scenarios.find((scenario) => scenario.langueRapport !== undefined);
    expect(produit?.id).toBe(`gabarit-factice--f01--en${SEGMENT_RAPPORT}fr`);
    // `langue` reste celle du SITE : c'est elle qui choisit les locales servies.
    expect(produit).toMatchObject({ langue: 'en', langueRapport: 'fr', bugsActifs: ['F01'] });
  });

  it('n’en produit aucun pour un gabarit que la config ne nomme pas', () => {
    const scenarios = genererScenarios(gabaritFactice('autre-gabarit'), configCroisee());
    expect(scenarios.filter((scenario) => scenario.langueRapport !== undefined)).toEqual([]);
  });

  it('LÈVE sur un bug inconnu : un scénario qui disparaît sans le dire est une mesure qui s’éteint', () => {
    expect(() => genererScenarios(gabaritFactice(), configCroisee([{ ...croise, bugsActifs: ['ZZ9'] }]))).toThrow('ZZ9');
  });

  it('la config RÉELLE croise dans les DEUX sens, dont un contre le défaut du moteur', async () => {
    // Le sens `rapport = défaut de config/rapport.json` ne peut pas échouer
    // sur un canal muet : un paramètre jamais transmis rendrait le même
    // rapport. Le sens inverse, lui, le prouve. Ce test verrouille la
    // présence des deux — sans lui, quelqu'un retirerait un jour « celui qui
    // fait doublon ».
    const config = await chargerConfig();
    const langues = config.scenarios.croises.map((croise) => croise.langueRapport);
    expect(new Set(langues).size).toBeGreaterThanOrEqual(2);
  });

  it('LÈVE quand les deux langues sont identiques : le scénario ne croiserait rien', () => {
    expect(() => genererScenarios(gabaritFactice(), configCroisee([{ ...croise, langueRapport: 'en' }]))).toThrow(
      'il ne croise rien',
    );
  });
});
