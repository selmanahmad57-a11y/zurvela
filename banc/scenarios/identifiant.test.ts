import { describe, expect, it } from 'vitest';
import { construireIdScenario, idDepuisNomFichier, nomFichierScenario } from './identifiant.js';

describe('construireIdScenario', () => {
  it('utilise le jeton sain sans bug actif', () => {
    expect(construireIdScenario('formulaire-contact', [], 'fr', 'sain')).toBe('formulaire-contact--sain--fr');
  });

  it('joint les bugs en minuscules, dans leur ordre, par un tiret', () => {
    expect(construireIdScenario('formulaire-contact', ['F01', 'M01'], 'fr', 'sain')).toBe(
      'formulaire-contact--f01-m01--fr',
    );
    expect(construireIdScenario('formulaire-contact', ['M01', 'F01'], 'en', 'sain')).toBe(
      'formulaire-contact--m01-f01--en',
    );
  });

  it('lève si un segment est vide', () => {
    expect(() => construireIdScenario('', ['F01'], 'fr', 'sain')).toThrow(/gabarit/);
    expect(() => construireIdScenario('g', ['F01'], '', 'sain')).toThrow(/langue/);
    expect(() => construireIdScenario('g', [], 'fr', '')).toThrow(/jetonSain/);
    expect(() => construireIdScenario('g', ['F01', ''], 'fr', 'sain')).toThrow(/bug/);
  });
});

describe('nom de fichier', () => {
  it('fait l’aller-retour entre identifiant et nom de fichier', () => {
    expect(nomFichierScenario('a--sain--fr')).toBe('a--sain--fr.scenario.json');
    expect(idDepuisNomFichier('a--sain--fr.scenario.json')).toBe('a--sain--fr');
  });

  it('ignore ce qui n’est pas un fichier de scénario', () => {
    expect(idDepuisNomFichier('charger.ts')).toBeNull();
    expect(idDepuisNomFichier('scenario.schema.json')).toBeNull();
    expect(idDepuisNomFichier('.scenario.json')).toBeNull();
  });
});
