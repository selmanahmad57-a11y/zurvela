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
import { FICHIERS_CONFIG, estNomConfig, lireOptions, tauxRejouabilite, timeoutDe } from './scan.js';

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
    expect(lireOptions(['https://exemple.invalid', '--journal', 'j.json'])).toMatchObject({ url: 'https://exemple.invalid', config: 'production' });
  });

  it('accepte l’instrument explicitement, et refuse un nom inconnu', () => {
    expect(lireOptions(['https://x.invalid', '--journal', 'j.json', '--config', 'instrument'])?.config).toBe('instrument');
    expect(lireOptions(['https://x.invalid', '--journal', 'j.json', '--config', 'inconnue'])).toBeNull();
    expect(estNomConfig('production')).toBe(true);
    expect(estNomConfig('autre')).toBe(false);
  });

  it('un scan sans --journal est REFUSÉ : un jeu d’options sans journal N’EXISTE PAS', () => {
    // APPRENTISSAGES n°31 rendu MÉCANIQUE (n°34). La règle « un run qu'on
    // ne pourra pas lire ne se lance pas » était écrite, et elle a cédé
    // DEUX FOIS en une soirée sous l'enchaînement des gestes : un
    // apprentissage inscrit n'est pas un réflexe installé. Le refus vit
    // donc à la LECTURE des options, et non dans une garde que l'appelant
    // pourrait oublier d'appeler — un invariant imposé bat un invariant
    // vérifié (n°28).
    expect(lireOptions(['https://x.invalid'])).toBeNull();
    expect(lireOptions(['https://x.invalid', '--journal', ''])).toBeNull();
    expect(lireOptions(['https://x.invalid', '--journal', 'j.json'])?.journal).toBe('j.json');
  });

  it('sans URL, il n’y a rien à scanner', () => {
    expect(lireOptions(['--journal', 'j.json'])?.url).toBeUndefined();
  });
});


describe('la commande npm charge la clé comme les scripts du banc', () => {
  it('« pnpm scan » lit docs/.env.local : le scan n°1 du bestiaire est parti sans clé', async () => {
    // Test de FORME (apprentissage n°5) : la commande telle qu'elle est écrite
    // dans package.json, pas telle qu'on croit qu'elle est. `tsx scripts/scan.ts`
    // seul ne charge aucun fichier d'environnement, et un scan réel « standard »
    // mesurait alors le mode sans clé.
    const { readFile } = await import('node:fs/promises');
    const paquet = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(paquet.scripts['scan']).toContain('--env-file-if-exists=docs/.env.local');
    expect(paquet.scripts['banc:enregistrer-ia']).toContain('--env-file-if-exists=docs/.env.local');
  });
});

describe('le taux de candidates rejouables — le chiffre qui manquait partout (APPRENTISSAGES n°18)', () => {
  const rejouee = { echecOutillage: false };
  const outil = { echecOutillage: true };
  const groupe = (membres: number, tentatives: { echecOutillage: boolean }[]) => ({
    groupe: { membres: Array.from({ length: membres }, (_, i) => ({ id: i })) },
    tentatives,
  });

  it('compte les CANDIDATES des groupes qu’au moins une tentative a physiquement rejoués', () => {
    // fiche 04 en miniature : un groupe de 4 (Stripe) jamais rejoué, un groupe
    // de 1 rejoué deux fois, un groupe de 2 rejoué une fois sur deux.
    const taux = tauxRejouabilite({
      groupes: [groupe(4, [outil, outil]), groupe(1, [rejouee, rejouee]), groupe(2, [outil, rejouee])],
    });
    expect(taux).toEqual({ candidates: 7, candidatesRejouees: 3, groupes: 3, groupesRejoues: 2 });
  });

  it('peut être NUL : tout échec d’outillage (fiche 04) et aucune tentative (fiche 05, échéance) donnent 0', () => {
    // Le contrôle qui peut échouer : une fonction qui compterait les
    // tentatives, ou les groupes, rendrait autre chose que zéro ici.
    expect(tauxRejouabilite({ groupes: [groupe(8, [outil, outil]), groupe(13, [])] })).toEqual({
      candidates: 21,
      candidatesRejouees: 0,
      groupes: 2,
      groupesRejoues: 0,
    });
  });

  it('sans candidate, 0/0 — un scan sain n’a rien à rejouer, et cela se lit tel quel', () => {
    expect(tauxRejouabilite({})).toEqual({ candidates: 0, candidatesRejouees: 0, groupes: 0, groupesRejoues: 0 });
    expect(tauxRejouabilite({ groupes: [] }).candidates).toBe(0);
  });

  it('une tentative rejouée mais NON reproduite compte comme rejouée : la rejouabilité n’est pas le verdict', () => {
    // fiche 03 : les rejeux de lenteur ont tourné (echecOutillage false) sans
    // rien mesurer — c'est C-04, un autre défaut, qui ne doit pas se cacher ici.
    const taux = tauxRejouabilite({ groupes: [groupe(2, [{ echecOutillage: false }, { echecOutillage: false }])] });
    expect(taux.candidatesRejouees).toBe(2);
  });
});
