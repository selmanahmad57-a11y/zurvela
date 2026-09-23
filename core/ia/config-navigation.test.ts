/**
 * APPRENTISSAGES n°5 : une configuration que rien n'exécute n'est pas
 * vérifiée. `config/navigation.json` ne s'active qu'en politique IA — il a
 * donc son test de forme dès sa naissance.
 */
import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../scanner/config.js';
import {
  FICHIER_CONFIG_NAVIGATION,
  assemblerConfigNavigation,
  chargerConfigAppelNavigation,
  chargerConfigNavigation,
  empreinteContratNavigation,
} from './index.js';

const configScanner = await chargerConfigScanner();

describe('config/navigation.json', () => {
  it('se charge et valide son schéma', async () => {
    const appel = await chargerConfigAppelNavigation();
    expect(appel.maxTokensReponse).toBeGreaterThan(0);
    expect(appel.relancesMax).toBeGreaterThanOrEqual(0);
    expect(FICHIER_CONFIG_NAVIGATION).toMatch(/config\/navigation\.json$/);
  });

  it('échoue BRUYAMMENT sur un fichier hors schéma, jamais silencieusement', async () => {
    await expect(chargerConfigAppelNavigation(FICHIER_CONFIG_NAVIGATION.replace('navigation', 'profilage'))).rejects.toThrow(
      'config/navigation.json invalide',
    );
  });
});

describe('assemblerConfigNavigation', () => {
  /**
   * Les champs sont repris un à un, jamais par étalement de la config
   * d'exploration entière : l'empreinte qui entre dans la clé de cassette doit
   * couvrir exactement ce qui compose le prompt et l'appel. Sinon, régler un
   * délai de stabilisation périmerait tout le parc.
   */
  it('ne reprend de l’exploration que les deux bornes qui composent le prompt', async () => {
    const appel = await chargerConfigAppelNavigation();
    const assemblee = assemblerConfigNavigation(appel, configScanner.exploration);
    expect(Object.keys(assemblee).sort()).toEqual([
      'historiqueMaxActions',
      'libelleMaxChars',
      'maxTokensReponse',
      'relancesMax',
    ]);
    expect(assemblee.libelleMaxChars).toBe(configScanner.exploration.libelleMaxChars);
  });

  it('un réglage d’exploration étranger au prompt ne change pas l’empreinte de contrat', async () => {
    const navigation = await chargerConfigNavigation(configScanner.exploration);
    const autreScanner = { ...configScanner.exploration, pagesMax: configScanner.exploration.pagesMax + 10 };
    const autre = await chargerConfigNavigation(autreScanner);
    expect(empreinteContratNavigation(autre)).toBe(empreinteContratNavigation(navigation));
  });
});
