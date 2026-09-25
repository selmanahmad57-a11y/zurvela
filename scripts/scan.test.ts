/**
 * `pnpm scan` — ET LA PREUVE QUE LA CONFIGURATION DE PRODUCTION GOUVERNE.
 *
 * Le premier test de cette commande n'est pas « elle scanne ». C'est « elle
 * lit BIEN `config/production.json` », et cela se prouve par l'EFFET, jamais
 * par la lecture : constater qu'un fichier a été ouvert ne prouve que
 * l'ouverture. On bascule donc une valeur de production, et on vérifie que le
 * moteur assemblé la RESPECTE.
 *
 * C'est l'apprentissage n°5 sous sa forme exécutable — et c'est la raison
 * d'être de cette commande autant que le bestiaire : jusqu'ici,
 * `config/production.json` n'était lu par rien.
 */
import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../core/scanner/config.js';
import { FICHIERS_CONFIG, estNomConfig, lireOptions, timeoutDe } from './scan.js';

describe('la configuration de production GOUVERNE le scan', () => {
  it('le timeout du scan vient de production.json, et il DIFFÈRE de celui de l’instrument', async () => {
    // Le contrôle qui peut échouer : si la commande repliait sur une valeur en
    // dur, ou lisait l'instrument, ce test verrait la mauvaise valeur.
    const production = await chargerConfigScanner(FICHIERS_CONFIG.production);
    expect(timeoutDe(production, 'production')).toBe(production.scan?.timeoutMs);
    expect(production.scan?.timeoutMs).toBeGreaterThan(60_000);
  });

  it('l’INSTRUMENT ne peut pas piloter un scan, et le dit au lieu d’inventer un défaut', async () => {
    // Un repli silencieux sur une valeur choisie par le code serait le seuil
    // en dur que la constitution §2 interdit.
    const instrument = await chargerConfigScanner(FICHIERS_CONFIG.instrument);
    expect(instrument.scan).toBeUndefined();
    expect(() => timeoutDe(instrument, 'instrument')).toThrow('scan.timeoutMs');
  });

  it('le GATE DE SOUMISSION de production est « aucune », et c’est lui que le moteur recevra', async () => {
    const production = await chargerConfigScanner(FICHIERS_CONFIG.production);
    const instrument = await chargerConfigScanner(FICHIERS_CONFIG.instrument);
    expect(production.interaction.soumission).toBe('aucune');
    // Les deux DIFFÈRENT : sans cela, lire l'un ou l'autre serait indiscernable.
    expect(instrument.interaction.soumission).not.toBe(production.interaction.soumission);
  });

  it('la politesse et le budget de production diffèrent aussi de l’instrument', async () => {
    const production = await chargerConfigScanner(FICHIERS_CONFIG.production);
    const instrument = await chargerConfigScanner(FICHIERS_CONFIG.instrument);
    expect(production.politesse.delaiEntrePagesMs).toBeGreaterThan(0);
    expect(instrument.politesse.delaiEntrePagesMs).toBe(0);
    expect(production.budget.maxUsdParScan).not.toBeNull();
    expect(instrument.budget.maxUsdParScan).toBeNull();
  });
});

describe('lecture des options', () => {
  it('par défaut, c’est la PRODUCTION : scanner un site réel avec les réglages du banc serait la faute', () => {
    expect(lireOptions(['https://exemple.invalid'])).toMatchObject({ url: 'https://exemple.invalid', config: 'production' });
  });

  it('accepte l’instrument explicitement, et refuse un nom inconnu', () => {
    expect(lireOptions(['https://x.invalid', '--config', 'instrument'])?.config).toBe('instrument');
    expect(lireOptions(['https://x.invalid', '--config', 'inconnue'])).toBeNull();
    expect(estNomConfig('production')).toBe(true);
    expect(estNomConfig('autre')).toBe(false);
  });

  it('sans URL, il n’y a rien à scanner', () => {
    expect(lireOptions([])?.url).toBeUndefined();
  });
});
