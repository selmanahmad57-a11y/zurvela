import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Scenario } from '../types.js';
import { chargerScenario, chargerScenarios, ErreurScenarioIntrouvable } from './charger.js';

const valide: Scenario = { id: 'g--sain--fr', gabarit: 'g', langue: 'fr', bugsActifs: [] };
const avecBugs: Scenario = {
  id: 'g--f01-m01--en',
  gabarit: 'g',
  langue: 'en',
  bugsActifs: ['F01', 'M01'],
  parametres: { R01: { delaiReponseMs: 10 } },
};

describe('chargement des scénarios', () => {
  let dossier: string;

  beforeEach(async () => {
    dossier = await mkdtemp(path.join(os.tmpdir(), 'zurvela-charger-'));
  });

  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  async function ecrire(nom: string, contenu: unknown): Promise<void> {
    const texte = typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 2);
    await writeFile(path.join(dossier, nom), texte);
  }

  it('lit les fichiers valides, ignore les autres fichiers et trie par identifiant', async () => {
    await ecrire('g--sain--fr.scenario.json', valide);
    await ecrire('g--f01-m01--en.scenario.json', avecBugs);
    await ecrire('notes.json', { id: 'pas-un-scenario' });

    const scenarios = await chargerScenarios(dossier);

    expect(scenarios).toEqual([avecBugs, valide]);
  });

  it('retourne une liste vide sans fichier de scénario', async () => {
    expect(await chargerScenarios(dossier)).toEqual([]);
  });

  it('lève si un fichier viole le schéma', async () => {
    await ecrire('g--sain--fr.scenario.json', { ...valide, inconnu: true });
    await expect(chargerScenarios(dossier)).rejects.toThrow(/g--sain--fr\.scenario\.json invalide/);

    await ecrire('g--sain--fr.scenario.json', { ...valide, bugsActifs: ['F01', 'F01'] });
    await expect(chargerScenarios(dossier)).rejects.toThrow(/bugsActifs/);

    await ecrire('g--sain--fr.scenario.json', { id: 'g--sain--fr', gabarit: 'g', bugsActifs: [] });
    await expect(chargerScenarios(dossier)).rejects.toThrow(/langue/);
  });

  it('lève si un fichier n’est pas du JSON', async () => {
    await ecrire('g--sain--fr.scenario.json', '{ pas du json');
    await expect(chargerScenarios(dossier)).rejects.toThrow(/JSON illisible/);
  });

  it('lève si l’identifiant du contenu ne correspond pas au nom du fichier', async () => {
    await ecrire('g--autre--fr.scenario.json', valide);
    await expect(chargerScenarios(dossier)).rejects.toThrow(/g--autre--fr/);
  });

  it('chargerScenario retrouve un scénario par identifiant', async () => {
    await ecrire('g--f01-m01--en.scenario.json', avecBugs);
    expect(await chargerScenario(dossier, 'g--f01-m01--en')).toEqual(avecBugs);
  });

  it('chargerScenario lève une ErreurScenarioIntrouvable portant l’identifiant si le scénario est absent', async () => {
    const promesse = chargerScenario(dossier, 'g--inexistant--fr');
    await expect(promesse).rejects.toThrow(/Scénario introuvable : g--inexistant--fr/);
    await expect(promesse).rejects.toBeInstanceOf(ErreurScenarioIntrouvable);
    await expect(promesse).rejects.toMatchObject({ id: 'g--inexistant--fr' });
  });
});
